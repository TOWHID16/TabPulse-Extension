import { getSettings, setSettings } from '../src/common.js';

async function load(){
  const s = await getSettings();
  const byId = id => document.getElementById(id);
  byId('enabled').checked = s.enabled;
  byId('idleMinutes').value = s.idleMinutes;
  byId('gracePeriodSec').value = s.gracePeriodSec;
  byId('cpuLimitPercent').value = s.cpuLimitPercent;
  byId('memoryLimitMB').value = s.memoryLimitMB;
  byId('keepAliveMinutes').value = s.keepAliveMinutes;
  byId('whitelistPinned').checked = s.whitelistPinned;
  byId('doNotSuspendAudible').checked = s.doNotSuspendAudible;
  byId('doNotSuspendMediaPlaying').checked = s.doNotSuspendMediaPlaying;
  byId('doNotSuspendNetworkActive').checked = s.doNotSuspendNetworkActive;
  byId('doNotSuspendRealtimeApps').checked = s.doNotSuspendRealtimeApps;
  byId('whitelistDomains').value = s.whitelistDomains.join('\n');
}

async function save(){
  const byId = id => document.getElementById(id);
  const s = await setSettings({
    enabled: byId('enabled').checked,
    idleMinutes: +byId('idleMinutes').value,
    gracePeriodSec: +byId('gracePeriodSec').value,
    cpuLimitPercent: +byId('cpuLimitPercent').value,
    memoryLimitMB: +byId('memoryLimitMB').value,
    keepAliveMinutes: +byId('keepAliveMinutes').value,
    whitelistPinned: byId('whitelistPinned').checked,
    doNotSuspendAudible: byId('doNotSuspendAudible').checked,
    doNotSuspendMediaPlaying: byId('doNotSuspendMediaPlaying').checked,
    doNotSuspendNetworkActive: byId('doNotSuspendNetworkActive').checked,
    doNotSuspendRealtimeApps: byId('doNotSuspendRealtimeApps').checked,
    whitelistDomains: byId('whitelistDomains').value.split(/\n+/).map(s=>s.trim()).filter(Boolean)
  });
  const status = document.getElementById('status');
  status.textContent = 'Saved!';
  setTimeout(()=> status.textContent = '', 1200);
}

document.addEventListener('DOMContentLoaded', () => {
  load().catch(console.error);
  // FIXED: Removed the useless line: document.getElementById('save').addAction = 0;
  document.getElementById('save').addEventListener('click', () => save().catch(console.error));
});