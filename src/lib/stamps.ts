/**
 * When each synced piece (goals, plans, settings) last changed on this device, so sync can keep the
 * newest version, plus a hook so sync uploads soon after a change.
 */
const KEY = "va-stamps:v1";
const hooks = new Set<() => void>();

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
export const stampOf = (name: string) => read()[name] ?? 0;
export function setStamp(name: string, t: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: t }));
  } catch {
    /* private mode */
  }
}
/** A local change: newer than anything synced so far. */
export function touch(name: string) {
  setStamp(name, Date.now());
  hooks.forEach((f) => f());
}
export const onLocalChange = (fn: () => void) => (hooks.add(fn), () => void hooks.delete(fn));
