// qa-probe-start-diag.mjs — why does /start stay on "Opening your studio…"?
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/start-diag.json", import.meta.url).pathname;
const SESSION_FILE = "/tmp/qa-guest-session.json";
const SESSION_KEY = "sb-nwqmmvqobjxguvfxeafs-auth-token";

const { evl, navigate, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-start-diag-profile" });
const results = {};
try {
  await navigate(`${BASE}/`, 5000);
  const sessionRaw = readFileSync(SESSION_FILE, "utf8");
  unlinkSync(SESSION_FILE);
  const sess = JSON.parse(sessionRaw);
  results.tokenExpiresAt = sess.expires_at;
  results.tokenExpiresIn = sess.expires_in;
  results.nowEpoch = Math.floor(Date.now() / 1000);
  await evl(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(sessionRaw)})`);
  results.seeded = await evl(`localStorage.getItem(${JSON.stringify(SESSION_KEY)}) ? 'SEEDED' : 'SEED_FAIL'`);
  await navigate(`${BASE}/start`, 3000);
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    samples.push({
      t: `${(i + 1) * 3}s`,
      url: await evl("window.location.href"),
      bodyHead: ((await evl("document.body.innerText")) || "").slice(0, 200),
      lsKeys: await evl("Object.keys(localStorage)"),
      sbCalls: await evl(`performance.getEntriesByType('resource').filter(e => e.name.includes('supabase')).map(e => e.name.slice(0, 120))`),
    });
    const url = samples[samples.length - 1].url;
    if (!url.includes("/start")) break;
  }
  results.samples = samples;
  results.console = consoleMsgs.slice(0, 10);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
