// Regenerates docs/screenshots/* by playing a short run: display + phone over the
// local relay. Start the app first (npm run dev:lan or npm run kiosk), then:
//
//   node scripts/capture-screenshots.mjs                 # http://localhost:3000
//   BASE=http://localhost:3200 node scripts/capture-screenshots.mjs
//   CHROMIUM_PATH=/path/to/chrome node scripts/capture-screenshots.mjs
//
// Sound is off (?sound=0) so the "enable sound" hint never appears in the shots.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const display = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await phoneContext.newPage();
for (const [name, page] of [["display", display], ["phone", phone]]) {
  page.on("pageerror", (e) => console.error(`[${name}]`, e.message));
}

const shot = async (page, file) => {
  await page.screenshot({ path: `${OUT}${file}.jpg`, type: "jpeg", quality: 82 });
  console.log("saved", file);
};
const phase = () => display.evaluate(() => window.__MC__?.state?.phase);
const waitPhase = async (want, timeout = 60_000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await phase()) === want) return;
    await display.waitForTimeout(50);
  }
  throw new Error(`timed out waiting for ${want}`);
};

// One tile per tier from the preview gallery.
for (const [level, target, file] of [
  [3, "blueHouse", "tier-1-easy-2x2"],
  [8, "car", "tier-2-medium-2x3"],
  [13, "tree", "tier-3-hard-3x3"],
  [18, "circleLake", "tier-4-extreme-3x4"],
]) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.goto(`${BASE}/dev/cities?level=${level}&target=${target}&seed=7`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator("figure").first().screenshot({ path: `${OUT}${file}.jpg`, type: "jpeg", quality: 82 });
  console.log("saved", file);
  await page.close();
}

await display.goto(`${BASE}/?debug=1&sound=0`, { waitUntil: "networkidle" });
await display.waitForTimeout(2500);
await shot(display, "01-idle");
const room = (await display.getByTestId("room-code").textContent()).trim();
await phone.goto(`${BASE}/play/${room}`, { waitUntil: "networkidle" });
await phone.getByTestId("nickname-input").fill("Orbit Hawk");
await phone.getByTestId("nickname-submit").click();
await waitPhase("instructions");
await display.waitForTimeout(800);
await shot(display, "02-instructions");
await phone.getByTestId("start-button").click();

// Level 1 answered correctly after ~2.5 s, level 2 missed on purpose.
for (let i = 0; i < 2; i++) {
  await waitPhase("live");
  await phone.getByTestId("answer-pad").waitFor();
  await display.waitForTimeout(2500);
  if (i === 0) {
    await shot(display, "03-live");
    await shot(phone, "07-phone-live");
  }
  const truth = await display.evaluate(() => window.__MC__.state.round.count);
  for (const d of String(i === 0 ? truth : truth + 1)) await phone.locator(`[data-key="${d}"]`).click();
  await phone.getByTestId("submit-answer").click();
  await waitPhase("reveal");
  await display.waitForTimeout(2600);
  if (i === 0) await shot(display, "04-reveal");
}
await waitPhase("results");
await display.waitForTimeout(1500);
await shot(display, "05-results");
await waitPhase("leaderboard");
await display.waitForTimeout(1000);
await shot(display, "06-leaderboard");
await browser.close();
