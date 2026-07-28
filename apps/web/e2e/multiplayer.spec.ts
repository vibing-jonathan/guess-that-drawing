import { expect, test } from "@playwright/test";

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
        host.getByText("Host lobby", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(host.getByTestId("room-code")).toHaveText(code);
      await expect(host.getByText("Priya", { exact: false }).first()).toBeVisible();

      await context.setOffline(true);
      await expect(
        host.getByText(/Reconnecting|Offline/, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await context.setOffline(false);
      await expect(
        host.getByText("Connected", { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.setOffline(false);
      await guestPlayer.context.close();
    }
  });

  test("plays a complete two-player match with private close feedback", async ({
    browser,
    page: host,
  }) => {
    test.setTimeout(70_000);
    const code = await createRoom(host, "Noah", { cycles: 1 });
    const guestPlayer = await createPlayerContext(browser);
    try {
      await joinRoom(guestPlayer.page, code, "Amara");
      await startMatch(host);

      const firstAnswer = await chooseDrawableWord(host);
      await expect(guestPlayer.page.getByTestId("guess-composer")).toBeVisible();
      const near = closeGuess(firstAnswer);
      await submitGuess(guestPlayer.page, near);
      await expect(
        guestPlayer.page.getByText("Very close", { exact: true }),
      ).toBeVisible();
      await expect(host.getByText(near, { exact: true })).toHaveCount(0);

      await submitGuess(guestPlayer.page, firstAnswer);
      await expect(
        guestPlayer.page.getByRole("heading", { name: /The word was/ }),
      ).toBeVisible();

      await expect(
        guestPlayer.page.getByRole("heading", { name: "Choose a word" }),
      ).toBeVisible({ timeout: 12_000 });
      const secondAnswer = await chooseDrawableWord(guestPlayer.page);
      await submitGuess(host, secondAnswer);
      await expect(
        host.getByRole("heading", { name: /The word was/ }),
      ).toBeVisible();

      await expect(
        host.getByRole("heading", { name: /takes the table|Game complete/ }),
      ).toBeVisible({ timeout: 12_000 });
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
    await page.getByTestId("create-room-submit").click();
    await expect(page.getByText("Host lobby", { exact: true })).toBeVisible();
    await expect(
      page
        .getByLabel("Theme", { exact: true })
        .locator("option:checked"),
    ).toHaveText("E2E sketch prompts · custom");
  });

  test("lets a mid-game player join and reconstructs the current canvas", async ({
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
      await drawStroke(host);
      await expect.poll(() => opaquePixelCount(host)).toBeGreaterThan(0);

      await joinRoom(lateGuest.page, code, "Late Guesser", {
        expectLobby: false,
      });
      await expect(
        lateGuest.page.getByTestId("guess-composer"),
      ).toBeVisible();
      await expect
        .poll(() => opaquePixelCount(lateGuest.page), { timeout: 10_000 })
        .toBeGreaterThan(0);
      await expect(
        lateGuest.page.getByText("Late Guesser", { exact: false }).first(),
      ).toBeVisible();
    } finally {
      await firstGuest.context.close();
      await lateGuest.context.close();
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
