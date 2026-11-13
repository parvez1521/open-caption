import { launch, sleep } from "./cdp-harness.mjs";
import fs from "node:fs";
const browser = await launch({ port: 9228, width: 1440, height: 900 });
// re-capture full console args without truncation: patch by listening raw
const full = [];
browser.ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === "Runtime.consoleAPICalled") {
    const text = m.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join("\n---ARG---\n");
    if (text.indexOf("same key") >= 0) full.push(text);
  }
});
try {
  await browser.navigate("http://localhost:3100/", 12000);
  await sleep(3000);
  console.log("DUPKEY COUNT:", full.length);
  for (const f of full) console.log("=====\n" + f.slice(0, 3000));
  fs.writeFileSync("/home/hatch/workspace/oc-overnight-qa/qa/overnight-audit/evidence/console/dupkey-home.txt", full.join("\n\n=====\n\n"));
} finally { browser.close(); }
