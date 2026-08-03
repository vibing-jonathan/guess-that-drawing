import { expect, test, type Page } from "@playwright/test";

import {
  chooseDrawableWord,
  closeGuess,
  createPlayerContext,
  createRoom,
  drawStroke,
  joinRoom,
  opaquePixelCount,
  startMatch,
  submitGuess,
} from "./helpers";

const PHONE_MARKER_COLORS = [
  { label: "Cobalt blue", rgb: [29, 78, 216] },
  { label: "Coral red", rgb: [216, 82, 114] },
  { label: "Teal green", rgb: [22, 130, 120] },
  { label: "Pencil yellow", rgb: [245, 190, 36] },
] as const;

async function expectActiveDrawer(page: Page, name: string): Promise<void> {
  const activeDrawer = page.locator(
    '.player-row[aria-current="true"]',
  );
  await expect(activeDrawer).toHaveCount(1);
  await expect(activeDrawer).toContainText(name);
  await expect(activeDrawer).toHaveClass(/player-row--drawer/);
}

async function expectLiveGuesserGame(
  page: Page,
  drawerName: string,
): Promise<void> {
  await expect(page.getByRole("region", { name: "Players" })).toBeVisible();
  await expect(page.getByTestId("drawing-canvas-main")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Guesses & chat" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("The drawer is choosing", { exact: true }),
  ).toHaveCount(0);
  await expectActiveDrawer(page, drawerName);
}

async function expectDrawerWordDialog(
  page: Page,
  timeout = 5_000,
): Promise<void> {
  await expect(
    page.getByRole("dialog", { name: "Choose a word" }),
  ).toBeVisible({ timeout });
  await expect(page.getByTestId("drawing-canvas-main")).toBeVisible();
}

async function expectPhonePhase(
  pages: readonly Page[],
  heading: string,
): Promise<void> {
  await Promise.all(
    pages.map((page) =>
      expect(page.getByRole("heading", { name: heading })).toBeVisible({
        timeout: 12_000,
      }),
    ),
  );
}

async function submitPhoneText(
  page: Page,
  text: string,
  action: "Submit sentence" | "Submit guess",
): Promise<void> {
  const entry = page.getByLabel(
    action === "Submit sentence"
      ? "Write one clear, drawable scene"
      : "Your private guess",
  );
  await expect(entry).toBeFocused();
  await entry.fill(text);
  const submit = page.getByRole("button", { name: action });
  await expect(submit).toBeEnabled();
  await submit.click();
}

async function drawPhoneStoryMarker(
  page: Page,
  storyIndex: number,
): Promise<void> {
  const marker = PHONE_MARKER_COLORS[storyIndex];
  if (!marker) throw new Error(`Missing Phone marker ${storyIndex}.`);
  await page
    .getByRole("radio", { name: marker.label, exact: true })
    .click();
  await drawStroke(page);
  await page.waitForTimeout(150);
  await expect(
    page.getByRole("button", { name: "Submit drawing" }),
  ).toBeEnabled();
}

async function identifyAssignedPhoneStory(page: Page): Promise<number> {
  const canvas = page.locator(
    ".phone-assigned-canvas canvas[data-testid='drawing-canvas-main']",
  );
  await expect(canvas).toBeVisible();
  const counts = await canvas.evaluate((element, colors) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (!context) return colors.map(() => 0);
    const pixels = context.getImageData(
      0,
      0,
      target.width,
      target.height,
    ).data;
    const totals = colors.map(() => 0);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if ((pixels[offset + 3] ?? 0) === 0) continue;
      colors.forEach((color, index) => {
        const distance =
          Math.abs((pixels[offset] ?? 0) - color[0]) +
          Math.abs((pixels[offset + 1] ?? 0) - color[1]) +
          Math.abs((pixels[offset + 2] ?? 0) - color[2]);
        if (distance <= 24) totals[index] = (totals[index] ?? 0) + 1;
      });
    }
    return totals;
  }, PHONE_MARKER_COLORS.map(({ rgb }) => rgb));
  const maximum = Math.max(...counts);
  expect(maximum, `marker color counts: ${counts.join(", ")}`).toBeGreaterThan(
    20,
  );
  return counts.indexOf(maximum);
}

