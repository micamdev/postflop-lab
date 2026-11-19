// End-to-end smoke test of the desktop app (Windows, WebView2): setup, solve, navigation,
// save and load. Run before a release: `pnpm e2e` (from desktop/). It starts the app with
// `tauri dev` in a temporary library and WebView2 profile, drives it through the Chrome
// DevTools Protocol, and stops it. Exit code 0 when every step passed. On failure, the
// temporary folder (app.log, failure.png) is kept and its path printed.

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const DEBUG_PORT = 9223;
const VITE_PORT = 5392;
const PAGE_URL = `http://localhost:${VITE_PORT}/`;
const LIBRARY_DIR_ENV = "POSTFLOP_LAB_LIBRARY_DIR";
const SAVE_NAME = "e2e smoke";
const BOARD = [33, 29, 18]; // Td 9d 6h (card = 4 * rank + suit, suits c d h s)
const CALL_TIMEOUT = 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

if (process.platform !== "win32") {
  log("The end-to-end test drives WebView2: Windows only.");
  process.exit(1);
}

/** Whether nothing listens on `port` (IPv4 or IPv6 localhost). */
const isFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
for (const port of [VITE_PORT, DEBUG_PORT]) {
  if (!(await isFree(port))) {
    log(`Port ${port} is in use: close any other test or dev app first.`);
    process.exit(1);
  }
}

const desktop = path.resolve(import.meta.dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "postflop-lab-e2e-"));
const library = path.join(tmp, "library");
const profile = path.join(tmp, "webview");
// An unreadable file only the temporary library has: the app must list it before any save.
const MARKER = "e2e-temporary-library-marker";
fs.mkdirSync(library);
fs.writeFileSync(path.join(library, `${MARKER}.plab`), "not a solution");

