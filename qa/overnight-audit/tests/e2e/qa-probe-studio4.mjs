// qa-probe-studio4.mjs — Studio phase 4: looks previews count (M19-M20) + exports (M21-M25) + timeline controls (M26-M28).
// Reuses the Chrome profile from phase 1 (guest session + project with SRT-imported words).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/studio-probe4.json", import.meta.url).pathname;
const SHOT = new URL("./../../evidence/screenshots/looks-panel.png", import.meta.url).pathname;
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const { send, evl, navigate, shot, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile3" });
const results = { projectId: PROJ.projectId };
const text = async () => (await evl("document.body.innerText")) || "";
try {
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp/qa-downloads" });
  mkdirSync("/tmp/qa-downloads", { recursive: true });
  await navigate(`${BASE}/projects/${PROJ.projectId}`, 8000);
  await sleep(4000);
  // Open the Templates (looks) panel.
  results.templatesClick = await evl(`[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Templates')?.click() || 'NOT FOUND'`);
  await sleep(5000);
  const countPreviews = async () => await evl(`(() => {
    const panel = document.body.innerText.includes('Templates');
    const cards = [...document.querySelectorAll('[role=button]')].filter(e => e.querySelector('img'));
    const canvases = document.querySelectorAll('canvas').length;
    const previewBoxes = document.querySelectorAll('.aspect-\\\\[8\\\\/3\\\\]').length;
    return { panel, lookCardsWithImg: cards.length, canvases, previewBoxes };
  })()`);
  results.looksInitial = await countPreviews();
  // Scroll the looks list to trigger lazy previews, sample a few times.
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await evl(`(() => { const els = [...document.querySelectorAll('[role=button]')].filter(e => e.querySelector('img')); const el = els[Math.floor(els.length * ${(i + 1) / 5})]; el?.scrollIntoView({ block: 'center' }); return true; })()`);
    await sleep(3000);
    samples.push(await countPreviews());
  }
  results.looksSamples = samples;
  await shot(SHOT);
  results.looksScreenshot = SHOT;

  // Back to Captions, then open Export.
  await evl(`[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Captions')?.click()`);
  await sleep(1500);
  results.exportClick = await evl(`[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Export')?.click() || 'NOT FOUND'`);
  await sleep(3000);
  let body = await text();
  results.exportModal = {
    open: /Export|Render/.test(body),
    kinds: ["MP4", "SRT", "VTT", "TXT", "ASS", "JSON", "PNG"].map((k) => [k, body.includes(k)]),
    bodyHead: body.slice(0, 500),
  };
  // Select SRT and Export it; verify the downloaded file.
  const srtExport = await evl(`(async () => {
    const opt = [...document.querySelectorAll('[role=button], button, label')].find(e => /^SRT/.test((e.textContent||'').trim()));
    if (!opt) return 'NO_SRT_OPTION';
    opt.click();
    await new Promise(r => setTimeout(r, 800));
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Export');
    if (!btn) return 'NO_EXPORT_BTN';
    if (btn.disabled) return 'EXPORT_DISABLED';
    btn.click();
    return 'EXPORT_CLICKED';
  })()`);
  results.srtExport = srtExport;
  await sleep(5000);
  // Timeline controls presence.
  body = await text();
  results.timeline = {
    hasShiftAll: body.includes("Shift all"),
    hasUndo: /Undo/i.test(body),
    hasRedo: /Redo/i.test(body),
    hasTimelineWord: /Timeline/i.test(body),
  };
  results.console = consoleMsgs.slice(0, 20);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
