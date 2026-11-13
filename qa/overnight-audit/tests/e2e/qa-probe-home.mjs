// QA probe: homepage + viewports (M45, M46).
// Usage: node qa-probe-home.mjs [baseUrl] [outDir]
// Starts its own headless Chromium via the shared harness. Dev server must be up.
// Screenshots: home-1440.png, home-1280.png, home-768.png, home-390.png, home-360.png
// Output: JSON summary printed + written to <outDir>/home-probe.json
import { launch, sleep } from "./cdp-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = process.argv[3] || path.resolve(import.meta.dirname, "../../evidence/screenshots");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "1440x900", w: 1440, h: 900 },
  { name: "1280x800", w: 1280, h: 800 },
  { name: "768x1024", w: 768, h: 1024 },
  { name: "390x844", w: 390, h: 844 },
  { name: "360x800", w: 360, h: 800 },
];

const browser = await launch({ port: 9224, width: 1440, height: 900 });
const results = [];
try {
  await browser.navigate(`${BASE}/`, 10000);
  const sections = await browser.evl(`(() => {
    const text = document.body.innerText;
    const anchors = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
    return {
      title: document.title,
      hasStartFree: /Start free/i.test(text),
      hasLooks: /150 looks/i.test(text),
      hasHinglish: /95% Hinglish/i.test(text),
      hasTranscribe: /Transcribe/i.test(text),
      hasMotion: /Motion Studio/i.test(text),
      hasFaq: /FAQ|Frequently/i.test(text),
      hiddenHrefs: anchors.filter(h => /^\/(clipper|ai-clipper|analyzer|prompter|create)(\?|$)/.test(h)),
      navLinks: anchors.filter(h => h.startsWith('/') || h.startsWith('/#')).slice(0, 40),
    };
  })()`);
  results.push({ phase: "home-content", ...sections });

  for (const vp of VIEWPORTS) {
    await browser.setViewport(vp.w, vp.h);
    await sleep(1500);
    const check = await browser.evl(`(() => {
      const el = document.documentElement;
      const overlapping = [];
      return {
        innerWidth: window.innerWidth,
        scrollWidth: el.scrollWidth,
        hScroll: el.scrollWidth > window.innerWidth + 1,
        scrollHeight: el.scrollHeight,
        bodyTextLen: document.body.innerText.length,
      };
    })()`);
    const shot = path.join(OUT, `home-${vp.name}.png`);
    await browser.shot(shot);
    results.push({ phase: "viewport", viewport: vp.name, ...check, screenshot: shot });
    console.log(vp.name, JSON.stringify(check));
  }
  results.push({ phase: "console", messages: browser.consoleMsgs.slice(0, 30) });
} finally {
  browser.close();
}
const outFile = path.join(OUT, "home-probe.json");
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log("WROTE:", outFile);
console.log(JSON.stringify(results, null, 1));
