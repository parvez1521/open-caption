// qa-probe-studio.mjs — Studio caption-editing + looks + export probe (M16-M25)
// Phase 1: /start -> project created -> upload v02 -> import v02 SRT (Node Hinglish output)
//         -> verify words render, inline editor (M16), looks previews (M19-M20).
// Phase 2 (separate run, same project): exports + timeline (M21-M28).
// Usage: node qa-probe-studio.mjs [phase1|phase2]  (phase1 writes the project id to evidence/studio-project.json)
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";
import { uploadFile } from "./upload-file.mjs";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const ASSET_PATH = "/qa-assets";
const OUT = new URL("./../../evidence/studio-probe.json", import.meta.url).pathname;
const PROJ_OUT = new URL("./../../evidence/studio-project.json", import.meta.url).pathname;
const SESSION_FILE = "/tmp/qa-guest-session.json";
const SESSION_KEY = "sb-nwqmmvqobjxguvfxeafs-auth-token";

const phase = process.argv[2] || "phase1";
const { send, evl, navigate, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile3" });
const results = { phase };
const text = async () => (await evl("document.body.innerText")) || "";
const clickButton = async (label) => evl(`[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim().startsWith(${JSON.stringify(label)}))?.click() || 'NOT FOUND'`);
try {
  await navigate(`${BASE}/`, 5000);
  const sessionRaw = readFileSync(SESSION_FILE, "utf8");
  unlinkSync(SESSION_FILE);
  await evl(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(sessionRaw)})`);
  results.guestSessionSeeded = await evl(`localStorage.getItem(${JSON.stringify(SESSION_KEY)}) ? 'SEEDED' : 'SEED_FAIL'`);

  if (phase === "phase1") {
    await navigate(`${BASE}/start`, 6000);
    // /start auto-creates a project and redirects to /projects/[id]
    let projectUrl = "";
    for (let i = 0; i < 10; i++) {
      await sleep(2000);
      projectUrl = await evl("window.location.href");
      if (/\/projects\/[^/]+/.test(projectUrl)) break;
    }
    results.projectUrl = projectUrl;
    const projectId = (projectUrl.match(/\/projects\/([^/?]+)/) || [])[1] || null;
    results.projectId = projectId;
    writeFileSync(PROJ_OUT, JSON.stringify({ projectId, projectUrl }, null, 2));
    await sleep(4000);
    let body = await text();
    results.studioLoad = {
      title: await evl("document.title"),
      hasUpload: /Upload|Drop.*video|Choose.*file/i.test(body),
      hasCaptionsPanel: body.includes("Captions"),
      bodyHead: body.slice(0, 400),
    };
    // Upload v02 through the Studio upload input (first video-accepting file input).
    const uploadResult = await evl(`(async () => {
      const inputs = [...document.querySelectorAll('input[type=file]')];
      const vid = inputs.find(i => (i.accept||'').includes('video'));
      if (!vid) return 'NO_VIDEO_INPUT:' + inputs.length;
      const res = await fetch('/qa-assets/v02_normal_hinglish_1080x1920.mp4');
      if (!res.ok) return 'FETCH_' + res.status;
      const buf = await res.arrayBuffer();
      const file = new File([buf], 'v02_normal_hinglish_1080x1920.mp4', { type: 'video/mp4' });
      const dt = new DataTransfer(); dt.items.add(file);
      vid.files = dt.files;
      vid.dispatchEvent(new Event('change', { bubbles: true }));
      return 'SET:' + vid.files.length;
    })()`);
    results.videoUpload = uploadResult;
    await sleep(8000);
    body = await text();
    results.afterVideoUpload = {
      videoNamed: body.includes("v02_normal_hinglish"),
      hasTimeline: /timeline/i.test(body),
      bodyHead: body.slice(0, 500),
    };
    // Open the Captions panel (left rail) and import the SRT.
    await clickButton("Captions");
    await sleep(2000);
    const srtResult = await evl(`(async () => {
      const inputs = [...document.querySelectorAll('input[type=file]')];
      const srt = inputs.find(i => (i.accept||'').includes('.srt'));
      if (!srt) return 'NO_SRT_INPUT:' + inputs.map(i=>i.accept).join('|');
      const res = await fetch('/qa-assets/v02_hinglish.srt');
      if (!res.ok) return 'FETCH_' + res.status;
      const buf = await res.arrayBuffer();
      const file = new File([buf], 'v02_hinglish.srt', { type: 'text/plain' });
      const dt = new DataTransfer(); dt.items.add(file);
      srt.files = dt.files;
      srt.dispatchEvent(new Event('change', { bubbles: true }));
      return 'SET:' + srt.files.length;
    })()`);
    results.srtImport = srtResult;
    await sleep(4000);
    body = await text();
    results.afterSrtImport = {
      wordCount: (body.match(/Aapki|jaati|nahin/g) || []).length,
      hasNoCaptionsYet: body.includes("No captions yet"),
      hasInlineEditorHint: body.includes("Click a word to edit it here"),
      bodyHasWords: ["Aapki", "jaati", "nahin"].map((w) => [w, body.includes(w)]),
    };
    // M16: click a word in the caption list -> inline editor under the card.
    const clickWord = await evl(`(() => {
      const els = [...document.querySelectorAll('[data-testid="caption-word"], button, span')].filter(e => (e.textContent||'').trim() === 'jaati.');
      if (!els.length) return 'NO_WORD_EL';
      els[0].click();
      return 'CLICKED:' + els[0].tagName;
    })()`);
    results.clickWord = clickWord;
    await sleep(2000);
    body = await text();
    results.inlineEditor = {
      present: await evl("!!document.querySelector('[data-testid=inline-word-editor]')"),
      actions: ["Make key word", "Split card here", "Join previous", "Join next", "Hide word"].map((a) => [a, body.includes(a)]),
    };
  }
  results.console = consoleMsgs.slice(0, 20);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
