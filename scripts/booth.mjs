// One command for the booth: builds and starts the game (server + relay), then
// opens Chrome full screen with autoplay allowed, so music and sound effects
// play without anyone clicking the TV.
//
//   npm run booth              # kiosk mode (Cmd+Q / Alt+F4 to close Chrome)
//   npm run booth -- --window  # normal window instead of kiosk
//
// Chrome gets its own profile (~/.mc-kiosk) so the autoplay flag applies even
// if your everyday Chrome is already open. Ctrl+C here stops everything.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const URL = "http://localhost:3000";
const windowed = process.argv.includes("--window");

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    win32: [
      join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
      join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
    ],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/pw-browsers/chromium"],
  }[platform()] ?? [];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function waitForServer(timeoutMs = 5 * 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(URL);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const children = [];
const stopAll = () => {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  process.exit(0);
};
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

console.log("[booth] building and starting the game…");
const server = spawn("npm", ["run", "kiosk"], { stdio: "inherit", shell: platform() === "win32" });
children.push(server);
server.on("exit", (code) => {
  console.log(`[booth] game server stopped (${code ?? "signal"})`);
  stopAll();
});

if (!(await waitForServer())) {
  console.error("[booth] the game did not start within 5 minutes; check the output above.");
  stopAll();
}

const chrome = findChrome();
if (!chrome) {
  console.log(`\n[booth] Chrome not found. Open ${URL} yourself and click the screen once to turn on sound.`);
  console.log("[booth] (or set CHROME_PATH=/path/to/chrome and run npm run booth again)\n");
} else {
  console.log(`[booth] opening ${URL} in Chrome with sound allowed…`);
  const args = [
    windowed ? "--start-fullscreen" : "--kiosk",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${join(homedir(), ".mc-kiosk")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    URL,
  ];
  const browser = spawn(chrome, args, { stdio: "ignore", detached: platform() !== "win32" });
  browser.unref();
  console.log("[booth] ready. Phones scan the QR on the TV. Ctrl+C here stops the game.");
}
