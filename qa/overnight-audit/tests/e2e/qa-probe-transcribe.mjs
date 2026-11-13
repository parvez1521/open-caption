// qa-probe-transcribe.mjs — /transcribe boundary + flow probe (M07, M09-M12, M14, M56, M58)
// Usage: node qa-probe-transcribe.mjs [asset...]
// Default: v12 (0 bytes), v11 (unsupported), v10 (corrupt), v07 (silence -> transcribe attempt)
import { writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";
import { uploadFile } from "./upload-file.mjs";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const ASSET_PATH = "/qa-assets"; // test assets copied into apps/frontend/public/qa-assets/ (temporary serving shim, deleted at mission end, never committed)
const OUT = new URL("./../../evidence/transcribe-probe.json", import.meta.url).pathname;

const assets = process.argv.slice(2).length ? process.argv.slice(2) : ["v12_zero.mp4", "v11_unsupported.mp4", "v10_corrupt.mp4", "v07_silence_720x1280.mp4"];

// Guest session seeding (sandbox-only workaround, documented in evidence):
// local Chromium cannot reach Supabase (verified: direct + egress-proxy both
// fail), so the app's own signInAnonymously() can never complete here and
// /transcribe redirects to /login. The session below was created through
// Supabase's own anonymous-signup endpoint with the app's PUBLIC anon key
// (the exact mechanism the app uses) — a real throwaway guest session, not a
// bypass, not another user's account. The token file is deleted after seeding
// and is never written to evidence or logs.
import { readFileSync, unlinkSync } from "node:fs";
const SESSION_FILE = "/tmp/qa-guest-session.json";
const SESSION_KEY = "sb-nwqmmvqobjxguvfxeafs-auth-token";

const { send, evl, navigate, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-transcribe-profile" });
const results = {};
try {
  // Seed the guest session on the app origin before the app loads.
  await navigate(`${BASE}/`, 5000);
  const sessionRaw = readFileSync(SESSION_FILE, "utf8");
  unlinkSync(SESSION_FILE);
  await evl(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(sessionRaw)})`);
  await evl(`localStorage.getItem(${JSON.stringify(SESSION_KEY)}) ? 'SEEDED' : 'SEED_FAIL'`).then((v) => { results.guestSessionSeeded = v; });
  await navigate(`${BASE}/transcribe`, 6000);
  const text = async () => (await evl("document.body.innerText")) || "";
  results.pageLoad = {
    title: await evl("document.title"),
    hasDropzone: (await text()).includes("Drop a video or audio file here"),
    languageOptions: await evl("[...document.querySelectorAll('#transcribe-language option')].map(o => o.value)"),
    transcribeDisabledNoFile: await evl("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Transcribe')?.disabled"),
  };

  const setFile = async (fileName) => {
    return await uploadFile(evl, "input[type=file]", `${ASSET_PATH}/${fileName}`, fileName, "video/mp4");
  };
  const clickButton = async (label) => evl(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '${label}')?.click() || 'NOT FOUND'`);

  for (const asset of assets) {
    const entry = { asset };
    entry.upload = await setFile(asset);
    await sleep(4000);
    const body = await text();
    entry.afterPick = {
      fileNameInBody: body.includes(asset),
      alert: await evl("document.querySelector('[role=alert]')?.textContent || null"),
      transcribeDisabled: await evl("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Transcribe')?.disabled"),
      bodyHead: body.slice(0, 500),
    };
    if (entry.afterPick.transcribeDisabled === false) {
      await clickButton("Transcribe");
      const timeline = [];
      for (let i = 0; i < 18; i++) {
        await sleep(5000);
        const b = await text();
        const stage = await evl("document.querySelector('[aria-live=polite] p')?.textContent || null");
        const progress = await evl("[...document.querySelectorAll('[aria-live=polite] p')].map(p=>p.textContent).join(' | ') || null");
        const alert = await evl("document.querySelector('[role=alert]')?.textContent || null");
        const done = b.includes("Transcribe another") || b.includes("No speech was found");
        timeline.push({ t: `${(i + 1) * 5}s`, stage, progress, alert, done });
        if (done || alert) break;
      }
      entry.transcribeTimeline = timeline;
      entry.finalWords = await evl("document.body.innerText.match(/(\\d+) words/)?.[0] || null");
      await clickButton("Start over").catch(() => {});
      await clickButton("Transcribe another").catch(() => {});
      await sleep(2000);
    }
    results[asset] = entry;
  }
  results.console = consoleMsgs.slice(0, 40);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
