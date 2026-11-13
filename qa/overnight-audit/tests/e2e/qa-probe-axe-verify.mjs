// qa-probe-axe-verify.mjs — re-run axe on / and /projects/[id] after the BUG-010 + Studio landmark fixes.
import { readFileSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/axe-verify.json", import.meta.url).pathname;
const AXE = readFileSync("/home/hatch/workspace/oc-overnight-qa/node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core/axe.min.js", "utf8");
const PROJ = JSON.parse(readFileSync(new URL("./../../evidence/studio-project.json", import.meta.url), "utf8"));

const { send, evl, navigate, close } = await launch({ port: 9223, profile: "/tmp/qa-studio-profile3" });
const results = {};
try {
  const runAxe = async (label, path) => {
    await navigate(`${BASE}${path}`, 7000);
    await send("Runtime.evaluate", { expression: AXE });
    await sleep(1000);
    results[label] = await evl(`(async () => {
      const r = await axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    })()`);
  };
  await runAxe("home", "/");
  await runAxe("studio", `/projects/${PROJ.projectId}`);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
