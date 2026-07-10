/**
 * Blocking inline theme script (Phase 9's no-flash persistence design -- see
 * PLAN.md). Server component: renders a plain `<script>` whose text is a
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
 * constants) is a hardcoded duplicate of lib/themes.ts / lib/color.ts. This
 * file deliberately does NOT import them -- the whole point of this
 * component is a static, unparameterized string, and importing would tempt
 * a future edit into interpolating a value into it.
 */

const INLINE_THEME_SCRIPT =
  "(function(){try{var TK='jass.theme',AK='jass.accent';var IDS=['obsidian','parchment','deepslate','end'];var t=localStorage.getItem(TK);if(t&&IDS.indexOf(t)>-1&&t!=='obsidian'){document.documentElement.dataset.theme=t;}var a=localStorage.getItem(AK);if(a&&/^#[0-9a-fA-F]{6}$/.test(a)){var r=parseInt(a.slice(1,3),16),g=parseInt(a.slice(3,5),16),b=parseInt(a.slice(5,7),16);var f=function(v){v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};var L=0.2126*f(r)+0.7152*f(g)+0.0722*f(b);var fg=L>0.4?'#05130a':'#edf2ec';var h=function(n){n=Math.min(255,Math.max(0,Math.round(n)));var s=n.toString(16);return s.length<2?'0'+s:s;};var hov='#'+h(r*0.88)+h(g*0.88)+h(b*0.88);var st=document.documentElement.style;st.setProperty('--primary',a);st.setProperty('--primary-hover',hov);st.setProperty('--primary-foreground',fg);}}catch(e){}})();";

export function ThemeScript() {
  return <script>{INLINE_THEME_SCRIPT}</script>;
}
