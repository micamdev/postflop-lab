// End-to-end smoke test of the desktop app (Windows, WebView2): setup, solve, navigation,
// save and load. Run before a release: `pnpm e2e` (from desktop/). It starts the app with
// `tauri dev` in a temporary library and WebView2 profile, drives it through the Chrome
// DevTools Protocol, and stops it. Exit code 0 when every step passed. On failure, a
// screenshot and the temporary folder are kept for inspection.

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 9223;
const LIBRARY_DIR_ENV = "POSTFLOP_LAB_LIBRARY_DIR";
const SAVE_NAME = "e2e smoke";
const desktop = path.resolve(import.meta.dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "postflop-lab-e2e-"));
const library = path.join(tmp, "library");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// 1. Start the app.
const appLog = fs.openSync(path.join(tmp, "app.log"), "w");
const app = spawn("pnpm tauri dev --config e2e/tauri-e2e.json", {
  cwd: desktop,
  shell: true,
  env: {
    ...process.env,
    [LIBRARY_DIR_ENV]: library,
    WEBVIEW2_USER_DATA_FOLDER: path.join(tmp, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  },
  stdio: ["ignore", appLog, appLog],
});

const stopApp = () => {
  try {
    execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" });
  } catch {
    // Already stopped.
  }
  fs.closeSync(appLog);
};

// 2. Connect to the page (the first build can take minutes).
let ws;
const pending = new Map();
let nextId = 0;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
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
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(
        (t) => t.type === "page" && t.url.includes("5392")
      );
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, e) => ((ws.onopen = r), (ws.onerror = e)));
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          pending.get(m.id)?.(m);
        };
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
const errors = async () =>
  JSON.parse(await evaluate(`JSON.stringify(window.__e2eErrors)`));
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
  // Td 9d 6h (card = 4 * rank + suit, suits c d h s), a small tree.
  await evaluate(`Object.assign(${store("config")}, {
    board: [33, 29, 18], startingPot: 60, effectiveStack: 300,
    oopFlopBet: '50', ipFlopBet: '50', oopTurnBet: '75', ipTurnBet: '75',
    oopRiverBet: '100', ipRiverBet: '100',
  })`);
  await evaluate(
    `Object.assign(${store("solverSession")}.settings, { maxIterations: 100, targetExploitability: 1 })`
  );
  await sleep(1500);
  const combos = await evaluate(
    `${store("app")}.ranges.slice(0, 2).map((r) => r.filter((w) => w > 0).length)`
  );
  if (combos.some((n) => n === 0)) throw new Error(`empty range: ${combos}`);
});

step("solve", async () => {
  await clickButton("▶ Solve");
  await until("solve finished", `${store("app")}.isSolverFinished`, 300);
  if (await evaluate(`${store("app")}.isSolverError`))
    throw new Error("solver error");
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
  // OOP checks, IP checks: the turn card.
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
  await sleep(800);
  await evaluate(`(() => {
    const input = [...document.querySelectorAll('input[type=text]')].filter((i) => i.offsetParent !== null).pop();
    input.value = ${JSON.stringify(SAVE_NAME)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(1500);
  await clickButton("Save", `document.querySelector('.fixed.inset-0')`);
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
      const errs = await errors().catch(() => []);
      if (errs.length > 0) throw new Error(`app errors: ${errs.join(" | ")}`);
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
