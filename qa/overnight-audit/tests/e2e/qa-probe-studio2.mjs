// qa-probe-studio2.mjs — Studio phase 2: open the existing project, import SRT, test inline editing (M16) + looks (M19-M20).
// Reuses the Chrome profile from phase 1 (guest session persists in localStorage there) — no re-seeding.
import { readFileSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/studio-probe2.json", import.meta.url).pathname;
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const { evl, navigate, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile2" });
const results = { projectId: PROJ.projectId };
const text = async () => (await evl("document.body.innerText")) || "";
try {
  await navigate(`${BASE}/projects/${PROJ.projectId}`, 8000);
  // Wait for the editor (timeline / captions panel) to appear, up to 40s.
  let state = {};
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const body = await text();
    state = {
      hasTimeline: /timeline/i.test(body),
      hasCaptionsPanel: body.includes("No captions yet") || body.includes("Import SRT"),
      hasUploadScreen: body.includes("Drop your video here"),
      videoNamed: body.includes("v02_normal_hinglish"),
      hasTranscribeError: /download|connection|Failed to fetch/i.test(body),
    };
    if (state.hasCaptionsPanel || state.hasTimeline) break;
  }
  results.editorState = state;
  results.bodyHead = (await text()).slice(0, 600);

  // Import the SRT through the Captions panel input.
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
  const clickWord = await evl(`(() => {
    const els = [...document.querySelectorAll('[data-testid="caption-word"], button, span')].filter(e => (e.textContent||'').trim() === 'jaati.');
    if (!els.length) return 'NO_WORD_EL';
    els[0].click();
    return 'CLICKED:' + els[0].tagName + ':' + els[0].getAttribute('data-testid');
  })()`);
  results.clickWord = clickWord;
  await sleep(2000);
  body = await text();
  results.inlineEditor = {
    present: await evl("!!document.querySelector('[data-testid=inline-word-editor]')"),
    actions: ["Make key word", "Split card here", "Join previous", "Join next", "Hide word"].map((a) => [a, body.includes(a)]),
  };
  // Single-word edit: type a space + second word in the inline editor input, verify it sticks.
  const editTest = await evl(`(async () => {
    const ed = document.querySelector('[data-testid=inline-word-editor]');
    if (!ed) return 'NO_EDITOR';
    const input = ed.querySelector('input');
    if (!input) return 'NO_INPUT';
    const before = input.value;
    // Simulate typing: set value + dispatch input event (React controlled input).
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, before + ' test');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    return 'BEFORE:' + before + ' AFTER_INPUT:' + input.value + ' BODY_HAS:' + document.body.innerText.includes('jaati. test');
  })()`);
  results.singleWordEdit = editTest;
  await sleep(1500);
  results.afterEdit = {
    bodyHasBothWords: (await text()).includes("jaati. test"),
    inlineEditorStillPresent: await evl("!!document.querySelector('[data-testid=inline-word-editor]')"),
  };
  results.console = consoleMsgs.slice(0, 20);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
