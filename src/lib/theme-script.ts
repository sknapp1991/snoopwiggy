/** Shared by the server layout (inline <head> script) and the client settings store. */
export const STORAGE_KEY = "gs:settings:v1";

/**
 * Runs before first paint:
 * - old addresses (snoopwiggy.com, www.*) jump straight to versesacross.com when there's nothing left to
 *   carry over (data already sent once, or none saved) — no blank page while the app loads;
 *   otherwise src/components/domain-move.tsx sends the data first;
 * - applies the dark class so there is no light/dark flash.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var h=location.hostname;if(/^(www\\.)?snoopwiggy\\.com$|^www\\.versesacross\\.com$/.test(h)&&(localStorage.getItem("gs:moved:v1")==="1"||!localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)}))){location.replace("https://versesacross.com"+location.pathname+location.search+location.hash);return;}}catch(e){}try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})||"{}");var t=s.theme;var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
