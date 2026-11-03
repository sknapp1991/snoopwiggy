/** Shared by the server layout (inline <head> script) and the client settings store. */
export const STORAGE_KEY = "gs:settings:v1";

/** Applies the dark class before first paint so there is no light/dark flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})||"{}");var t=s.theme;var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
