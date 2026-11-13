// qa-probe-studio5.mjs — Studio phase 5: dismiss tour, stage check, Export modal + SRT download verify (M21-M25), undo/redo (M28), shift-all (M26).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/studio-probe5.json", import.meta.url).pathname;
const SHOT = new URL("./../../evidence/screenshots/studio-stage.png", import.meta.url).pathname;
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const { send, evl, navigate, shot, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile3" });
const results = { projectId: PROJ.projectId };
const text = async () => (await evl("document.body.innerText")) || "";
try {
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp/qa-downloads" });
  await navigate(`${BASE}/projects/${PROJ.projectId}`, 8000);
  await sleep(4000);
  // Dismiss the 6-step tutorial if present.
  results.tourDismiss = await evl(`[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Skip tour')?.click() || 'NO_TOUR'`);
  await sleep(1500);
  // Stage check: video element present?
  results.stage = {
    hasVideo: await evl("!!document.querySelector('video')"),
    videoCount: await evl("document.querySelectorAll('video').length"),
    canvases: await evl("document.querySelectorAll('canvas').length"),
  };
  await shot(SHOT);
  results.stageScreenshot = SHOT;
  // Find the Export button(s) and click the top-bar one.
  results.exportButtons = await evl(`[...document.querySelectorAll('button')].filter(b => (b.textContent||'').includes('Export')).map(b => JSON.stringify(b.textContent.trim().slice(0, 40)))`);
  results.exportClick = await evl(`(() => { const b = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Export'); if (!b) return 'NOT FOUND'; b.click(); return 'CLICKED'; })()`);
  await sleep(3000);
  let body = await text();
  results.exportModal = {
    hasSrtOption: body.includes("SRT"),
    hasMp4Option: body.includes("MP4"),
    hasRenderOrExportBtn: /Render|Export/.test(body),
    snippet: body.slice(body.indexOf("Export"), body.indexOf("Export") + 600),
  };
  const srtExport = await evl(`(async () => {
    const opt = [...document.querySelectorAll('[role=button], button')].find(e => /^SRT/.test((e.textContent||'').trim()));
    if (!opt) return 'NO_SRT_OPTION';
    opt.click();
    await new Promise(r => setTimeout(r, 800));
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Export' && !b.disabled);
    if (!btn) return 'NO_ENABLED_EXPORT_BTN';
    btn.click();
    return 'EXPORT_CLICKED';
  })()`);
  results.srtExport = srtExport;
  await sleep(5000);
  results.downloads = readdirSync("/tmp/qa-downloads");
  // Undo/redo functional test: edit "mute" -> "muteX" via inline editor, undo, redo.
  await evl(`[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Captions')?.click()`);
  await sleep(1500);
  const editWord = await evl(`(() => {
    const els = [...document.querySelectorAll('button, span')].filter(e => (e.textContent||'').trim() === 'mute');
    if (!els.length) return 'NO_MUTE_EL';
    els[0].click();
    return 'CLICKED';
  })()`);
  results.editWord = editWord;
  await sleep(1500);
  const editResult = await evl(`(async () => {
    const ed = document.querySelector('[data-testid=inline-word-editor]');
    if (!ed) return 'NO_EDITOR';
    const input = ed.querySelector('input');
    if (!input) return 'NO_INPUT';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'muteX');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1000));
    return 'SET:' + input.value + ' BODY:' + document.body.innerText.includes('muteX');
  })()`);
  results.editResult = editResult;
  const undoBtn = await evl(`(() => {
    const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').match(/undo/i) || (b.title||'').match(/undo/i));
    if (!b) return 'NO_UNDO_BTN';
    b.click();
    return 'UNDO_CLICKED:' + (b.getAttribute('aria-label') || b.title);
  })()`);
  results.undoBtn = undoBtn;
  await sleep(1500);
  results.afterUndo = { bodyHasMuteX: (await text()).includes("muteX"), bodyHasMute: (await text()).includes("mute") };
  const redoBtn = await evl(`(() => {
    const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').match(/redo/i) || (b.title||'').match(/redo/i));
    if (!b) return 'NO_REDO_BTN';
    b.click();
    return 'REDO_CLICKED:' + (b.getAttribute('aria-label') || b.title);
  })()`);
  results.redoBtn = redoBtn;
  await sleep(1500);
  results.afterRedo = { bodyHasMuteX: (await text()).includes("muteX") };
  // Shift-all: read first card time, apply +0.5s, read again.
  results.shiftAll = await evl(`(async () => {
    const before = document.body.innerText.match(/Shift all captions[\\s\\S]{0,120}/)?.[0] || 'NO_SHIFT_UI';
    const plus = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '+0.5s');
    if (!plus) return { before, plus: 'NO_PLUS_BTN' };
    plus.click();
    await new Promise(r => setTimeout(r, 500));
    const apply = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Apply shift');
    if (!apply) return { before, plus: 'CLICKED', apply: 'NO_APPLY_BTN' };
    apply.click();
    await new Promise(r => setTimeout(r, 1500));
    return { before, plus: 'CLICKED', apply: 'CLICKED' };
  })()`);
  results.console = consoleMsgs.slice(0, 15);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
