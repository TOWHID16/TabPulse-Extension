import { DEFAULT_SETTINGS, StorageKeys, getSettings, setSettings, isWhitelisted, minutes, seconds, getSession, setSession, healthScore } from './common.js';

// --- Constants ---
// You can adjust this value. It's a failsafe to suspend tabs that have been idle for a very long time.
const LONG_IDLE_MINUTES = 30;

// --- State Management ---
async function getTabState(tabId) {
  const allState = (await getSession(StorageKeys.TAB_STATE)) || {};
  return allState[tabId] || {};
}

async function updateTabState(tabId, patch) {
  const allState = (await getSession(StorageKeys.TAB_STATE)) || {};
  allState[tabId] = { ...(allState[tabId] || {}), ...patch };
  await setSession(StorageKeys.TAB_STATE, allState);
}

async function removeTabState(tabId) {
  const allState = (await getSession(StorageKeys.TAB_STATE)) || {};
  delete allState[tabId];
  await setSession(StorageKeys.TAB_STATE, allState);
}


// --- Event Listeners to Track Tab Activity ---
// This robustly tracks the last time a user interacted with any tab.
function updateActivity(tabId) {
    if (tabId && tabId > 0) {
        updateTabState(tabId, { lastInputAt: Date.now() });
    }
}
chrome.tabs.onActivated.addListener(activeInfo => updateActivity(activeInfo.tabId));
chrome.windows.onFocusChanged.addListener(windowId => {
    if (windowId > 0) {
        chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
            if (tabs[0]) updateActivity(tabs[0].id);
        });
    }
});
// A new tab is considered "active" at the moment it's created.
chrome.tabs.onCreated.addListener(tab => updateActivity(tab.id));


// Listener for messages from content scripts and the popup UI
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = msg.tabId || sender.tab?.id;
    if (!tabId && msg.type !== 'get-at-risk-tabs') return;

    switch (msg.type) {
      case 'thm:user-input': await updateActivity(tabId); break;
      case 'thm:network-activity': await updateTabState(tabId, { lastNetworkAt: Date.now() }); break;
      case 'thm:media-playing': await updateTabState(tabId, { mediaPlaying: !!msg.playing }); break;
      case 'thm:websocket-active': await updateTabState(tabId, { websocketActive: !!msg.active }); break;
      case 'thm:heuristics': await updateTabState(tabId, { lastHeuristics: msg.payload }); break;
      case 'thm:keep-alive': await setKeepAlive(tabId); break;
      case 'get-at-risk-tabs':
        const allState = (await getSession(StorageKeys.TAB_STATE)) || {};
        const atRiskTabs = [];
        for (const id in allState) {
          if (allState[id].warnedAt) {
            atRiskTabs.push({ id: parseInt(id) });
          }
        }
        sendResponse({ atRiskTabs });
        break;
    }
  })();
  return true; // Indicates an async response
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabState(tabId).catch(console.error);
});

// Listener for the notification buttons ("Keep Alive", "Suspend Now")
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (!notifId.startsWith('thm_warn_')) return;
  const tabId = parseInt(notifId.split('_').pop(), 10);
  if (Number.isNaN(tabId)) return;

  if (btnIdx === 0) { // "Keep Alive" button
    await setKeepAlive(tabId);
    await updateTabState(tabId, { warnedAt: null });
  } else if (btnIdx === 1) { // "Suspend Now" button
    await trySuspend(tabId, { force: true });
  }
  // Clear the notification after any button is clicked.
  chrome.notifications.clear(notifId);
});


