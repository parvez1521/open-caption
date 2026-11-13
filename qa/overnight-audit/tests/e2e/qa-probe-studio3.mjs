// qa-probe-studio3.mjs — Studio phase 3: Normal Editor door -> upload v02 -> import SRT -> M16 inline edit + M19 looks count.
// Reuses the Chrome profile from phase 1 (guest session persists in localStorage there).
import { readFileSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/studio-probe3.json", import.meta.url).pathname;
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const { evl, navigate, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile3" });
const results = { projectId: PROJ.projectId };
const text = async () => (await evl("document.body.innerText")) || "";
const clickByText = async (sel, label) => evl(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => (b.textContent||'').trim().startsWith(${JSON.stringify(label)}))?.click() || 'NOT FOUND'`);
try {
  await navigate(`${BASE}/projects/${PROJ.projectId}`, 8000);
  await sleep(3000);
  // Normal Editor door: no language question, no transcription — editor opens directly.
  results.doorClick = await clickByText("button", "Normal Editor");
  await sleep(2000);
  // Upload v02 through the Studio upload input.
  const uploadResult = await evl(`(async () => {
    const inputs = [...document.querySelectorAll('input[type=file]')];
    const vid = inputs.find(i => (i.accept||'').includes('video'));
    if (!vid) return 'NO_VIDEO_INPUT:' + inputs.length;
    const res = await fetch('/qa-assets/v02_normal_hinglish_1080x1920.mp4');
    if (!res.ok) return 'FETCH_' + res.status;
    const buf = await res.arrayBuffer();
    const file = new File([buf], 'v02_normal_hinglish_1080x1920.mp4', { type: 'video/mp4' });
    const dt = new DataTransfer(); dt.items.add(file);
    const name = file.name;
    vid.files = dt.files;
    vid.dispatchEvent(new Event('change', { bubbles: true }));
    return 'SET:' + name;
  })()`);
  results.videoUpload = uploadResult;
  // Wait for the editor (timeline / captions panel), up to 60s.
  let state = {};
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const body = await text();
    state = {
      t: `${(i + 1) * 2}s`,
      hasTimeline: /timeline/i.test(body),
      hasCaptionsPanel: body.includes("No captions yet") || body.includes("Import SRT"),
      hasUploadScreen: body.includes("Drop your video here"),
      videoNamed: body.includes("v02_normal_hinglish"),
      error: await evl("document.querySelector('[role=alert]')?.textContent || null"),
    };
    if (state.hasCaptionsPanel || state.hasTimeline) break;
  }
  results.editorState = state;
  // Import the SRT.
  const srtResult = await evl(`(async () => {
    const inputs = [...document.querySelectorAll('input[type=file]')];
    const srt = inputs.find(i => (i.accept||'').includes('.srt'));
    if (!srt) return 'NO_SRT_INPUT:' + inputs.map(i=>i.accept).join('|');
    const res = await fetch('/qa-assets/v02_hinglish.srt');
    if (!res.ok) return 'FETCH_' + res.status;
    const buf = await res.arrayBuffer();
    const file = new File([buf], 'v02_hinglish.srt', { type: 'text/plain' });
    const dt = new DataTransfer(); dt.items.add(file);
    const name = file.name;
    srt.files = dt.files;
    srt.dispatchEvent(new Event('change', { bubbles: true }));
    return 'SET:' + name;
  })()`);
  results.srtImport = srtResult;
  await sleep(5000);
  let body = await text();
  results.afterSrtImport = {
    hasNoCaptionsYet: body.includes("No captions yet"),
    hasInlineEditorHint: body.includes("Click a word to edit it here"),
    bodyHasWords: ["Aapki", "jaati", "nahin", "mute"].map((w) => [w, body.includes(w)]),
    wordChipCount: await evl("document.querySelectorAll('[data-testid=caption-word]').length"),
  };
  // M16: click the single-word card's word ("jaati.") -> inline editor under the card.
  results.clickWord = await evl(`(() => {
    const els = [...document.querySelectorAll('[data-testid="caption-word"], button, span')].filter(e => (e.textContent||'').trim() === 'jaati.');
    if (!els.length) return 'NO_WORD_EL';
    els[0].click();
    return 'CLICKED:' + els[0].tagName + ':' + els[0].getAttribute('data-testid');
  })()`);
  await sleep(2000);
  body = await text();
  results.inlineEditor = {
    present: await evl("!!document.querySelector('[data-testid=inline-word-editor]')"),
    actions: ["Make key word", "Split card here", "Join previous", "Join next", "Hide word"].map((a) => [a, body.includes(a)]),
  };
  // Single-word edit: append " test" (space + 2nd word) in the inline editor input.
  results.singleWordEdit = await evl(`(async () => {
    const ed = document.querySelector('[data-testid=inline-word-editor]');
    if (!ed) return 'NO_EDITOR';
    const input = ed.querySelector('input');
    if (!input) return 'NO_INPUT';
    const before = input.value;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, before + ' test');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    return 'BEFORE:' + before + ' AFTER_INPUT:' + input.value;
  })()`);
  await sleep(1500);
  body = await text();
  results.afterEdit = {
    bodyHasBothWords: body.includes("jaati. test"),
    inlineEditorStillPresent: await evl("!!document.querySelector('[data-testid=inline-word-editor]')"),
  };
  results.console = consoleMsgs.slice(0, 20);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
