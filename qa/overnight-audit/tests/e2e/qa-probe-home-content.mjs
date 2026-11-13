// QA probe: homepage content check (M46) — re-run of the content half of qa-probe-home.
// The first probe's content evaluate failed on a syntax error; this uses a plain
// function expression with no regex literals. Usage: node qa-probe-home-content.mjs [baseUrl]
import { launch, sleep } from "./cdp-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3100";
const browser = await launch({ port: 9225, width: 1440, height: 900 });
try {
  await browser.navigate(`${BASE}/`, 10000);
  const r = await browser.evl(`(function(){var t=document.body.innerText;var a=[];var els=document.querySelectorAll('a[href]');for(var i=0;i<els.length;i++){a.push(els[i].getAttribute('href'));}var hidden=[];for(var j=0;j<a.length;j++){var h=a[j];if(!h)continue;if(h==='/clipper'||h.indexOf('/clipper?')===0||h==='/ai-clipper'||h==='/analyzer'||h==='/prompter'||h==='/create'||h.indexOf('/create?')===0){hidden.push(h);}}return {title:document.title,hasStartFree:t.indexOf('Start free')>=0,hasLooks:t.indexOf('150 looks')>=0,hasHinglish:t.indexOf('95% Hinglish')>=0,hasTranscribe:t.indexOf('Transcribe')>=0,hasMotion:t.indexOf('Motion Studio')>=0,hasFaq:t.indexOf('FAQ')>=0,hidden:hidden,navCount:a.length};})()`);
  console.log(JSON.stringify(r, null, 1));
  console.log("CONSOLE:", JSON.stringify(browser.consoleMsgs.slice(0, 10)));
  const out = path.resolve(import.meta.dirname, "../../evidence/screenshots/home-content.json");
  fs.writeFileSync(out, JSON.stringify({ content: r, console: browser.consoleMsgs.slice(0, 30) }, null, 2));
  console.log("WROTE:", out);
} finally { browser.close(); }
