// qa-probe-axe-studio-detail.mjs — full axe node details for the Studio (triage the new violations).
import { readFileSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/axe-studio-detail.json", import.meta.url).pathname;
const AXE = readFileSync("/home/hatch/workspace/oc-overnight-qa/node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core/axe.min.js", "utf8");
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const { send, evl, navigate, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile3" });
try {
  await navigate(`${BASE}/projects/${PROJ.projectId}`, 8000);
  // Wait for the editor to mount (Captions panel) — the studio API takes ~7s.
  for (let i = 0; i < 15; i++) {
    const body = (await evl("document.body.innerText")) || "";
    if (body.includes("Import SRT") || body.includes("No captions yet")) break;
    await sleep(2000);
  }
  await send("Runtime.evaluate", { expression: AXE });
  await sleep(1000);
  const res = await evl(`(async () => {
    const r = await axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.slice(0, 8).map(n => ({ target: n.target, html: n.html.slice(0, 200), failureSummary: n.failureSummary })),
      totalNodes: v.nodes.length,
    }));
  })()`);
  writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2).slice(0, 5000));
} finally {
  close();
}
