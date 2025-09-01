export const DEFAULT_SETTINGS = {
  enabled: true,
  idleMinutes: 10,                  // user inactive in the TAB (no input) for >= N minutes
  memoryLimitMB: 250,               // heuristic (approx via activity/jank; real memory reading not on stable)
  cpuLimitPercent: 30,              // heuristic via event‑loop lag
  gracePeriodSec: 60,               // warn, then suspend after this many seconds
  checkIntervalSec: 10,             // scheduler tick
  whitelistDomains: ["youtube.com", "music.youtube.com", "docs.google.com"],
  whitelistPinned: true,
  doNotSuspendAudible: true,
  doNotSuspendMediaPlaying: true,
  doNotSuspendNetworkActive: true,
  doNotSuspendRealtimeApps: true,
  keepAliveMinutes: 120             // manual Keep‑Alive per tab duration
};

export const StorageKeys = {
  SETTINGS: 'thm_settings',
  TAB_STATE: 'thm_tab_state',       // chrome.storage.session preferred, falls back to local
  KEEPALIVE: 'thm_keepalive'        // map<tabId, expiresAt>
};

export function domainFromUrl(url) {
  try { return new URL(url).hostname || ''; } catch { return ''; }
}

export function isWhitelisted(url, settings) {
  const host = domainFromUrl(url);
  return settings.whitelistDomains.some(d => host.endsWith(d));
}

export function minutes(n) { return n * 60 * 1000; }
export function seconds(n) { return n * 1000; }

export async function getSettings() {
  const { [StorageKeys.SETTINGS]: s } = await chrome.storage.sync.get(StorageKeys.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export async function setSettings(patch) {
  const s = await getSettings();
  const next = { ...s, ...patch };
  await chrome.storage.sync.set({ [StorageKeys.SETTINGS]: next });
  return next;
}

export async function getSession(key) {
  if (chrome.storage.session) {
    const v = await chrome.storage.session.get(key);
    return v[key];
  }
  const v = await chrome.storage.local.get(key);
  return v[key];
}

export async function setSession(key, value) {
  if (chrome.storage.session) return chrome.storage.session.set({ [key]: value });
  return chrome.storage.local.set({ [key]: value });
}

export function healthScore(heuristics) {
  // 100 = healthy, 0 = very bad.
  // Inputs: { idleMs, jankMs, rafFps, networkActive, mediaPlaying }
  let score = 100;
  if (heuristics.idleMs > minutes(10)) score -= 10; // idle long → more willing to suspend
  score -= Math.min(40, Math.max(0, heuristics.jankMs / 50)); // event loop lag
  if (heuristics.rafFps < 20) score -= 20;
  if (heuristics.networkActive) score -= 10;
  if (heuristics.mediaPlaying) score -= 30; // but we likely won’t suspend if playing
  return Math.max(0, Math.min(100, Math.round(score)));
}