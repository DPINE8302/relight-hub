// Coarse operational observations only: never collect URLs, error messages,
// stack traces, element content, browser versions or exact timing samples.
export const SITE_ERRORS = ['runtime-error','unhandled-rejection','resource-error','wall-read-failed','wall-write-failed'];
export const LOAD_BUCKETS = ['load-under-1s','load-1-3s','load-3-6s','load-over-6s'];
export function loadBucket(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  return LOAD_BUCKETS[milliseconds < 1000 ? 0 : milliseconds < 3000 ? 1 : milliseconds < 6000 ? 2 : 3];
}
let navigationReported = false;
/** @param {(type:string, detail:{section:string})=>void} report @param {Window & typeof globalThis} env */
export function observeWebHealth(report, env = window) {
  const counts = new Map();
  let stopped = false;
  const send = (section) => {
    const count = counts.get(section) || 0;
    if (stopped || count >= 5) return;
    counts.set(section, count + 1);
    report('site_error', {section});
  };
  const error = (event) => send(event.target === env ? 'runtime-error' : 'resource-error');
  const rejection = () => send('unhandled-rejection');
  const load = () => {
    if (stopped || navigationReported) return;
    const entry = env.performance.getEntriesByType('navigation')[0];
    // Soft navigation is not a second document load. Do not attribute the old
    // document's measurement to a different route when consent changes later.
    if (!entry || new URL(entry.name).pathname !== env.location.pathname || entry.duration <= 0) return;
    const section = loadBucket(entry.duration);
    if (section) { navigationReported = true; report('site_performance', {section}); }
  };
  // Navigation duration is finalized after the load event dispatch finishes.
  const loaded = () => { timer = env.setTimeout(load, 0); };
  let timer = 0;
  env.addEventListener('error', error, true);
  env.addEventListener('unhandledrejection', rejection);
  env.addEventListener('load', loaded);
  if (env.document.readyState === 'complete') loaded();
  return () => {
    stopped = true; env.clearTimeout(timer);
    env.removeEventListener('error', error, true);
    env.removeEventListener('unhandledrejection', rejection);
    env.removeEventListener('load', loaded);
  };
}
