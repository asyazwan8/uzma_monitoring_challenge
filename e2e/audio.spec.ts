import { chromium, expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * The display's synthesised audio, checked without speakers: every cue and
 * music mode is rendered offline through the real master chain and measured,
 * and the realtime context is checked against Chrome's autoplay policy (the
 * booth kiosk runs with --autoplay-policy=no-user-gesture-required).
 */

interface Metrics {
  peak: number;
  rms: number;
  nonFinite: number;
}

type AudioWindow = Window & {
  __audioTest?: { names: string[]; render(name: string, seconds: number): Promise<Metrics> };
  __mcAudio?: { status: string };
};

const executablePath = process.env.CHROMIUM_PATH;

async function openLab(page: Page) {
  await page.goto("/dev/audio");
  await expect(page.getByTestId("audio-lab")).toBeVisible();
  await page.waitForFunction(() => Boolean((window as AudioWindow).__audioTest && (window as AudioWindow).__mcAudio));
}

const status = (page: Page) => page.evaluate(() => (window as AudioWindow).__mcAudio?.status ?? "missing");

test("every cue and music mode renders clean, audible and below clipping", async ({ page }) => {
  await openLab(page);
  const names = await page.evaluate(() => (window as AudioWindow).__audioTest!.names);
  expect(names.length).toBeGreaterThanOrEqual(13 + 7);
  for (const name of names) {
    const m = await page.evaluate((n) => (window as AudioWindow).__audioTest!.render(n, 3.5), name);
    const floor = name.startsWith("music:") ? 1e-3 : 1e-4;
    expect.soft(m.nonFinite, `${name} non-finite samples`).toBe(0);
    expect.soft(m.peak, `${name} peak`).toBeLessThanOrEqual(0.99);
    // The soft clipper is linear up to 0.7 and saturates towards 0.92, so the
    // check above can never fail on its own. Staying in the linear region shows
    // nothing drives the master chain into saturation.
    expect.soft(m.peak, `${name} headroom below the soft-clip knee`).toBeLessThan(0.7);
    expect.soft(m.rms, `${name} rms`).toBeGreaterThan(floor);
  }
});

/**
 * Report the AudioContext's state at creation through the console, before the
 * test touches the page. Playwright's locators, evaluate() and waitForFunction
 * run with a user gesture in Chromium, so any of them would unlock audio and
 * hide what the autoplay policy alone did.
 */
async function probeAudioAtCreation(page: Page): Promise<{ atCreation: Promise<ConsoleMessage> }> {
  const atCreation = page.waitForEvent("console", (msg) => msg.text().startsWith("audio-probe:"));
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext };
    const Base = w.AudioContext;
    w.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        console.debug(`audio-probe:${this.state}`);
      }
    };
  });
  // Wrapped, so awaiting this function does not also wait for the event.
  return { atCreation };
}

/** A fresh browser with an explicit autoplay policy (launch flags cannot be set per test). */
async function withPolicy(policy: string, baseURL: string | undefined, fn: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ args: [`--autoplay-policy=${policy}`], ...(executablePath ? { executablePath } : {}) });
  try {
    const context = await browser.newContext({ baseURL });
    await fn(await context.newPage());
  } finally {
    await browser.close();
  }
}

test("kiosk flag: audio runs with no click and no console errors", async ({ baseURL }) => {
  await withPolicy("no-user-gesture-required", baseURL, async (page) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));
    const { atCreation } = await probeAudioAtCreation(page);
    await page.goto("/dev/audio");
    // Running from the first moment, with no gesture of any kind: the flag did it.
    expect((await atCreation).text()).toBe("audio-probe:running");
    await openLab(page);
    await expect.poll(() => status(page)).toBe("running");
    await expect(page.getByTestId("audio-status")).toHaveText("running");
    // Exercise the realtime path a little: music plus a cue.
    await page.locator('[data-music="game2"]').click();
    await page.locator('[data-cue="correct"]').click();
    await page.waitForTimeout(600);
    expect(errors).toEqual([]);
  });
});

// No flag: Chrome's default policy (document-user-activation-required) keeps the
// context suspended until a gesture. ("user-gesture-required" would not: it lets
// main-frame Web Audio start on its own.) Playwright's evaluate() and binding
// replies count as user gestures, so the state at creation is reported one way,
// through the console (probeAudioAtCreation), before the test touches the page.
test("default policy: audio is locked until the first click, then runs", async ({ page }) => {
  const { atCreation } = await probeAudioAtCreation(page);
  await page.goto("/dev/audio");
  expect((await atCreation).text()).toBe("audio-probe:suspended");
  await expect.poll(() => status(page)).toBe("locked");
  await expect(page.getByTestId("audio-status")).toHaveText("locked");
  await page.mouse.click(400, 600);
  await expect.poll(() => status(page)).toBe("running");
  await expect(page.getByTestId("audio-status")).toHaveText("running");
});

// The real thing, not an offline render: on the display with autoplay allowed,
// the output meter must show sound on the attract screen and during a round.
test("the display actually makes sound: attract music and the live round", async ({ baseURL }) => {
  await withPolicy("no-user-gesture-required", baseURL, async (display) => {
    type Meter = Window & { __mcAudio?: { status: string; level(): number } };
    const peakLevel = async (ms: number) => {
      let max = 0;
      for (let t = 0; t < ms; t += 100) {
        max = Math.max(max, await display.evaluate(() => (window as Meter).__mcAudio?.level() ?? 0));
        await display.waitForTimeout(100);
      }
      return max;
    };
    await display.setViewportSize({ width: 1920, height: 1080 });
    await display.goto("/?debug=1&transport=broadcast");
    await expect.poll(() => display.evaluate(() => (window as Meter).__mcAudio?.status)).toBe("running");
    // No "click to enable sound" card when audio already runs.
    await expect(display.getByTestId("sound-status")).toHaveCount(0);
    expect(await peakLevel(4000)).toBeGreaterThan(0.002);

    const room = (await display.getByTestId("room-code").textContent())!.trim();
    const phone = await display.context().newPage();
    await phone.goto(`/play/${room}?transport=broadcast`);
    await phone.getByTestId("nickname-input").fill("Sound Check");
    await phone.getByTestId("nickname-submit").click();
    await phone.getByTestId("start-button").click();
    await expect(phone.getByTestId("answer-pad")).toBeVisible({ timeout: 30_000 });
    expect(await peakLevel(3000)).toBeGreaterThan(0.004);
  });
});

test("without autoplay the attract screen asks for a click, which turns sound on", async ({ baseURL }) => {
  // Chrome's real default policy, as on a normally opened browser. Playwright's
  // own queries count as user gestures, so the card is watched from inside the
  // page and reported through the console instead.
  await withPolicy("document-user-activation-required", baseURL, async (page) => {
    const seen: string[] = [];
    page.on("console", (msg) => msg.text().startsWith("sound-card:") && seen.push(msg.text()));
    await page.addInitScript(() => {
      let last = "";
      const check = () => {
        const el = document.querySelector('[data-testid="sound-status"]');
        const now = el ? `sound-card:${el.textContent}` : "sound-card:none";
        if (now !== last) console.log((last = now));
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/?transport=broadcast");
    await expect.poll(() => seen.some((t) => t.includes("Click anywhere to turn on sound")), { timeout: 15_000 }).toBe(true);
    await page.mouse.click(960, 540);
    await expect.poll(() => seen[seen.length - 1], { timeout: 5_000 }).toBe("sound-card:none");
  });
});
