// qa-probe-axe-home-detail.mjs — full axe node details for the home page (triage BUG-010 candidates).
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/axe-home-detail.json", import.meta.url).pathname;
const AXE = readFileSync("/home/hatch/workspace/oc-overnight-qa/node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core/axe.min.js", "utf8");

const { send, evl, navigate, close } = await launch({ port: 9223, profile: "/tmp/qa-axe-detail-profile" });
try {
  await navigate(`${BASE}/`, 6000);
  await send("Runtime.evaluate", { expression: AXE });
  await sleep(1000);
  const res = await evl(`(async () => {
    const r = await axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help, description: v.description,
      nodes: v.nodes.map(n => ({ target: n.target, html: n.html.slice(0, 220), failureSummary: n.failureSummary })),
    }));
  })()`);
  writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2).slice(0, 6000));
} finally {
  close();
}
