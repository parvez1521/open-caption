import { launch, sleep } from "./cdp-harness.mjs";
const browser = await launch({ port: 9226, width: 1440, height: 900 });
try {
  await browser.navigate("http://localhost:3100/", 10000);
  const r = await browser.evl(`(function(){var els=[...document.querySelectorAll('*')].filter(function(e){return e.children.length===0 && (e.textContent||'').indexOf('Hinglish')>=0;});return els.slice(0,8).map(function(e){var cs=getComputedStyle(e);var p=e;var chain=[];while(p&&p!==document.body){var s=getComputedStyle(p);chain.push(p.tagName+'.'+(p.className&&p.className.baseVal===undefined?String(p.className).slice(0,40):'')+':vis='+s.visibility+':op='+s.opacity+':disp='+s.display);p=p.parentElement;}return {tag:e.tagName,text:e.textContent.slice(0,80),vis:cs.visibility,op:cs.opacity,chain:chain.slice(0,4)};});})()`);
  console.log(JSON.stringify(r, null, 1));
} finally { browser.close(); }
