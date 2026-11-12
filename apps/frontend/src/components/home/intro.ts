/**
 * Inline <head> script for the home page's brand intro (components/home/Loader.tsx). It runs before first paint:
 *   <html data-intro="play|skip">  plays once per browser session (always in dev, or with ?intro in the URL)
 *   .ce-go      added once the loader has actually been painted with its fonts: the CSS sequence starts here,
 *               so a slow load can never "use up" the intro before anyone sees it
 *   .ce-a-done  the entrance sequence has finished (the loader then exits as soon as the app has hydrated)
 *   .ce-out     exit (added by Loader.tsx after hydration; forced here after a cap so the page is never stuck)
 */
export const INTRO_A_MS = 2300;
const CAP_MS = 6000;

export const introScript = (dev: boolean) => `(function(){try{
var h=document.documentElement;if(location.pathname!=="/")return;
var k="ce_intro",force=${dev ? "true" : "false"}||/[?&]intro\\b/.test(location.search);
if(!force&&(sessionStorage.getItem(k)||matchMedia("(pointer:coarse)").matches)){h.dataset.intro="skip";return}
try{sessionStorage.setItem(k,"1")}catch(e){}
h.dataset.intro="play";
var started=false;
function go(){if(started)return;started=true;requestAnimationFrame(function(){requestAnimationFrame(function(){
h.classList.add("ce-go");
setTimeout(function(){h.classList.add("ce-a-done")},${INTRO_A_MS});
setTimeout(function(){h.classList.add("ce-out")},${CAP_MS});
})})}
function wait(){if(!document.querySelector(".ce-intro")){requestAnimationFrame(wait);return}
var f=document.fonts&&document.fonts.ready;if(f){Promise.race([f,new Promise(function(r){setTimeout(r,900)})]).then(go)}else go()}
wait();setTimeout(go,2500);
}catch(e){}})();`;