// --- Core Scheduling Logic ---
async function schedule() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const tabs = await chrome.tabs.query({ discarded: false, status: 'complete' });
  const now = Date.now();

  for (const tab of tabs) {
    // Skip special tabs and the currently active tab
    if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.active) continue;

    const t = await getTabState(tab.id);
    // If a tab has never been tracked, initialize its timer now and check it on the next cycle.
    if (!t.lastInputAt) {
      await updateTabState(tab.id, { lastInputAt: now });
      continue;
    }

    // --- Safeguard Checks ---
    if (await isKeepAlive(tab.id)) continue;
    if (settings.whitelistPinned && tab.pinned) continue;
    if (isWhitelisted(tab.url, settings)) continue;
    
    const mediaPlaying = settings.doNotSuspendMediaPlaying && (t.mediaPlaying || tab.audible);
    if (mediaPlaying) continue;

    const realtime = settings.doNotSuspendRealtimeApps && t.websocketActive;
    if (realtime) continue;

    const netIdleMs = now - (t.lastNetworkAt || 0);
    const networkActive = settings.doNotSuspendNetworkActive && netIdleMs < seconds(20);
    if (networkActive) continue;
    
    // --- Suspension Decision Logic ---
    const idleMs = now - t.lastInputAt;
    const overIdle = idleMs >= minutes(settings.idleMinutes);
    
    if (overIdle) {
        const isVeryIdle = idleMs >= minutes(LONG_IDLE_MINUTES);
        const heur = t.lastHeuristics || { jankMs: 0, rafFps: 60 };
        const score = healthScore({ ...heur, idleMs });
        const isUnhealthy = score < 40;

        // Suspend if the tab is EITHER unhealthy OR has been idle for a very long time.
        if (isUnhealthy || isVeryIdle) {
            if (!t.warnedAt) {
                await updateTabState(tab.id, { warnedAt: now });
                await showWarnNotification(tab.id, settings);
            } else if (now - t.warnedAt >= seconds(settings.gracePeriodSec)) {
                await trySuspend(tab.id);
            }
        }
    } else {
        // If the tab is no longer idle but was previously warned, clear the warning.
        if (t.warnedAt) {
            await updateTabState(tab.id, { warnedAt: null });
        }
    }
  }
}

async function showWarnNotification(tabId, settings) {
  const notifId = `thm_warn_${tabId}`;
  try {
    const tab = await chrome.tabs.get(tabId);
    // If tab was closed before notification could be created, tab will be undefined.
    if (!tab) return; 

    const notificationOptions = {
      type: 'basic',
      iconUrl: 'icons/icon128.png', // This requires your icon file to be correct.
      title: 'TabPulse Will Suspend a Tab',
      message: `The tab "${tab.title}" is idle and will be suspended to save memory.`,
      priority: 2,
      buttons: [{ title: 'Keep Alive' }, { title: 'Suspend Now' }]
    };
    chrome.notifications.create(notifId, notificationOptions);

  } catch (error) {
    console.error(`Failed to create notification for tab ${tabId}. The icon file might be missing or corrupt.`, error);
  }
}

async function trySuspend(tabId, { force = false } = {}) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && !tab.discarded) {
        await chrome.tabs.discard(tabId);
        await updateTabState(tabId, { warnedAt: null });
    }
  } catch (e) {
    console.warn(`Could not discard tab ${tabId}:`, e);
  }
}

async function setKeepAlive(tabId) {
    const settings = await getSettings();
    const expiresAt = Date.now() + minutes(settings.keepAliveMinutes);
    const keep = (await getSession(StorageKeys.KEEPALIVE)) || {};
    keep[tabId] = expiresAt;
    await setSession(StorageKeys.KEEPALIVE, keep);
}

async function isKeepAlive(tabId) {
    const keep = (await getSession(StorageKeys.KEEPALIVE)) || {};
    return keep[tabId] && keep[tabId] > Date.now();
}


// --- Initialization ---
chrome.runtime.onInstalled.addListener(async () => {
  await setSettings({});
  await setSession(StorageKeys.TAB_STATE, {});
  // Set the alarm to run based on the interval in default settings (e.g., every 10 seconds)
  chrome.alarms.create('thm_tick', { periodInMinutes: DEFAULT_SETTINGS.checkIntervalSec / 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'thm_tick') {
    schedule().catch(console.error);
  }
});