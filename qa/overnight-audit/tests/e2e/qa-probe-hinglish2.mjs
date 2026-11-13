import { launch, sleep } from "./cdp-harness.mjs";
const browser = await launch({ port: 9227, width: 1440, height: 900 });
try {
  await browser.navigate("http://localhost:3100/", 10000);
  const r = await browser.evl(`(function(){var ps=[...document.querySelectorAll('p')].filter(function(p){return (p.textContent||'').indexOf('Hinglish caption accurate')>=0;});return ps.map(function(p){return {textContent:p.textContent, innerText:p.innerText, childCount:p.children.length, childTexts:[...p.children].map(function(c){return c.tagName+':'+c.textContent;})};});})()`);
  console.log(JSON.stringify(r, null, 1));
} finally { browser.close(); }
