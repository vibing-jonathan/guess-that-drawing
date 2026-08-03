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
  { name: "small-mobile-portrait", width: 320, height: 568 },
  { name: "mobile-portrait-compact", width: 360, height: 640 },
  { name: "mobile-portrait", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile-landscape", width: 844, height: 390 },
] as const;

const PROFILE_VIEWPORTS = [
  { name: "small-mobile-portrait", width: 320, height: 568 },
  { name: "mobile-portrait-compact", width: 360, height: 640 },
  { name: "mobile-portrait", width: 390, height: 844 },
  { name: "small-mobile-landscape", width: 568, height: 320 },
  { name: "mobile-landscape", width: 844, height: 390 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "short-desktop", width: 1280, height: 720 },
  { name: "reported-tall-desktop", width: 1324, height: 1280 },
  { name: "common-laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "large-desktop", width: 1920, height: 1080 },
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

async function expectHomeActionsSeparated(page: Page) {
  const overlapArea = await page.locator(".home-actions").evaluate((actions) => {
    const buttons = [...actions.querySelectorAll<HTMLElement>(".button")];
    if (buttons.length !== 2) return Number.POSITIVE_INFINITY;
    const [first, second] = buttons.map((button) =>
      button.getBoundingClientRect(),
    );
    const overlapWidth = Math.max(
      0,
      Math.min(first!.right, second!.right) - Math.max(first!.left, second!.left),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(first!.bottom, second!.bottom) - Math.max(first!.top, second!.top),
    );
    return overlapWidth * overlapHeight;
  });
  expect(overlapArea, "home actions overlap").toBe(0);
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

async function expectPlayerRowsContained(page: Page) {
  const rows = await page.locator(".player-row:visible").evaluateAll((elements) =>
    elements.map((element) => {
      const row = element as HTMLElement;
      const rowRect = row.getBoundingClientRect();
      const identity = row.querySelector<HTMLElement>(
        ".player-row__identity",
      );
      const outsideChildren = [...row.children].flatMap((child) => {
        const target = child as HTMLElement;
        const style = getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return [];
        }
        return rect.left < rowRect.left - 1 || rect.right > rowRect.right + 1
          ? [target.className || target.tagName]
          : [];
      });
      return {
        identityOverflow: identity
          ? identity.scrollWidth - identity.clientWidth
          : 0,
        outsideChildren,
      };
    }),
  );

  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.identityOverflow).toBeLessThanOrEqual(1);
    expect(row.outsideChildren).toEqual([]);
  }
}

