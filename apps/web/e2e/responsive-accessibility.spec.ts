import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  chooseDrawableWord,
  createPlayerContext,
  createRoom,
  joinRoom,
  startMatch,
} from "./helpers";

const VIEWPORTS = [
  { name: "mobile-portrait", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile-landscape", width: 844, height: 390 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth - dimensions.clientWidth,
    `horizontal overflow: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(1);
}

async function undersizedTargets(page: Page) {
  return page
    .locator(
      'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled])',
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0;
        if (!visible || (rect.width >= 44 && rect.height >= 44)) return [];
        return [
          {
            target:
              element.getAttribute("aria-label") ||
              element.textContent?.trim().slice(0, 60) ||
              element.tagName,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        ];
      }),
    );
}

test.describe("responsive and accessible setup flow", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Viewport matrix is run once in Chromium.",
    );
  });

  test("fits reviewed setup screens at every acceptance viewport", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const routes = ["/", "/profile", "/create", "/join", "/themes", "/themes/new"];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("#main-content")).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
      await page.goto("/");
      expect(
        await undersizedTargets(page),
        `${viewport.name} has undersized home controls`,
      ).toEqual([]);
      await testInfo.attach(`home-${viewport.name}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
  });

  test("supports keyboard focus and has no basic WCAG A/AA violations", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#main-content")).toBeFocused();
    await page.keyboard.press("Tab");
    const create = page.getByRole("button", { name: "Create a room" });
    await expect(create).toBeFocused();
    expect(
      await create.evaluate((element) => getComputedStyle(element).outlineWidth),
    ).not.toBe("0px");
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Display name")).toBeFocused();

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      result.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target.join(" ")),
      })),
    ).toEqual([]);
  });
});

test.describe("mobile drawing acceptance", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chromium",
      "Touch drawing runs in the emulated touch project.",
    );
  });

  test("draws with touch without overflow or undersized primary controls", async ({
    browser,
    page: host,
  }) => {
    const code = await createRoom(host, "Touch Drawer", { cycles: 1 });
    const guest = await createPlayerContext(browser);
    try {
      await joinRoom(guest.page, code, "Touch Guesser");
      await startMatch(host);
      await chooseDrawableWord(host);
      await expectNoHorizontalOverflow(host);

      const canvas = host.getByTestId("drawing-canvas-main");
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      await host.touchscreen.tap(
        box!.x + box!.width / 2,
        box!.y + box!.height / 2,
      );
      await expect(
        host.getByRole("button", { name: /Clear canvas/i }),
      ).toBeEnabled();
      expect(await undersizedTargets(host)).toEqual([]);
    } finally {
      await guest.context.close();
    }
  });
});
