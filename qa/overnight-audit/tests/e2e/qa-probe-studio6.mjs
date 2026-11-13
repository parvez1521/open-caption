// qa-probe-studio6.mjs — Studio phase 6: shift-all verify via card times (M26), play video + stage frame check, Export signup gate (M21 gating).
import { readFileSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/studio-probe6.json", import.meta.url).pathname;
const SHOT_PLAY = new URL("./../../evidence/screenshots/studio-playing.png", import.meta.url).pathname;
const SHOT_GATE = new URL("./../../evidence/screenshots/export-gate.png", import.meta.url).pathname;
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const { send, evl, navigate, shot, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile3" });
const results = { projectId: PROJ.projectId };
const text = async () => (await evl("document.body.innerText")) || "";
const firstCardTime = async () => evl(`(() => { const m = document.body.innerText.match(/0:\\d\\d\\.\\d/); return m ? m[0] : null; })()`);
try {
  await navigate(`${BASE}/projects/${PROJ.projectId}`, 8000);
  await sleep(4000);
  // Shift-all verify: phase 5 applied +0.5s (first card was 0:00.2 -> expect ~0:00.7 now).
  results.firstCardTimeAfterPlusShift = await firstCardTime();
  // Apply -0.5s and verify it returns to ~0:00.2.
  const shiftBack = await evl(`(async () => {
    const minus = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '-0.5s');
    if (!minus) return 'NO_MINUS_BTN';
    minus.click();
    await new Promise(r => setTimeout(r, 500));
    const apply = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Apply shift');
    if (!apply) return 'NO_APPLY_BTN';
    apply.click();
    return 'SHIFT_BACK_CLICKED';
  })()`);
  results.shiftBack = shiftBack;
  await sleep(4000);
  results.firstCardTimeAfterMinusShift = await firstCardTime();
  // Play the video and check the stage frame + currentTime advance.
  const play = await evl(`(async () => {
    const v = document.querySelector('video');
    if (!v) return 'NO_VIDEO';
    await v.play().catch(e => 'PLAY_ERR:' + e.message);
    await new Promise(r => setTimeout(r, 2500));
    return 'currentTime:' + v.currentTime.toFixed(2) + ' paused:' + v.paused + ' readyState:' + v.readyState + ' videoWidth:' + v.videoWidth;
  })()`);
  results.play = play;
  await shot(SHOT_PLAY);
  results.playingScreenshot = SHOT_PLAY;
  // Export gate: click Export, capture the signup gate.
  await evl(`[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Export')?.click()`);
  await sleep(3000);
  const body = await text();
  results.exportGate = {
    hasSignupGate: /Sign up|Create.*account|Continue with Google/i.test(body),
    gateSnippet: body.slice(0, 800),
  };
  await shot(SHOT_GATE);
  results.gateScreenshot = SHOT_GATE;
  results.console = consoleMsgs.slice(0, 10);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
