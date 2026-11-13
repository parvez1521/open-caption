// Shared CDP harness for the Captionit overnight QA mission.
// Pattern copied from ~/workspace/oc-look-previews-cdp.mjs (proven on this VM).
// Usage: import { launch, ... } from "./cdp-harness.mjs" in a probe script.
// Rules: local dev server only (http://localhost:PORT). No external network from
// Chromium on this VM — Fetch interception blocks non-localhost requests.
// Evidence goes under qa/overnight-audit/evidence/. Never put secrets in output.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";

export const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9223, width = 1440, height = 900, profile = null } = {}) {
  const userDataDir = profile || `/tmp/qa-chrome-${port}`;
  const chrome = spawn(CHROME, [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${port}`,
    `--window-size=${width},${height}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: "ignore" });
  const getJson = async (path) => {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        if (res.ok) return await res.json();
      } catch { /* not up yet */ }
      await sleep(500);
    }
    throw new Error("devtools endpoint never came up");
  };
  const targets = await getJson("/json/list");
  let page = targets.find((t) => t.type === "page");
  if (!page) page = await getJson("/json/new?about:blank");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  let idc = 0;
  const consoleMsgs = [];
  const send = (method, params = {}, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      const id = ++idc;
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id === id) { ws.removeEventListener("message", onMsg); resolve(msg); }
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { ws.removeEventListener("message", onMsg); reject(new Error(`timeout ${method}`)); }, timeoutMs);
    });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
      consoleMsgs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 500)}`);
    }
    if (m.method === "Runtime.exceptionThrown") {
      consoleMsgs.push(`EXCEPTION: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    }
    if (m.method === "Fetch.requestPaused") {
      const url = m.params.request.url;
      const local = url.startsWith("http://localhost:") || url.startsWith("data:") || url.startsWith("blob:");
      send("Fetch.continueRequest", { requestId: m.params.requestId, ...(local ? {} : { errorReason: "BlockedByClient" }) }).catch(() => {});
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  const evl = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails) };
    return r.result?.result?.value;
  };
  const navigate = async (url, settleMs = 8000) => {
    await Promise.race([send("Page.navigate", { url }), sleep(60000)]);
    await sleep(settleMs);
  };
  const shot = async (path) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path, Buffer.from(s.result.data, "base64"));
    return path;
  };
  const setViewport = async (width, height) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  };
  const scrollCheck = async () => evl(`(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollHeight: document.documentElement.scrollHeight,
  }))()`);
  const close = () => {
    try { ws.close(); } catch { /* ignore */ }
    chrome.kill("SIGKILL");
    try { execSync(`pkill -f 'remote-debugging-port=${port}' 2>/dev/null || true`); } catch { /* ignore */ }
  };
  return { ws, send, evl, navigate, shot, setViewport, scrollCheck, consoleMsgs, close, port };
}