// 1. Start the app.
const appLog = fs.openSync(path.join(tmp, "app.log"), "w");
const app = spawn("pnpm tauri dev --config e2e/tauri-e2e.json", {
  cwd: desktop,
  shell: true,
  env: {
    ...process.env,
    [LIBRARY_DIR_ENV]: library,
    WEBVIEW2_USER_DATA_FOLDER: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT}`,
  },
  stdio: ["ignore", appLog, appLog],
});

let stopped = false;
const stopApp = () => {
  if (stopped) return;
  stopped = true;
  try {
    execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" });
  } catch {
    // Already stopped.
  }
  fs.closeSync(appLog);
};
process.on("SIGINT", () => {
  stopApp();
  process.exit(130);
});

// 2. The DevTools connection. Each call times out; a dropped connection fails them all.
let ws;
const pending = new Map();
const exceptions = [];
let nextId = 0;
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("the DevTools connection is closed"));
      return;
    }
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, CALL_TIMEOUT);
    pending.set(id, (m) => {
      clearTimeout(timer);
      resolve(m);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const m = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (m.result?.exceptionDetails) {
    throw new Error(m.result.exceptionDetails.exception?.description);
  }
  return m.result?.result?.value;
};
const connect = async () => {
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error("the app stopped, see app.log");
    try {
      const list = await (
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)
      ).json();
      const page = list.find((t) => t.type === "page" && t.url === PAGE_URL);
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, e) => ((ws.onopen = r), (ws.onerror = e)));
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.method === "Runtime.exceptionThrown") {
            exceptions.push(
              m.params.exceptionDetails.exception?.description ??
                m.params.exceptionDetails.text
            );
          }
          pending.get(m.id)?.(m);
          pending.delete(m.id);
        };
        ws.onclose = () => {
          for (const resolve of pending.values()) {
            resolve({
              result: {
                exceptionDetails: {
                  exception: { description: "connection closed" },
                },
              },
            });
          }
          pending.clear();
        };
        await send("Runtime.enable");
        return;
      }
    } catch {
      // Not up yet.
    }
    await sleep(2000);
  }
  throw new Error("the app did not start within 20 minutes");
};

// Helpers run in the page.
const STORES = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s`;
const store = (name) => `${STORES}.get(${JSON.stringify(name)})`;
const until = async (what, expression, seconds) => {
  for (let i = 0; i < seconds * 2; ++i) {
    if (await evaluate(expression)) return;
    await sleep(500);
  }
  throw new Error(`timed out: ${what}`);
};
/** Clicks the visible button whose text is `text` (or starts with it), within `scope`. */
const clickButton = async (text, scope = "document") => {
  const result = await evaluate(`(() => {
    const buttons = [...${scope}.querySelectorAll('button, [role=radio], [role=tab]')]
      .filter((b) => b.offsetParent !== null);
    const b = buttons.find((b) => b.textContent.trim() === ${JSON.stringify(text)})
      ?? buttons.find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}));
    if (!b) return 'missing';
    if (b.disabled) return 'disabled: ' + (b.title || '');
    b.click();
    return 'ok';
  })()`);
  if (result !== "ok") throw new Error(`button "${text}": ${result}`);
  await sleep(400);
};
/** Errors the app reported: Vue errors, unhandled rejections, exceptions, the error banner. */
const appErrors = async () => {
  const found = await evaluate(`(() => {
    if (!Array.isArray(window.__e2eErrors)) return null;
    const banner = ${store("app")}.appError;
    return [...window.__e2eErrors, ...(banner ? ['banner: ' + banner] : [])];
  })()`);
  if (found === null) return ["the page reloaded: error collection lost"];
  return [...found, ...exceptions];
};
const visibleRows = () =>
  evaluate(
    `[...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent !== null && r.cells.length > 2).length`
  );

const steps = [];
const step = (name, run) => steps.push({ name, run });

step("app loaded", async () => {
  await until(
    "Vue app",
    `Boolean(document.querySelector('#app')?.__vue_app__)`,
    60
  );
  await evaluate(`(() => {
    window.__e2eErrors = [];
    document.querySelector('#app').__vue_app__.config.errorHandler = (e) => window.__e2eErrors.push(String(e));
    window.addEventListener('unhandledrejection', (e) => window.__e2eErrors.push('unhandled: ' + e.reason));
  })()`);
  // The temporary WebView2 profile is the one in use (not the user's).
  if (!fs.existsSync(profile))
    throw new Error("the temporary WebView2 profile is not used");
});

step("the library is the temporary one", async () => {
  await clickButton("Library");
  // Otherwise stop before anything is saved into the user's library.
  await until(
    "the temporary library listed",
    `[...document.querySelectorAll('tbody tr')].some((r) => r.offsetParent !== null && r.textContent.includes(${JSON.stringify(MARKER)}))`,
    15
  );
});

step("setup: ranges, board and tree", async () => {
  await clickButton("Setup");
  const ranges = ["AA,KK,QQ,AK,T9s", "QQ-99,AQ,KQ,JTs"];
  for (const [player, label] of ["OOP", "IP"].entries()) {
    const section = `[...document.querySelectorAll('section')].find((s) => s.querySelector('header')?.textContent.trim().startsWith(${JSON.stringify(label)}))`;
    await clickButton("Edit", section);
    await evaluate(`(() => {
      const input = ${section}.querySelector('input[type=text]');
      input.value = ${JSON.stringify(ranges[player])};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(500);
    await clickButton("Done", section);
  }
  await evaluate(`Object.assign(${store("config")}, {
    board: ${JSON.stringify(BOARD)}, startingPot: 60, effectiveStack: 300,
    oopFlopBet: '50', ipFlopBet: '50', oopTurnBet: '75', ipTurnBet: '75',
    oopRiverBet: '100', ipRiverBet: '100',
  })`);
  await evaluate(
    `Object.assign(${store("solverSession")}.settings, { maxIterations: 100, targetExploitability: 1 })`
  );
  await sleep(1500);
  // Cells with weight: AA KK QQ AKs AKo T9s = 6; QQ JJ TT 99 AQs AQo KQs KQo JTs = 9.
  const cells = await evaluate(
    `${store("app")}.ranges.slice(0, 2).map((r) => r.filter((w) => w > 0).length)`
  );
  if (cells[0] !== 6 || cells[1] !== 9)
    throw new Error(`ranges: ${cells} cells`);
});

step("solve", async () => {
  await clickButton("▶ Solve");
  await until("solve finished", `${store("app")}.isSolverFinished`, 300);
  if (await evaluate(`${store("app")}.isSolverError`))
    throw new Error("solver error");
  const info = await evaluate(`({ ...${store("app")}.solutionInfo })`);
  if (!(info.iterations > 0) || !Number.isFinite(info.exploitability)) {
    throw new Error(`no real result: ${JSON.stringify(info)}`);
  }
});

step("results: views and navigation", async () => {
  await clickButton("Results");
  await sleep(1500);
  for (const view of ["Equity", "Breakdown", "Compare", "Strategy"]) {
    await clickButton(view);
    await sleep(800);
  }
  if ((await visibleRows()) === 0)
    throw new Error("no row in the strategy table");
  // OOP checks, IP checks: the Turn tab exists only at the turn card.
  await clickButton("Check");
  await sleep(1000);
  const ipCheck = await evaluate(`(() => {
    const checks = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && b.textContent.trim().startsWith('Check'));
    if (checks.length < 2) return false;
    checks[1].click();
    return true;
  })()`);
  if (!ipCheck) throw new Error("no IP check");
  await sleep(1500);
  await clickButton("Turn");
  await sleep(1500);
  if ((await visibleRows()) === 0) throw new Error("no row in the turn table");
  await clickButton("Strategy");
});

step("save", async () => {
  await clickButton("Save");
  const dialog = `document.querySelector('.fixed.inset-0')`;
  await until(
    "save dialog",
    `Boolean(${dialog}?.querySelector('input[type=text]'))`,
    10
  );
  await evaluate(`(() => {
    const input = ${dialog}.querySelector('input[type=text]');
    input.value = ${JSON.stringify(SAVE_NAME)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  // Enabled once the save size is estimated.
  await until(
    "dialog Save enabled",
    `[...${dialog}.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Save' && !b.disabled)`,
    60
  );
  await clickButton("Save", dialog);
  await until("saved", `${store("app")}.isSolutionSaved`, 120);
  if (!fs.existsSync(path.join(library, `${SAVE_NAME}.plab`))) {
    throw new Error("no file in the temporary library");
  }
});

step("load from the library", async () => {
  await clickButton("Library");
  await sleep(1500);
  const found = await evaluate(`(() => {
    const row = [...document.querySelectorAll('tbody tr')].find((r) => r.offsetParent !== null && r.textContent.includes(${JSON.stringify(SAVE_NAME)}));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!found) throw new Error("the save is not listed");
  await until(
    "loaded",
    `${store("app")}.solutionInfo?.loaded === true && ${store("app")}.navView === 'results'`,
    120
  );
  const board = await evaluate(`[...${store("config")}.board]`);
  if (JSON.stringify(board) !== JSON.stringify(BOARD)) {
    throw new Error(`loaded board ${board}`);
  }
  await sleep(1500);
  if ((await visibleRows()) === 0) throw new Error("no row after loading");
});

let failed = false;
try {
  log(`Starting the app (temporary folder ${tmp})…`);
  await connect();
  for (const { name, run } of steps) {
    try {
      await run();
      const errors = await appErrors();
      if (errors.length > 0)
        throw new Error(`app errors: ${errors.join(" | ")}`);
      log(`✓ ${name}`);
    } catch (e) {
      failed = true;
      log(`✗ ${name}: ${e.message}`);
      const shot = await send("Page.captureScreenshot", {
        format: "png",
      }).catch(() => null);
      if (shot?.result?.data) {
        fs.writeFileSync(
          path.join(tmp, "failure.png"),
          Buffer.from(shot.result.data, "base64")
        );
      }
      break;
    }
  }
} catch (e) {
  failed = true;
  log(`✗ ${e.message}`);
} finally {
  ws?.close();
  stopApp();
}

if (failed) {
  log(`Failed: logs and screenshot in ${tmp}`);
  process.exit(1);
}
// WebView2 keeps its profile open for a moment after the app stops.
try {
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 30,
    retryDelay: 1000,
  });
} catch {
  log(`(could not remove ${tmp})`);
}
log("All steps passed.");
process.exit(0);
