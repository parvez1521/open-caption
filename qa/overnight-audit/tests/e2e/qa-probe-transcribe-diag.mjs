// qa-probe-transcribe-diag.mjs — diagnose why picked files don't enable Transcribe.
// Seeds a fresh guest session (same mechanism as qa-probe-transcribe.mjs), then:
// polls input.files, file-name visibility, Transcribe disabled state, alerts,
// and lists failed network URLs via performance resource timing.
import { readFileSync, unlinkSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const ASSETS = new URL("./../assets/", import.meta.url).pathname;
const OUT = new URL("./../../evidence/transcribe-diag.json", import.meta.url).pathname;
const SESSION_FILE = "/tmp/qa-guest-session.json";
const SESSION_KEY = "sb-nwqmmvqobjxguvfxeafs-auth-token";

const { send, evl, navigate, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-transcribe-profile" });
const results = {};
try {
  await navigate(`${BASE}/`, 5000);
  const sessionRaw = readFileSync(SESSION_FILE, "utf8");
  unlinkSync(SESSION_FILE);
  await evl(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(sessionRaw)})`);
  results.guestSessionSeeded = await evl(`localStorage.getItem(${JSON.stringify(SESSION_KEY)}) ? 'SEEDED' : 'SEED_FAIL'`);
  await navigate(`${BASE}/transcribe`, 6000);
  const text = async () => (await evl("document.body.innerText")) || "";
  results.pageLoad = {
    title: await evl("document.title"),
    sidebarGuest: (await text()).includes("Guest session"),
  };
  const { result } = await send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: result.root.nodeId, selector: "input[type=file]" });
  await send("DOM.setFileInputFiles", { files: [ASSETS + "v07_silence_720x1280.mp4"], nodeId });
  const polls = [];
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    const b = await text();
    polls.push({
      t: `${(i + 1) * 2}s`,
      inputFiles: await evl("document.querySelector('input[type=file]')?.files?.length"),
      inputFileName: await evl("document.querySelector('input[type=file]')?.files?.[0]?.name || null"),
      fileNameInBody: b.includes("v07_silence_720x1280.mp4"),
      transcribeDisabled: await evl("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Transcribe')?.disabled"),
      alert: await evl("document.querySelector('[role=alert]')?.textContent || null"),
      dropzoneText: await evl("document.body.innerText.match(/Drop a video[\\s\\S]{0,200}/)?.[0] || null"),
    });
    if (polls[polls.length - 1].transcribeDisabled === false) break;
  }
  results.polls = polls;
  results.failedResources = await evl(`performance.getEntriesByType('resource').filter(e => e.responseStatus >= 400 || e.transferSize === 0).slice(0, 30).map(e => e.name)`);
  results.allResourceHosts = await evl(`[...new Set(performance.getEntriesByType('resource').map(e => { try { return new URL(e.name).host; } catch { return 'local'; } }))].sort()`);
  results.console = consoleMsgs.slice(0, 10);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
