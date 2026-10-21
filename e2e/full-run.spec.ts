import { expect, test, type Page } from "@playwright/test";

/**
 * A complete run with no relay: display and phone share one browser context and
 * talk over BroadcastChannel. The display's ?debug=1 exposes the true count.
 */
test("join, clear two levels, miss, see results and leaderboard", async ({ browser }) => {
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

  for (let i = 0; i < 3; i++) {
    await expect(phone.getByTestId("answer-pad")).toBeVisible({ timeout: 30_000 });
    const count = await truth(display);
    const answer = i < 2 ? count : count + 1;
    for (const d of String(answer)) await phone.locator(`[data-key="${d}"]`).click();
    await phone.getByTestId("submit-answer").click();
    await expect(display.getByTestId("reveal-result")).toHaveAttribute("data-correct", String(i < 2));
    await expect(phone.getByTestId("phone-reveal")).toHaveAttribute("data-correct", String(i < 2));
    await expect.poll(() => phase(display), { timeout: 30_000 }).not.toBe("reveal");
  }

  await expect(display.getByTestId("screen-results")).toBeVisible();
  await expect(display.getByTestId("final-accuracy")).toContainText(/Your accuracy was \d+\.\d%/);
  await expect(display.getByTestId("final-reaction")).toContainText(/Your average reaction time was \d+\.\d\d s/);
  await expect(display.getByTestId("final-rank")).toHaveText("#1");
  await expect(phone.getByTestId("phone-results")).toContainText("#1");

  await expect(display.getByTestId("screen-leaderboard")).toBeVisible({ timeout: 30_000 });
  await expect(display.getByTestId("leaderboard-me")).toContainText("E2E Pilot");

  await expect(display.getByTestId("screen-idle")).toBeVisible({ timeout: 30_000 });
  await expect(display.getByTestId("room-code")).not.toHaveText(room);
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
