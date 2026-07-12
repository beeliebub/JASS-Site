/**
 * Blocking inline theme script (the no-flash persistence design).
 * Server component: renders a plain `<script>` whose text is a
 * single hardcoded string literal below, with zero interpolation of any
 * kind, so there is no injection surface no matter what a visitor's
 * localStorage happens to contain (a malicious/corrupted value just fails
 * the hardcoded regex/array checks inside the script and is ignored).
 *
 * It must render as the raw string content of the tag, NOT go through
 * `dangerouslySetInnerHTML` -- for a plain `<script>` host element, React's
 * server renderer (see react-dom's `pushScriptImpl`) writes string children
 * verbatim (only guarding against a literal `</script` sequence), the same
 * as `dangerouslySetInnerHTML` would, so JSX children here are exactly as
 * safe and the more idiomatic form.
 *
 * This runs synchronously while the browser parses <head>, before first
 * paint -- see
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 * ("Themes" section), which is the exact pattern this follows: a raw
 * `<script>` placed in an explicit `<head>` in the root layout, paired with
 * `suppressHydrationWarning` on `<html>` (added in app/layout.tsx) since the
 * script mutates `<html>` before React hydrates.
 *
 * Every literal below (storage keys, theme id list, hex regex, luminance
 * constants, the 16-token CSS var list) is a hardcoded duplicate of
 * lib/themes.ts / lib/color.ts. This file deliberately does NOT import them
 * -- the whole point of this component is a static, unparameterized string,
 * and importing would tempt a future edit into interpolating a value into
 * it.
 *
 * A visitor's site-wide *custom* theme selection (as
 * opposed to a built-in lib/themes.ts theme) is cached as its already-
 * resolved ~16 token values under jass.customThemeTokens, not just an id --
 * this script has no DB access, so it can't look a custom theme up by id
 * before first paint. The cached payload is validated (must be an object
 * with exactly the 16 expected keys, each a #rrggbb hex string) before any
 * of it is applied; a malformed/stale payload is silently ignored, same
 * fail-safe posture as every other localStorage read here. When present and
 * valid it wins over a built-in `data-theme` (a custom theme is a full
 * token replacement), but the accent override below still applies on top of
 * either kind, matching today's behavior of accent layering over a built-in
 * theme choice.
 */

const INLINE_THEME_SCRIPT =
  "(function(){try{var TK='jass.theme',AK='jass.accent',CK='jass.customThemeTokens';var IDS=['obsidian','parchment','deepslate','end','redstone'];var KEYS=['--background','--surface','--surface-2','--border','--border-strong','--foreground','--muted','--primary','--primary-foreground','--primary-hover','--accent','--accent-foreground','--danger','--info','--online','--offline'];var HEX=/^#[0-9a-fA-F]{6}$/;var root=document.documentElement;var usedCustom=false;var c=localStorage.getItem(CK);if(c){try{var payload=JSON.parse(c);var tk=payload&&payload.tokens;if(tk&&typeof tk==='object'){var ok=true;for(var i=0;i<KEYS.length;i++){if(typeof tk[KEYS[i]]!=='string'||!HEX.test(tk[KEYS[i]])){ok=false;break;}}if(ok){for(var j=0;j<KEYS.length;j++){root.style.setProperty(KEYS[j],tk[KEYS[j]]);}usedCustom=true;}}}catch(e2){}}if(!usedCustom){var t=localStorage.getItem(TK);if(t&&IDS.indexOf(t)>-1&&t!=='obsidian'){root.dataset.theme=t;}}var a=localStorage.getItem(AK);if(a&&HEX.test(a)){var r=parseInt(a.slice(1,3),16),g=parseInt(a.slice(3,5),16),b=parseInt(a.slice(5,7),16);var f=function(v){v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};var L=0.2126*f(r)+0.7152*f(g)+0.0722*f(b);var fg=L>0.4?'#05130a':'#edf2ec';var h=function(n){n=Math.min(255,Math.max(0,Math.round(n)));var s=n.toString(16);return s.length<2?'0'+s:s;};var hov='#'+h(r*0.88)+h(g*0.88)+h(b*0.88);root.style.setProperty('--primary',a);root.style.setProperty('--primary-hover',hov);root.style.setProperty('--primary-foreground',fg);}}catch(e){}})();";

export function ThemeScript() {
  return <script>{INLINE_THEME_SCRIPT}</script>;
}
