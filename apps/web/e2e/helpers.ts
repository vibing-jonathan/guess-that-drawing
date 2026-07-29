import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

export async function createPlayerContext(
  browser: Browser,
  viewport = { width: 1280, height: 900 },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport });
  return { context, page: await context.newPage() };
}

export async function createRoom(
  page: Page,
  name: string,
  options: { cycles?: number; wordSelectionSeconds?: number } = {},
): Promise<string> {
  await page.goto("/profile?next=/create");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page
    .getByLabel("Drawing cycles")
    .selectOption(String(options.cycles ?? 1));
  await page.getByLabel("Turn time").selectOption("45");
  await page
    .getByLabel("Word selection")
    .selectOption(String(options.wordSelectionSeconds ?? 10));
  await page.getByRole("button", { name: "Choose a theme" }).click();
  await expect(page).toHaveURL(/\/themes$/);
  await page.getByTestId("review-room-submit").click();
  await expect(page).toHaveURL(/\/review$/);
  await page.getByTestId("create-room-submit").click();
  await expect(page.getByText("Host lobby", { exact: true })).toBeVisible();
  const code = (await page.getByTestId("room-code").textContent())?.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  return code!;
}

export async function joinRoom(
  page: Page,
  code: string,
  name: string,
  options: { expectLobby?: boolean } = {},
): Promise<void> {
  await page.goto(`/join?code=${code}`);
  await page.getByLabel("Display name").fill(name);
  await page.getByTestId("join-submit").click();
  if (options.expectLobby ?? true) {
    await expect(page.getByText("Guest lobby", { exact: true })).toBeVisible();
    await expect(page.getByTestId("room-code")).toHaveText(code);
  } else {
    await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  }
}

export async function startMatch(host: Page): Promise<void> {
  const start = host.getByTestId("start-game");
  await expect(start).toBeEnabled();
  await start.click();
  await expect(
    host.getByRole("heading", { name: "Choose a word" }),
  ).toBeVisible();
}

export async function chooseDrawableWord(drawer: Page): Promise<string> {
  const dialog = drawer.getByRole("dialog", { name: "Choose a word" });
  await expect(dialog).toBeVisible();
  const choices = drawer.locator('[data-testid^="word-choice-"]');
  await expect(choices).toHaveCount(3);
  const labels = await choices.locator("span").allTextContents();
  const selectedIndex = Math.max(
    0,
    labels.findIndex((word) => word.trim().length >= 4),
  );
  const answer = labels[selectedIndex]!.trim();
  await choices.nth(selectedIndex).click();
  await drawer
    .getByRole("button", { name: "Draw selected word" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(drawer.getByLabel("Editable drawing surface")).toBeVisible();
  return answer;
}

export function closeGuess(answer: string): string {
  const last = answer.at(-1)?.toLocaleLowerCase() === "z" ? "y" : "z";
  return `${answer.slice(0, -1)}${last}`;
}

export async function submitGuess(page: Page, text: string): Promise<void> {
  const composer = page.getByTestId("guess-composer");
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
}

export async function drawStroke(page: Page): Promise<void> {
  const canvas = page.getByTestId("drawing-canvas-main");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width * 0.28;
  const startY = box!.y + box!.height * 0.4;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width * 0.7,
    box!.y + box!.height * 0.62,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: /Clear canvas/i }),
  ).toBeEnabled();
}

export async function opaquePixelCount(page: Page): Promise<number> {
  return page.getByTestId("drawing-canvas-main").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (!context) return 0;
    const pixels = context.getImageData(
      0,
      0,
      target.width,
      target.height,
    ).data;
    let opaque = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index]! > 0) opaque += 1;
    }
    return opaque;
  });
}
