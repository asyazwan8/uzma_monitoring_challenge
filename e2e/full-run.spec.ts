import { expect, test, type Page } from "@playwright/test";

/**
 * A complete run with no relay: display and phone share one browser context and
 * talk over BroadcastChannel. The display's ?debug=1 exposes the true count.
 */
test("join, clear two levels, lose three lives, see results and leaderboard", async ({ browser }) => {
  const context = await browser.newContext();
  const display = await context.newPage();
  await display.setViewportSize({ width: 1920, height: 1080 });
  await display.goto("/?debug=1&speed=0.25&transport=broadcast");
  const room = (await display.getByTestId("room-code").textContent())!.trim();
  expect(room).toMatch(/^[A-Z0-9]{5}$/);
  const qr = await display.locator("[data-qr-value]").getAttribute("data-qr-value");
  expect(qr).toContain(`/play/${room}`);

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play/${room}?transport=broadcast`);

  const phase = (p: Page) => p.evaluate(() => (window as unknown as { __MC__: { state: { phase: string } } }).__MC__.state.phase);
  const truth = (p: Page) =>
    p.evaluate(() => (window as unknown as { __MC__: { state: { round: { count: number } } } }).__MC__.state.round.count);

  await expect(display.getByTestId("phone-connected")).toBeVisible();
  await phone.getByTestId("nickname-input").fill("E2E Pilot");
  await phone.getByTestId("nickname-submit").click();
  await expect(display.getByTestId("screen-instructions")).toBeVisible();
  await phone.getByTestId("start-button").click();
  await expect(display.getByTestId("tier-banner")).toBeVisible();

  // Two exact answers, then three misses: each miss costs a life and play moves on.
  for (let i = 0; i < 5; i++) {
    await expect(phone.getByTestId("answer-pad")).toBeVisible({ timeout: 30_000 });
    // View and answer in the same window: the tile is fully shown while the keypad is open,
    // and nothing is drawn over it.
    await expect(display.getByTestId("screen-game")).toHaveAttribute("data-phase", "live");
    await expect(display.getByTestId("city-map")).toHaveCSS("opacity", "1");
    await expect(display.getByTestId("intro")).toHaveCount(0);
    await expect(display.getByTestId("tier-banner")).toHaveCount(0);
    const onTop = await display.evaluate(() => {
      const map = document.querySelector('[data-testid="city-map"]')!;
      const r = map.getBoundingClientRect();
      const points = [0.08, 0.5, 0.92].flatMap((fx) => [0.08, 0.5, 0.92].map((fy) => [r.left + r.width * fx, r.top + r.height * fy]));
      return points.every(([x, y]) => map.contains(document.elementFromPoint(x, y)));
    });
    expect(onTop).toBe(true);
    const count = await truth(display);
    const answer = i < 2 ? count : count + 1;
    await expect(display.getByTestId("hud-lives")).toHaveAttribute("data-lives", String(i < 2 ? 3 : 5 - i));
    for (const d of String(answer)) await phone.locator(`[data-key="${d}"]`).click();
    await phone.getByTestId("submit-answer").click();
    await expect(display.getByTestId("reveal-result")).toHaveAttribute("data-correct", String(i < 2));
    await expect(phone.getByTestId("phone-reveal")).toHaveAttribute("data-correct", String(i < 2));
    await expect.poll(() => phase(display), { timeout: 30_000 }).not.toBe("reveal");
  }

  await expect(display.getByTestId("screen-results")).toBeVisible();
  await expect(display.getByTestId("final-accuracy")).toContainText(/Your accuracy was \d+\.\d%/);
  await expect(display.getByTestId("final-reaction")).toContainText(/Your average answer time was \d+\.\d\d s/);
  await expect(display.getByTestId("final-rank")).toHaveText("#1");
  await expect(display.getByTestId("final-lives")).toContainText("0");
  await expect(display.getByTestId("screen-results")).toContainText("Out of lives");
  await expect(phone.getByTestId("phone-results")).toContainText("#1");

  await expect(display.getByTestId("screen-leaderboard")).toBeVisible({ timeout: 30_000 });
  await expect(display.getByTestId("leaderboard-me")).toContainText("E2E Pilot");

  await expect(display.getByTestId("screen-idle")).toBeVisible({ timeout: 30_000 });
  await expect(display.getByTestId("room-code")).not.toHaveText(room);
});

test("running out of time costs lives until the run ends", async ({ browser }) => {
  const context = await browser.newContext();
  const display = await context.newPage();
  await display.setViewportSize({ width: 1920, height: 1080 });
  await display.goto("/?debug=1&speed=0.25&transport=broadcast");
  const room = (await display.getByTestId("room-code").textContent())!.trim();
  const phone = await context.newPage();
  await phone.goto(`/play/${room}?transport=broadcast`);
  await phone.getByTestId("nickname-input").fill("Slow Pilot");
  await phone.getByTestId("nickname-submit").click();
  await phone.getByTestId("start-button").click();
  await expect(phone.getByTestId("answer-pad")).toBeVisible({ timeout: 30_000 });
  await expect(display.getByTestId("hud-live")).toBeVisible();
  // Do not answer: the HUD flips to "Time's up" when the 15 s (scaled) window closes.
  await expect(display.getByTestId("hud-time-up")).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByTestId("answer-pad")).toContainText("Time's up");
  await expect(display.getByTestId("reveal-result")).toHaveAttribute("data-correct", "false", { timeout: 10_000 });
  await expect(phone.getByTestId("phone-reveal")).toContainText("Time's up");
  await expect(phone.getByTestId("phone-reveal")).toContainText("2 lives left");
  // A timeout costs a life but play moves on; the third timeout ends the run.
  await expect(display.getByTestId("screen-game")).toHaveAttribute("data-level", "2", { timeout: 15_000 });
  await expect(display.getByTestId("screen-results")).toBeVisible({ timeout: 60_000 });
  await expect(display.getByTestId("final-lives")).toContainText("0");
});

test("a second phone is turned away while a run is in progress", async ({ browser }) => {
  const context = await browser.newContext();
  const display = await context.newPage();
  await display.goto("/?transport=broadcast");
  const room = (await display.getByTestId("room-code").textContent())!.trim();
  const first = await context.newPage();
  await first.goto(`/play/${room}?transport=broadcast`);
  await expect(first.getByTestId("nickname-input")).toBeVisible();
  const second = await context.newPage();
  await second.goto(`/play/${room}?transport=broadcast`);
  await expect(second.getByTestId("phone")).toHaveAttribute("data-status", "busy");
});
