/**
 * Inline <head> script that runs before anything paints, on every page.
 *
 * Supabase sends people back from Google / email links to its Site URL (often the homepage, and sometimes a long
 * team-preview *.vercel.app address) with the session in the URL ("#access_token=…", or "?code=…"). Without this
 * they land on the marketing page, apparently signed out, on an ugly URL. With it:
 *   - a sign-in return on any page goes straight to /start (which stores the session and opens the studio)
 *   - a sign-in return on a non-canonical *.vercel.app host is forwarded to the canonical app domain, token and
 *     all, so the session is saved where the user will actually use the app
 */
import { PRODUCTION_URL } from "./seo";

export const CANONICAL_APP = (process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_URL).replace(/\/$/, "");

export const authReturnScript = () => `(function(){try{
var hsh=location.hash||"",q=location.search||"";
var isReturn=/(^|[#&])(access_token|error_description)=/.test(hsh)||/[?&]code=[^&]{20,}/.test(q);
if(!isReturn||location.pathname==="/reset-password")return;
// password-reset links carry a session too: they belong on /reset-password, never the studio
if(/[#&]type=recovery/.test(hsh)){location.replace("/reset-password"+hsh);return}
var canon=${JSON.stringify(CANONICAL_APP)};
var host=location.hostname;
var wrongHost=/\.vercel\.app$/.test(host)&&canon.indexOf("//"+host)<0&&/[#&]access_token=/.test(hsh);
if(wrongHost){location.replace(canon+"/start"+hsh);return}
if(location.pathname!=="/start"){location.replace("/start"+q+hsh)}
}catch(e){}})();`;