test.describe("multiplayer acceptance", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Desktop flow is covered once; mobile behavior has a focused suite.",
    );
  });

  test("creates, joins, refreshes, and reconnects to a lobby", async ({
    browser,
    context,
    page: host,
  }) => {
    const code = await createRoom(host, "Maya", { cycles: 1 });
    const guestPlayer = await createPlayerContext(browser);
    try {
      await joinRoom(guestPlayer.page, code, "Priya");
      await expect(host.getByText("Priya", { exact: false }).first()).toBeVisible();

      await host.reload();
      await expect(
        host.getByText(/Host lobby$/).first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(host.getByTestId("room-code")).toHaveText(code);
      await expect(host.getByText("Priya", { exact: false }).first()).toBeVisible();

      await context.setOffline(true);
      await host.evaluate(() => window.dispatchEvent(new Event("offline")));
      await expect(
        host.getByText(/Reconnecting|Offline/, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await context.setOffline(false);
      await host.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(
        host.getByText("Connected", { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.setOffline(false);
      await guestPlayer.context.close();
    }
  });

  test("joins through a room link without stored credentials", async ({
    browser,
    page: host,
  }) => {
    const code = await createRoom(host, "Link Host", { cycles: 1 });
    const guestPlayer = await createPlayerContext(browser);
    try {
      await guestPlayer.page.goto(`/room/${code}`);
      await expect(
        guestPlayer.page.getByRole("heading", {
          name: "We couldn’t restore this room",
        }),
      ).toBeVisible();
      await guestPlayer.page
        .getByRole("button", { name: "Join this room" })
        .click();
      await expect(guestPlayer.page).toHaveURL(
        new RegExp(`/join\\?code=${code}$`),
      );
      await guestPlayer.page.getByLabel("Display name").fill("Link Guest");
      await guestPlayer.page.getByTestId("join-submit").click();
      await expect(
        guestPlayer.page.getByText(/Guest lobby$/).first(),
      ).toBeVisible();
      await expect(guestPlayer.page.getByTestId("room-code")).toHaveText(code);
    } finally {
      await guestPlayer.context.close();
    }
  });

  test("plays a complete two-player match with private close feedback and a seamless drawer handoff", async ({
    browser,
    page: host,
  }) => {
    test.setTimeout(70_000);
    const code = await createRoom(host, "Noah", { cycles: 1 });
    const guestPlayer = await createPlayerContext(browser);
    try {
      await joinRoom(guestPlayer.page, code, "Amara");
      await startMatch(host);
      await expectDrawerWordDialog(host);
      await expectLiveGuesserGame(guestPlayer.page, "Noah");

      const firstAnswer = await chooseDrawableWord(host);
      await expect(guestPlayer.page.getByTestId("guess-composer")).toBeVisible();
      const near = closeGuess(firstAnswer);
      await submitGuess(guestPlayer.page, near);
      await expect(
        guestPlayer.page.getByText("Very close", { exact: true }),
      ).toBeVisible();
      await expect(host.getByText(near, { exact: true })).toHaveCount(0);

      await submitGuess(guestPlayer.page, firstAnswer);
      await expectDrawerWordDialog(guestPlayer.page, 2_000);
      await expectLiveGuesserGame(host, "Amara");
      await expect(
        guestPlayer.page.getByRole("heading", { name: /The word was/ }),
      ).toHaveCount(0);

      const secondAnswer = await chooseDrawableWord(guestPlayer.page);
      await drawStroke(guestPlayer.page);
      await expect(host.getByTestId("drawing-canvas-main")).toBeVisible();
      await expect
        .poll(() => opaquePixelCount(host), { timeout: 2_000 })
        .toBeGreaterThan(0);

      await submitGuess(host, secondAnswer);
      await expect(
        host.getByRole("heading", { name: /takes the table|Game complete/ }),
      ).toBeVisible({ timeout: 2_000 });
      await expect(
        guestPlayer.page.getByRole("heading", {
          name: /takes the table|Game complete/,
        }),
      ).toBeVisible();

      await host.getByTestId("replay-match-action").click();
      await expect(
        host.getByRole("heading", { name: "Choose a word" }),
      ).toBeVisible({ timeout: 12_000 });
      await expect(
        guestPlayer.page.getByRole("heading", {
          name: /takes the table|Game complete/,
        }),
      ).toHaveCount(0);
    } finally {
      await guestPlayer.context.close();
    }
  });

  test("saves a private custom theme and creates a room with it", async ({
    page,
  }) => {
    await page.goto("/profile?next=/create");
    await page.getByLabel("Display name").fill("Theme Host");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.getByRole("button", { name: "Choose a theme" }).click();
    await page
      .getByRole("button", { name: "New custom theme" })
      .click();
    await page.getByLabel("Theme name").fill("E2E sketch prompts");
    await expect(page.getByTestId("save-custom-theme")).toBeEnabled();
    await page.getByTestId("save-custom-theme").click();
    await expect(page).toHaveURL(/\/themes$/);
    await expect(
      page.getByRole("radio", { name: /E2E sketch prompts/ }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Review room" }).click();
    await page.getByTestId("create-room-submit").click();
    await expect(page.getByText(/Host lobby$/).first()).toBeVisible();
    await expect(
      page
        .getByLabel("Theme", { exact: true })
        .locator("option:checked"),
    ).toHaveText("E2E sketch prompts · custom");
  });

  test("rejects a new player after a match has started", async ({
    browser,
    page: host,
  }) => {
    const code = await createRoom(host, "Drawer", { cycles: 1 });
    const firstGuest = await createPlayerContext(browser);
    const lateGuest = await createPlayerContext(browser);
    try {
      await joinRoom(firstGuest.page, code, "First Guesser");
      await startMatch(host);
      await chooseDrawableWord(host);

      await lateGuest.page.goto(`/join?code=${code}`);
      await lateGuest.page.getByLabel("Display name").fill("Late Guesser");
      await lateGuest.page.getByTestId("join-submit").click();
      await expect(
        lateGuest.page.getByRole("alert"),
      ).toBeVisible();
      await expect(lateGuest.page.getByRole("alert")).toContainText(
        /match is already in progress/i,
      );
      await expect(lateGuest.page).toHaveURL(
        new RegExp(`/join\\?code=${code}$`),
      );
      await expect(host.getByText("Late Guesser", { exact: false })).toHaveCount(
        0,
      );
    } finally {
      await firstGuest.context.close();
      await lateGuest.context.close();
    }
  });

  test("plays a four-player Phone match with private non-repeating assignments and a synchronized reveal", async ({
    browser,
    page: host,
  }) => {
    test.setTimeout(120_000);
    const names = ["Maya", "Noah", "Priya", "Leo"] as const;
    const openings = names.map(
      (name, index) => `Opening ${index + 1}: ${name}'s silver kite above the harbor`,
    );
    const code = await createRoom(host, names[0], {
      mode: "phone",
      phonePlayerCap: 4,
      phoneTextSeconds: 30,
      phoneDrawingSeconds: 60,
    });
    const guests = await Promise.all(
      names.slice(1).map(() => createPlayerContext(browser)),
    );
    const pages = [host, ...guests.map(({ page }) => page)];

    try {
      await Promise.all(
        guests.map(({ page }, index) =>
          joinRoom(page, code, names[index + 1]!),
        ),
      );
      await startMatch(host, "phone");
      await expectPhonePhase(pages, "Write the opening");

      await Promise.all(
        pages.map((page, index) =>
          submitPhoneText(page, openings[index]!, "Submit sentence"),
        ),
      );
      await expectPhonePhase(pages, "Draw the prompt");

      const firstAssignedStory = await Promise.all(
        pages.map(async (page, playerIndex) => {
          const prompts = page.locator(".phone-private-prompt");
          await expect(prompts).toHaveCount(1);
          const prompt = (
            await prompts.locator(":scope > div > strong").textContent()
          )?.trim();
          const storyIndex = openings.indexOf(prompt ?? "");
          expect(storyIndex, `phase 2 prompt for ${names[playerIndex]}`).toBeGreaterThanOrEqual(0);
          expect(storyIndex).not.toBe(playerIndex);
          for (const [index, opening] of openings.entries()) {
            await expect(page.getByText(opening, { exact: true })).toHaveCount(
              index === storyIndex ? 1 : 0,
            );
          }
          return storyIndex;
        }),
      );
      expect(new Set(firstAssignedStory).size).toBe(4);

      await Promise.all(
        pages.map(async (page, index) => {
          await drawPhoneStoryMarker(page, firstAssignedStory[index]!);
          await page.getByRole("button", { name: "Submit drawing" }).click();
        }),
      );
      await expectPhonePhase(pages, "Guess the drawing");

      const secondAssignedStory = await Promise.all(
        pages.map(async (page, playerIndex) => {
          await expect(page.locator(".phone-private-prompt")).toHaveCount(1);
          const storyIndex = await identifyAssignedPhoneStory(page);
          expect(storyIndex).not.toBe(playerIndex);
          expect(storyIndex).not.toBe(firstAssignedStory[playerIndex]);
          return storyIndex;
        }),
      );
      expect(new Set(secondAssignedStory).size).toBe(4);

      const guesses = secondAssignedStory.map(
        (storyIndex, playerIndex) =>
          `Guess for story ${storyIndex + 1} by ${names[playerIndex]}`,
      );
      await Promise.all(
        pages.map((page, index) =>
          submitPhoneText(page, guesses[index]!, "Submit guess"),
        ),
      );
      await expectPhonePhase(pages, "Draw the guess");

      const thirdAssignedStory = await Promise.all(
        pages.map(async (page, playerIndex) => {
          const prompts = page.locator(".phone-private-prompt");
          await expect(prompts).toHaveCount(1);
          const prompt = (
            await prompts.locator(":scope > div > strong").textContent()
          )?.trim();
          const sourceGuessIndex = guesses.indexOf(prompt ?? "");
          expect(
            sourceGuessIndex,
            `phase 4 prompt for ${names[playerIndex]}`,
          ).toBeGreaterThanOrEqual(0);
          const storyIndex = secondAssignedStory[sourceGuessIndex]!;
          expect(storyIndex).not.toBe(playerIndex);
          expect(storyIndex).not.toBe(firstAssignedStory[playerIndex]);
          expect(storyIndex).not.toBe(secondAssignedStory[playerIndex]);
          return storyIndex;
        }),
      );
      expect(new Set(thirdAssignedStory).size).toBe(4);

      await Promise.all(
        pages.map(async (page, index) => {
          await drawPhoneStoryMarker(page, thirdAssignedStory[index]!);
          await page.getByRole("button", { name: "Submit drawing" }).click();
        }),
      );

      await Promise.all(
        pages.map((page) =>
          expect(
            page.getByRole("heading", { name: "Story 1 of 4" }),
          ).toBeVisible({ timeout: 12_000 }),
        ),
      );
      await expect(host.locator(".story-entry")).toHaveCount(1);
      await expect(
        pages[1]!.getByRole("button", { name: /Reveal next|Finish summary/ }),
      ).toHaveCount(0);
      await expect(
        pages[1]!.getByText("Waiting for the host", { exact: true }),
      ).toBeVisible();

      for (let reveal = 1; reveal < 16; reveal += 1) {
        await host.getByRole("button", { name: "Reveal next" }).click();
        const storyNumber = Math.floor(reveal / 4) + 1;
        const entryCount = (reveal % 4) + 1;
        await Promise.all(
          pages.map(async (page) => {
            await expect(
              page.getByRole("heading", {
                name: `Story ${storyNumber} of 4`,
              }),
            ).toBeVisible();
            await expect(page.locator(".story-entry")).toHaveCount(entryCount);
          }),
        );
        if (entryCount === 4) {
          const kinds = await host
            .locator(".story-entry")
            .evaluateAll((entries) =>
              entries.map((entry) => entry.className),
            );
          expect(kinds).toEqual([
            expect.stringContaining("story-entry--text"),
            expect.stringContaining("story-entry--drawing"),
            expect.stringContaining("story-entry--text"),
            expect.stringContaining("story-entry--drawing"),
          ]);
          await expect(
            host.locator(".story-entry__meta strong"),
          ).toHaveCount(4);
        }
      }

      await host.getByRole("button", { name: "Finish summary" }).click();
      await Promise.all(
        pages.map((page) =>
          expect(
            page.getByRole("heading", {
              name: "Every story found an ending",
            }),
          ).toBeVisible({ timeout: 12_000 }),
        ),
      );
      await expect(
        host.getByText("There is no leaderboard in Phone Mode."),
      ).toBeVisible();

      await host.getByRole("button", { name: "Play again" }).click();
      await expectPhonePhase(pages, "Write the opening");
    } finally {
      await Promise.all(guests.map(({ context }) => context.close()));
    }
  });

  test("shows a useful error for a nonexistent room", async ({ page }) => {
    await page.goto("/join?code=AAAAAA");
    await page.getByLabel("Display name").fill("Lost Player");
    await page.getByTestId("join-submit").click();
    await expect(
      page.getByText("Room not found", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      /does not exist|expired/i,
    );
  });
});