test.describe("responsive and accessible setup flow", () => {
  test("keeps setup cards inside balanced mobile margins", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const routes = [
      { path: "/profile?next=/create", surfaces: ".avatar-stage, .avatar-editor" },
      { path: "/create", surfaces: ".mode-card" },
      { path: "/themes", surfaces: ".theme-card" },
      { path: "/review", surfaces: ".review-card, .setup-summary" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      const geometry = await page.evaluate((surfaceSelector) => {
        const stage = document.querySelector<HTMLElement>(
          ".setup-flow__stage",
        );
        if (!stage) return null;
        const stageBounds = stage.getBoundingClientRect();
        const stageStyle = getComputedStyle(stage);
        const paddingStart = Number.parseFloat(stageStyle.paddingInlineStart);
        const paddingEnd = Number.parseFloat(stageStyle.paddingInlineEnd);
        return {
          paddingStart,
          paddingEnd,
          contentLeft: stageBounds.left + paddingStart,
          contentRight: stageBounds.right - paddingEnd,
          surfaces: [...document.querySelectorAll<HTMLElement>(surfaceSelector)].map(
            (surface) => {
              const bounds = surface.getBoundingClientRect();
              return { left: bounds.left, right: bounds.right };
            },
          ),
        };
      }, route.surfaces);

      expect(geometry, `${route.path} stage geometry`).not.toBeNull();
      expect(
        Math.abs(geometry!.paddingStart - geometry!.paddingEnd),
        `${route.path} balanced stage padding`,
      ).toBeLessThanOrEqual(1);
      expect(geometry!.paddingStart, `${route.path} visible stage inset`).toBeGreaterThanOrEqual(12);
      expect(geometry!.surfaces.length, `${route.path} setup surfaces`).toBeGreaterThan(0);
      for (const surface of geometry!.surfaces) {
        expect(surface.left, `${route.path} surface left edge`).toBeGreaterThanOrEqual(
          geometry!.contentLeft - 1,
        );
        expect(surface.right, `${route.path} surface right edge`).toBeLessThanOrEqual(
          geometry!.contentRight + 1,
        );
      }
      await expectNoHorizontalOverflow(page);
    }

    await page.goto("/profile?next=/create");
    const selectedBefore = await page
      .getByRole("radio", { checked: true })
      .textContent();
    await page.getByRole("button", { name: "Surprise me" }).click();
    await expect
      .poll(() => page.getByRole("radio", { checked: true }).textContent())
      .not.toBe(selectedBefore);
  });

  test("room creation steps reset the document scroll position", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/create");

    const nextStep = page.getByRole("button", { name: "Choose a theme" });
    await nextStep.scrollIntoViewIfNeeded();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    await nextStep.click();

    await expect(page).toHaveURL(/\/themes$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator("#main-content")).toBeFocused();
  });

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
    const routes = [
      "/",
      "/profile",
      "/create",
      "/join",
      "/themes",
      "/themes/new",
      "/review",
    ];
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
      if (viewport.width <= 390) {
        await page.goto("/create");
        const stage = page.locator(".setup-flow__stage");
        await expect(stage).toBeVisible();
        expect(
          await stage.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              overflowY: style.overflowY,
              overscrollBehaviorY: style.overscrollBehaviorY,
            };
          }),
          `${viewport.name} must leave vertical scrolling to the document`,
        ).toEqual({ overflowY: "visible", overscrollBehaviorY: "auto" });
        const stageBox = await stage.boundingBox();
        expect(stageBox).not.toBeNull();
        await page.mouse.move(
          stageBox!.x + stageBox!.width / 2,
          Math.min(stageBox!.y + stageBox!.height / 3, viewport.height - 40),
        );
        await page.mouse.wheel(0, viewport.height);
        await expect
          .poll(() => page.evaluate(() => window.scrollY))
          .toBeGreaterThan(0);
      }
      await page.goto("/");
      await expectHomeActionsSeparated(page);
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
    const fontFamilies = await page.evaluate(() => ({
      display: getComputedStyle(document.querySelector("h1")!).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
    }));
    expect(fontFamilies.display).toContain("Barlow Condensed");
    expect(fontFamilies.body).toContain("Work Sans Variable");
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
    await expect(page.getByRole("button", { name: "Surprise me" })).toBeFocused();
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

  test("keeps the Live Comics Desk setup flow and form spacing intact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1205, height: 1280 });

    const frameGeometry: Array<{
      frame: { x: number; y: number; width: number; height: number };
      progress: { x: number; y: number; width: number };
      actions: { y: number; right: number };
    }> = [];
    for (const route of [
      "/profile?next=/create",
      "/create",
      "/themes",
      "/themes/new",
      "/review",
    ]) {
      await page.goto(route);
      const frame = await page.locator(".setup-frame").boundingBox();
      const progress = await page.locator(".setup-steps").boundingBox();
      const actions = await page.locator(".setup-frame__actions").boundingBox();
      expect(frame).not.toBeNull();
      expect(progress).not.toBeNull();
      expect(actions).not.toBeNull();
      frameGeometry.push({
        frame: {
          x: Math.round(frame!.x),
          y: Math.round(frame!.y),
          width: Math.round(frame!.width),
          height: Math.round(frame!.height),
        },
        progress: {
          x: Math.round(progress!.x),
          y: Math.round(progress!.y),
          width: Math.round(progress!.width),
        },
        actions: {
          y: Math.round(actions!.y),
          right: Math.round(actions!.x + actions!.width),
        },
      });
    }
    const baselineFrame = frameGeometry[0]!;
    for (const geometry of frameGeometry) {
      expect(Math.abs(geometry.frame.x - baselineFrame.frame.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.frame.width - baselineFrame.frame.width)).toBeLessThanOrEqual(1);
      expect(geometry.progress.x).toBeGreaterThanOrEqual(geometry.frame.x);
      expect(
        geometry.progress.x + geometry.progress.width,
      ).toBeLessThanOrEqual(geometry.frame.x + geometry.frame.width + 1);
      expect(geometry.actions.right).toBeLessThanOrEqual(
        geometry.frame.x + geometry.frame.width + 1,
      );
      expect(geometry.actions.y).toBeGreaterThan(geometry.progress.y);
    }

    await page.goto("/profile?next=/create");
    await expect(
      page.locator('ol[aria-label="Step 1 of 4"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Avatar layers" }),
    ).toBeVisible();

    await page.goto("/create");
    await expect(
      page.locator('ol[aria-label="Step 2 of 4"]'),
    ).toBeVisible();
    const settingsGrid = await page.locator(".settings-grid").boundingBox();
    const privacyBanner = await page.locator(".settings-form .banner").boundingBox();
    expect(settingsGrid).not.toBeNull();
    expect(privacyBanner).not.toBeNull();
    expect(privacyBanner!.y).toBeGreaterThanOrEqual(
      settingsGrid!.y + settingsGrid!.height,
    );
    const settingsControlTops = await page
      .locator(".settings-grid .field select")
      .evaluateAll((controls) =>
        controls.map((control) =>
          Math.round(control.getBoundingClientRect().top),
        ),
      );
    expect(settingsControlTops[0]).toBe(settingsControlTops[1]);
    expect(settingsControlTops[2]).toBe(settingsControlTops[3]);

    await page.goto("/themes");
    await expect(
      page.locator('ol[aria-label="Step 3 of 4"]'),
    ).toBeVisible();

    await page.goto("/themes/new");
    await expect(
      page.locator('ol[aria-label="Step 3 of 4"]'),
    ).toBeVisible();

    await page.goto("/review");
    await expect(
      page.locator('ol[aria-label="Step 4 of 4"]'),
    ).toBeVisible();

    await page.goto("/join");
    const codeField = await page
      .locator(".join-card .field")
      .filter({ has: page.locator("#join-code") })
      .boundingBox();
    const nameField = await page
      .locator(".join-card .field")
      .filter({ has: page.locator("#join-name") })
      .boundingBox();
    const identity = await page.locator(".join-identity").boundingBox();
    expect(codeField).not.toBeNull();
    expect(nameField).not.toBeNull();
    expect(identity).not.toBeNull();
    expect(nameField!.y).toBeGreaterThanOrEqual(
      codeField!.y + codeField!.height,
    );
    expect(identity!.y).toBeGreaterThanOrEqual(
      nameField!.y + nameField!.height,
    );
  });

  test("aligns every setup frame at every acceptance viewport", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const routes = [
      "/create",
      "/profile?next=/create",
      "/themes",
      "/themes/new",
      "/review",
    ];

    for (const viewport of PROFILE_VIEWPORTS) {
      await test.step(viewport.name, async () => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });

        let baseline:
          | {
              frame: {
                x: number;
                y: number;
                width: number;
                height: number;
              };
              progress: {
                x: number;
                y: number;
                width: number;
                height: number;
              };
              actions: {
                x: number;
                width: number;
                right: number;
                bottom: number;
              };
            }
          | undefined;

        for (const route of routes) {
          await page.goto(route);
          await page.evaluate(async () => {
            await document.fonts.ready;
          });
          const geometry = await page.evaluate(() => {
            const rect = (selector: string) => {
              const bounds = document
                .querySelector<HTMLElement>(selector)!
                .getBoundingClientRect();
              return {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                right: bounds.right,
                bottom: bounds.bottom,
              };
            };
            const frame = rect(".setup-frame");
            const progress = rect(".setup-steps");
            const actions = rect(".setup-frame__actions");
            return {
              frame,
              progress,
              actions: {
                x: actions.x,
                width: actions.width,
                right: actions.right,
                bottom: actions.bottom,
              },
              document: {
                clientWidth: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth,
                clientHeight: document.documentElement.clientHeight,
                scrollHeight: document.documentElement.scrollHeight,
              },
            };
          });

          expect(geometry.frame.y, `${viewport.name} ${route} frame top`)
            .toBeGreaterThanOrEqual(0);
          expect(
            geometry.frame.bottom,
            `${viewport.name} ${route} frame document containment`,
          ).toBeLessThanOrEqual(geometry.document.scrollHeight + 1);
          expect(
            geometry.document.scrollWidth - geometry.document.clientWidth,
            `${viewport.name} ${route} horizontal overflow`,
          ).toBeLessThanOrEqual(1);
          if (!baseline) {
            baseline = geometry;
            continue;
          }

          for (const key of ["x", "width"] as const) {
            expect(
              Math.abs(geometry.frame[key] - baseline.frame[key]),
              `${viewport.name} ${route} frame ${key}`,
            ).toBeLessThanOrEqual(1);
            expect(
              Math.abs(geometry.progress[key] - baseline.progress[key]),
              `${viewport.name} ${route} progress ${key}`,
            ).toBeLessThanOrEqual(1);
          }
          for (const key of ["x", "width", "right"] as const) {
            expect(
              Math.abs(geometry.actions[key] - baseline.actions[key]),
              `${viewport.name} ${route} footer ${key}`,
            ).toBeLessThanOrEqual(1);
          }
          expect(
            geometry.progress.x,
            `${viewport.name} ${route} progress left containment`,
          ).toBeGreaterThanOrEqual(geometry.frame.x);
          expect(
            geometry.progress.x + geometry.progress.width,
            `${viewport.name} ${route} progress right containment`,
          ).toBeLessThanOrEqual(geometry.frame.x + geometry.frame.width + 1);
          expect(
            geometry.actions.bottom,
            `${viewport.name} ${route} footer containment`,
          ).toBeLessThanOrEqual(geometry.frame.bottom + 1);
        }
      });
    }
  });

  test("contains a maximum-length profile name at every acceptance viewport", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const maximumName = "W".repeat(24);

    for (const viewport of PROFILE_VIEWPORTS) {
      await test.step(viewport.name, async () => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto("/profile?next=/create");

        const nameField = page.getByLabel("Display name");
        await expect(nameField).toHaveAttribute("maxlength", "24");
        await nameField.fill(maximumName);
        await expect(nameField).toHaveValue(maximumName);

        const containment = await page.evaluate(() => {
          const preview = document.querySelector<HTMLElement>(
            ".avatar-stage",
          );
          const previewName = document.querySelector<HTMLElement>(
            ".avatar-stage__identity > strong",
          );
          const controls =
            document.querySelector<HTMLElement>(".avatar-editor");
          const visible = (element: HTMLElement | null) => {
            if (!element) return false;
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              bounds.width > 0 &&
              bounds.height > 0
            );
          };
          const bounds = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            };
          };

          const previewVisible = visible(preview);
          if (!previewVisible || !preview || !previewName || !controls) {
            return {
              previewVisible,
              nameContained: true,
              regionsOverlap: false,
              previewOverflow: 0,
              nameStyle: null,
            };
          }

          const previewBounds = bounds(preview);
          const nameBounds = bounds(previewName);
          const controlsBounds = bounds(controls);
          const regionsOverlap =
            previewBounds.left < controlsBounds.right &&
            previewBounds.right > controlsBounds.left &&
            previewBounds.top < controlsBounds.bottom &&
            previewBounds.bottom > controlsBounds.top;
          const nameStyle = getComputedStyle(previewName);

          return {
            previewVisible,
            nameContained:
              nameBounds.left >= previewBounds.left - 1 &&
              nameBounds.right <= previewBounds.right + 1 &&
              nameBounds.top >= previewBounds.top - 1 &&
              nameBounds.bottom <= previewBounds.bottom + 1,
            regionsOverlap,
            previewOverflow: preview.scrollWidth - preview.clientWidth,
            nameStyle: {
              overflow: nameStyle.overflow,
              textOverflow: nameStyle.textOverflow,
              whiteSpace: nameStyle.whiteSpace,
            },
          };
        });

        if (containment.previewVisible) {
          expect(containment.nameContained).toBe(true);
          expect(containment.regionsOverlap).toBe(false);
          expect(containment.previewOverflow).toBeLessThanOrEqual(1);
          expect(containment.nameStyle).toEqual({
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          });
        }
        await expectNoHorizontalOverflow(page);
        const saveProfile = page.getByRole("button", { name: "Save profile" });
        await saveProfile.scrollIntoViewIfNeeded();
        await expect(saveProfile).toBeInViewport();
      });
    }
  });

  test("keeps complete profile controls reachable at every acceptance viewport", async ({
    page,
  }) => {
    for (const viewport of PROFILE_VIEWPORTS) {
      await test.step(viewport.name, async () => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto("/profile?next=/create");

        const frame = await page.locator(".setup-frame").boundingBox();
        const overflow = await page.evaluate(() => {
          const frame = document.querySelector<HTMLElement>(".setup-frame");
          const stage = document.querySelector<HTMLElement>(
            ".setup-flow__stage",
          );
          return {
            document: {
              clientHeight: document.documentElement.clientHeight,
              scrollHeight: document.documentElement.scrollHeight,
            },
            frame: {
              clientWidth: frame?.clientWidth ?? 0,
              scrollWidth: frame?.scrollWidth ?? 0,
            },
            stage: {
              clientHeight: stage?.clientHeight ?? 0,
              scrollHeight: stage?.scrollHeight ?? 0,
            },
          };
        });

        expect(frame, `${viewport.name} profile frame`).not.toBeNull();
        expect(frame!.y, `${viewport.name} frame top`).toBeGreaterThanOrEqual(0);
        expect(
          overflow.document.scrollHeight,
          `${viewport.name} document owns vertical scrolling`,
        ).toBeGreaterThanOrEqual(overflow.document.clientHeight);
        expect(
          overflow.stage.scrollHeight - overflow.stage.clientHeight,
          `${viewport.name} stage has no nested vertical scroll`,
        ).toBeLessThanOrEqual(1);
        expect(
          overflow.frame.scrollWidth - overflow.frame.clientWidth,
          `${viewport.name} frame horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        await expect(page.locator("#profile-form")).toBeVisible();
        const saveProfile = page.getByRole("button", { name: "Save profile" });
        await saveProfile.scrollIntoViewIfNeeded();
        await expect(saveProfile).toBeInViewport();
        await expectNoHorizontalOverflow(page);
        const tabpanel = page.getByRole("tabpanel");
        await tabpanel.scrollIntoViewIfNeeded();
        await expect(tabpanel).toBeInViewport();
        expect(
          await undersizedTargets(page),
          `${viewport.name} has undersized profile controls`,
        ).toEqual([]);
      });
    }
  });
});

test.describe("mobile setup interaction states", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chromium",
      "Touch interaction state is covered in the mobile browser project.",
    );
  });

  test("keeps Surprise me legible after a tap", async ({ page }) => {
    await page.goto("/profile?next=/create");
    const surprise = page.getByRole("button", { name: "Surprise me" });
    const restingStyle = await surprise.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
      };
    });

    await surprise.click();

    await expect
      .poll(() =>
        surprise.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            color: style.color,
          };
        }),
      )
      .toEqual(restingStyle);
  });
});

test.describe("responsive game overlays", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Geometry is covered once in Chromium.",
    );
  });

  test("keeps long player rows contained and anchors word choice near the game", async ({
    browser,
    page: host,
  }) => {
    test.setTimeout(70_000);
    const code = await createRoom(host, "W".repeat(24), {
      cycles: 1,
      wordSelectionSeconds: 30,
    });
    const guest = await createPlayerContext(browser);

    try {
      await joinRoom(guest.page, code, "M".repeat(24));

      for (const width of [1440, 1181, 1100, 1024]) {
        await host.setViewportSize({ width, height: 900 });
        await expectPlayerRowsContained(host);
        await expectNoHorizontalOverflow(host);
      }

      await host.setViewportSize({ width: 1324, height: 1280 });
      await startMatch(host);

      for (const viewport of [
        { width: 1324, height: 1280 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await host.setViewportSize(viewport);
        const dialog = host.getByRole("dialog", { name: "Choose a word" });
        await expect(dialog).toBeVisible();
        const geometry = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            borderBottomWidth: Number.parseFloat(style.borderBottomWidth),
            borderRadius: Number.parseFloat(style.borderTopLeftRadius),
          };
        });

        expect(geometry.left).toBeGreaterThanOrEqual(7);
        expect(geometry.right).toBeLessThanOrEqual(viewport.width - 7);
        expect(geometry.top).toBeLessThan(viewport.height * 0.28);
        expect(geometry.bottom).toBeLessThanOrEqual(viewport.height - 7);
        expect(geometry.borderBottomWidth).toBeGreaterThan(0);
        expect(geometry.borderRadius).toBeGreaterThan(0);
        await expectNoHorizontalOverflow(host);
      }

      await host.setViewportSize({ width: 1324, height: 1280 });
      await expectPlayerRowsContained(host);
    } finally {
      await guest.context.close();
    }
  });

  test("keeps the Phone writing phase contained, keyboard-ready, and reduced-motion safe", async ({
    browser,
    page: host,
  }, testInfo) => {
    test.setTimeout(90_000);
    const code = await createRoom(host, "Phone Host", {
      mode: "phone",
      phonePlayerCap: 4,
      phoneTextSeconds: 30,
      phoneDrawingSeconds: 60,
    });
    const guests = await Promise.all(
      ["Phone Guest One", "Phone Guest Two", "Phone Guest Three"].map(() =>
        createPlayerContext(browser),
      ),
    );
    const maximumText = `${"A lantern-lit clockwork whale carries tiny musicians above the harbor. "
      .repeat(4)
      .slice(0, 179)}!`;

    try {
      await Promise.all(
        guests.map(({ page }, index) =>
          joinRoom(
            page,
            code,
            ["Phone Guest One", "Phone Guest Two", "Phone Guest Three"][
              index
            ]!,
          ),
        ),
      );
      await host.emulateMedia({ reducedMotion: "reduce" });
      await startMatch(host, "phone");

      for (const viewport of VIEWPORTS) {
        await test.step(viewport.name, async () => {
          await host.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await expect(
            host.getByRole("heading", { name: "Write the opening" }),
          ).toBeVisible();
          await expect(
            host.locator('ol[aria-label="Phase 1 of 4"]'),
          ).toBeVisible();
          await expect(
            host.locator("main[data-phone-excludes='chat scores']"),
          ).toBeVisible();
          await expect(
            host.getByRole("region", { name: "Guesses & chat" }),
          ).toHaveCount(0);

          const entry = host.getByLabel("Write one clear, drawable scene");
          await expect(entry).toHaveAttribute("maxlength", "180");
          await entry.fill(maximumText);
          await entry.scrollIntoViewIfNeeded();
          await expect(entry).toBeInViewport();
          await expect(host.getByText("180/180", { exact: true })).toBeVisible();
          await expectNoHorizontalOverflow(host);

          const containment = await host.evaluate(() => {
            const within = (
              child: DOMRect,
              parent: DOMRect,
              allowance = 1,
            ) =>
              child.left >= parent.left - allowance &&
              child.right <= parent.right + allowance;
            const play = document
              .querySelector<HTMLElement>(".phone-play-column")
              ?.getBoundingClientRect();
            const entry = document
              .querySelector<HTMLTextAreaElement>("#phone-text-entry")
              ?.getBoundingClientRect();
            const textarea =
              document.querySelector<HTMLTextAreaElement>(
                "#phone-text-entry",
              );
            const rows = [
              ...document.querySelectorAll<HTMLElement>(
                ".phone-roster li",
              ),
            ].map((row) => {
              const rowBounds = row.getBoundingClientRect();
              return [...row.children].every((child) => {
                const bounds = child.getBoundingClientRect();
                return within(bounds, rowBounds);
              });
            });
            const parseDurations = (value: string) =>
              value.split(",").map((duration) => {
                const normalized = duration.trim();
                return normalized.endsWith("ms")
                  ? Number.parseFloat(normalized)
                  : Number.parseFloat(normalized) * 1_000;
              });
            const maximumMotionMs = Math.max(
              0,
              ...[
                ...document.querySelectorAll<HTMLElement>(
                  ".phone-page, .phone-page *",
                ),
              ].flatMap((element) => {
                const style = getComputedStyle(element);
                return [
                  ...parseDurations(style.animationDuration),
                  ...parseDurations(style.transitionDuration),
                ];
              }),
            );
            return {
              entryWithinPlay: Boolean(
                play && entry && within(entry, play),
              ),
              entryOverflow: textarea
                ? textarea.scrollWidth - textarea.clientWidth
                : 0,
              rowsContained: rows.every(Boolean),
              maximumMotionMs,
            };
          });
          expect(containment.entryWithinPlay).toBe(true);
          expect(containment.entryOverflow).toBeLessThanOrEqual(1);
          expect(containment.rowsContained).toBe(true);
          expect(containment.maximumMotionMs).toBeLessThanOrEqual(0.1);

          await testInfo.attach(`phone-writing-${viewport.name}`, {
            body: await host.screenshot({ fullPage: true }),
            contentType: "image/png",
          });
        });
      }

      await host.setViewportSize({ width: 390, height: 844 });
      const entry = host.getByLabel("Write one clear, drawable scene");
      await entry.focus();
      await expect(entry).toBeFocused();
      await entry.press("Control+Enter");
      await expect(
        host
          .locator(".phone-submitted-state")
          .getByText("Submitted", { exact: true }),
      ).toBeVisible();

      const accessibility = await new AxeBuilder({ page: host })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(
        accessibility.violations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
    } finally {
      await Promise.all(guests.map(({ context }) => context.close()));
    }
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
