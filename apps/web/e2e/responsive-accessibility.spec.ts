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

  test("keeps the Open Design setup flow and form spacing intact", async ({
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
    expect(frameGeometry).toEqual(
      Array.from({ length: frameGeometry.length }, () => frameGeometry[0]),
    );

    await page.goto("/profile?next=/create");
    await expect(
      page.locator('ol[aria-label="Step 1 of 4"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: "Avatar background" }),
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
            `${viewport.name} ${route} frame bottom`,
          ).toBeLessThanOrEqual(viewport.height + 1);
          expect(
            geometry.document.scrollWidth - geometry.document.clientWidth,
            `${viewport.name} ${route} horizontal overflow`,
          ).toBeLessThanOrEqual(1);
          if (!baseline) {
            baseline = geometry;
            continue;
          }

          for (const key of ["x", "y", "width", "height"] as const) {
            expect(
              Math.abs(geometry.frame[key] - baseline.frame[key]),
              `${viewport.name} ${route} frame ${key}`,
            ).toBeLessThanOrEqual(1);
            expect(
              Math.abs(geometry.progress[key] - baseline.progress[key]),
              `${viewport.name} ${route} progress ${key}`,
            ).toBeLessThanOrEqual(1);
          }
          for (const key of ["x", "width", "right", "bottom"] as const) {
            expect(
              Math.abs(geometry.actions[key] - baseline.actions[key]),
              `${viewport.name} ${route} footer ${key}`,
            ).toBeLessThanOrEqual(1);
          }
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
            ".avatar-preview-panel",
          );
          const previewName = document.querySelector<HTMLElement>(
            ".avatar-preview-panel > strong",
          );
          const controls =
            document.querySelector<HTMLElement>(".profile-controls");
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

        if (viewport.height <= 479) {
          expect(containment.previewVisible).toBe(false);
        } else {
          expect(containment.previewVisible).toBe(true);
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
        await expect(
          page.getByRole("button", { name: "Save profile" }),
        ).toBeInViewport();
      });
    }
  });

  test("contains the complete profile card without scrolling at every acceptance viewport", async ({
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
          const frameRect = frame?.getBoundingClientRect();
          const outsideFrame = frameRect
            ? [...frame!.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled])',
              )].flatMap((control) => {
                const rect = control.getBoundingClientRect();
                const style = getComputedStyle(control);
                if (
                  style.display === "none" ||
                  style.visibility === "hidden" ||
                  rect.width === 0 ||
                  rect.height === 0
                ) {
                  return [];
                }
                const outside =
                  rect.left < frameRect.left - 1 ||
                  rect.right > frameRect.right + 1 ||
                  rect.top < frameRect.top - 1 ||
                  rect.bottom > frameRect.bottom + 1;
                return outside
                  ? [
                      control.getAttribute("aria-label") ||
                        control.textContent?.trim() ||
                        control.tagName,
                    ]
                  : [];
              })
            : ["Missing profile frame"];
          return {
            document: {
              clientHeight: document.documentElement.clientHeight,
              scrollHeight: document.documentElement.scrollHeight,
            },
            frame: {
              clientWidth: frame?.clientWidth ?? 0,
              scrollWidth: frame?.scrollWidth ?? 0,
              outsideControls: outsideFrame,
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
          frame!.y + frame!.height,
          `${viewport.name} frame bottom`,
        ).toBeLessThanOrEqual(viewport.height);
        expect(
          overflow.document.scrollHeight - overflow.document.clientHeight,
          `${viewport.name} document overflow`,
        ).toBeLessThanOrEqual(1);
        expect(
          overflow.stage.scrollHeight - overflow.stage.clientHeight,
          `${viewport.name} stage overflow`,
        ).toBeLessThanOrEqual(1);
        expect(
          overflow.frame.scrollWidth - overflow.frame.clientWidth,
          `${viewport.name} frame horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        expect(
          overflow.frame.outsideControls,
          `${viewport.name} clipped profile controls`,
        ).toEqual([]);
        await expect(page.locator("#profile-form")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Save profile" }),
        ).toBeInViewport();
        await expectNoHorizontalOverflow(page);
        expect(
          await undersizedTargets(page),
          `${viewport.name} has undersized profile controls`,
        ).toEqual([]);
      });
    }
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
