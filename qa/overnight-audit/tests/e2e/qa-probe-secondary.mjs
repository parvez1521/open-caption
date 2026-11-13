// qa-probe-secondary.mjs — secondary tools (M29-M36), auth (M37-M41), billing UI (M42, M44).
// Part A: fresh profile, no session -> /dashboard redirect check (M40).
// Part B: seeded guest session -> /motion, /ai-clipper, /analyzer, /prompter, /create, /growth, /login (M38/M39), /settings/billing, /pricing.
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp-harness.mjs";

const BASE = "http://localhost:3100";
const OUT = new URL("./../../evidence/secondary-probe.json", import.meta.url).pathname;
const SESSION_FILE = "/tmp/qa-guest-session.json";
const SESSION_KEY = "sb-nwqmmvqobjxguvfxeafs-auth-token";

const results = {};
// ---- Part A: logged out ----
{
  const b = await launch({ port: 9223, profile: "/tmp/qa-loggedout-profile" });
  try {
    await b.navigate(`${BASE}/dashboard`, 6000);
    results.M40_loggedOutDashboard = {
      url: await b.evl("window.location.href"),
      title: await b.evl("document.title"),
      bodyHead: ((await b.evl("document.body.innerText")) || "").slice(0, 300),
    };
  } finally { b.close(); }
  await sleep(2000);
}
// ---- Part B: guest session ----
const { evl, navigate, consoleMsgs, close } = await launch({ port: 9223, profile: "/tmp/qa-secondary-profile" });
const text = async () => (await evl("document.body.innerText")) || "";
try {
  await navigate(`${BASE}/`, 5000);
  const sessionRaw = readFileSync(SESSION_FILE, "utf8");
  unlinkSync(SESSION_FILE);
  await evl(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(sessionRaw)})`);
  results.guestSessionSeeded = await evl(`localStorage.getItem(${JSON.stringify(SESSION_KEY)}) ? 'SEEDED' : 'SEED_FAIL'`);

  const visit = async (path, settleMs = 6000) => {
    await navigate(`${BASE}${path}`, settleMs);
    const body = await text();
    return { url: await evl("window.location.href"), title: await evl("document.title"), bodyHead: body.slice(0, 500), bodyLen: body.length };
  };

  results.M29_motion = { ...(await visit("/motion")), checks: {
    hasTemplates: (await text()).includes("templates"),
    templateCount: await evl("document.querySelectorAll('[role=button], a').length"),
  } };
  results.M31_aiClipper = await visit("/ai-clipper");
  results.M32_analyzer = await visit("/analyzer");
  results.M33_prompter = await visit("/prompter");
  results.M34_create = await visit("/create");
  results.M35_growth = { ...(await visit("/growth")), checks: {
    hasYouTube: (await text()).includes("YouTube"),
    hasInstagram: (await text()).includes("Instagram"),
    hasCoach: /coach/i.test(await text()),
  } };
  // M38/M39: login page — GIS button + wrong credentials.
  const login = await visit("/login");
  results.M38_login = { ...login, checks: {
    hasGoogleButton: /Continue with Google/i.test(await text()),
    hasEmailForm: /Email Address/i.test(await text()),
    gisScriptPresent: await evl("!!document.querySelector('script[src*=accounts.google.com], iframe[src*=accounts.google.com]')"),
  } };
  const wrongCreds = await evl(`(async () => {
    const email = document.querySelector('input[type=email], input[name=email]');
    const pass = document.querySelector('input[type=password]');
    if (!email || !pass) return 'NO_EMAIL_FORM';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(email, 'qa-wrong-20261114@nonexistent-domain-xyz123.com');
    email.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(pass, 'wrong-password-123');
    pass.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Sign In');
    if (!btn) return 'NO_SIGNIN_BTN';
    btn.click();
    await new Promise(r => setTimeout(r, 4000));
    return 'AFTER:' + (document.querySelector('[role=alert]')?.textContent || document.body.innerText.slice(0, 200));
  })()`);
  results.M39_wrongCreds = wrongCreds;
  results.M42_billing = { ...(await visit("/settings/billing")), checks: {
    hasStarter299: (await text()).includes("299"),
    hasPlus499: (await text()).includes("499"),
    hasPro799: (await text()).includes("799"),
    hasTestModeBanner: /test mode/i.test(await text()),
  } };
  const pricingVisit = await visit("/pricing");
  const pricingBody = await text();
  results.M42_pricing = { ...pricingVisit, checks: {
    hasPrices: ["₹299", "₹499", "₹799", "$4", "$6", "$10"].map((p) => [p, pricingBody.includes(p)]),
  } };
  results.console = consoleMsgs.slice(0, 15);
} finally {
  close();
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
