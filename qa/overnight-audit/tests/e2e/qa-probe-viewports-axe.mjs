// qa-probe-viewports-axe.mjs — M45 viewports (hScroll + overflow at 5 sizes, 4 routes) + M47 axe-core (home, /transcribe, /pricing, /projects/[id]).
// axe-core is injected from the monorepo pnpm store (free, already installed) via Runtime.evaluate.
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/viewports-axe.json", import.meta.url).pathname;
const AXE = readFileSync("/home/hatch/workspace/oc-overnight-qa/node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core/axe.min.js", "utf8");
const SESSION_FILE = "/tmp/qa-guest-session.json";
const SESSION_KEY = "sb-nwqmmvqobjxguvfxeafs-auth-token";
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const VIEWPORTS = [
  [1440, 900], [1280, 800], [768, 1024], [390, 844], [360, 800],
];
const ROUTES = ["/", "/transcribe", "/pricing", "/motion"];

const { send, evl, navigate, setViewport, shot, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-viewports-profile" });
const results = { viewports: {}, axe: {} };
const text = async () => (await evl("document.body.innerText")) || "";
try {
  await navigate(`${BASE}/`, 5000);
  const sessionRaw = readFileSync(SESSION_FILE, "utf8");
  unlinkSync(SESSION_FILE);
  await evl(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(sessionRaw)})`);
  results.guestSessionSeeded = await evl(`localStorage.getItem(${JSON.stringify(SESSION_KEY)}) ? 'SEEDED' : 'SEED_FAIL'`);

  // M45: hScroll + overflow per route per viewport.
  for (const [w, h] of VIEWPORTS) {
    await setViewport(w, h);
    const key = `${w}x${h}`;
    results.viewports[key] = {};
    for (const route of ROUTES) {
      await navigate(`${BASE}${route}`, 5000);
      const m = await evl(`(() => ({
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
        overflowing: [...document.querySelectorAll('*')].filter(e => e.scrollWidth > window.innerWidth + 5 && e.children.length === 0).slice(0, 3).map(e => e.tagName + '.' + (e.className.baseVal !== undefined ? '' : String(e.className).slice(0, 40))),
      }))()`);
      results.viewports[key][route] = m;
    }
    if (w === 390) {
      await navigate(`${BASE}/transcribe`, 4000);
      await shot(new URL("./../../evidence/screenshots/transcribe-390.png", import.meta.url).pathname);
    }
  }
  await setViewport(1440, 900);

  // M47: axe-core on home, /transcribe, /pricing, project Studio.
  const runAxe = async (label, path) => {
    await navigate(`${BASE}${path}`, 6000);
    await send("Runtime.evaluate", { expression: AXE });
    await sleep(1000);
    const res = await evl(`(async () => {
      if (typeof axe === 'undefined') return { error: 'axe not loaded' };
      const r = await axe.run(document, { resultTypes: ['violations'] });
      return { violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })) };
    })()`);
    results.axe[label] = res;
  };
  await runAxe("home", "/");
  await runAxe("transcribe", "/transcribe");
  await runAxe("pricing", "/pricing");
  await runAxe("studio", `/projects/${PROJ.projectId}`);
  results.console = consoleMsgs.slice(0, 10);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
