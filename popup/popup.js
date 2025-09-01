import { getSettings, setSettings, StorageKeys } from '../src/common.js';

// Helper function to format the duration text
function formatDuration(minutes) {
  if (minutes < 60) {
    return `(${minutes}m)`;
  }
  // Use Math.round to handle cases like 90 minutes -> 1.5 -> 2h. For more precision, you could use toFixed(1).
  const hours = Math.round(minutes / 60);
  return `(${hours}h)`;
}

async function init() {
  try {
    const s = await getSettings();
    
    // --- On/Off Button Logic ---
    const btn = document.getElementById('toggle');
    btn.textContent = s.enabled ? 'On' : 'Off';
    btn.onclick = async () => {
      const n = await setSettings({ enabled: !s.enabled });
      btn.textContent = n.enabled ? 'On' : 'Off';
    };

    // --- Settings Button Logic ---
    document.getElementById('openOptions').onclick = () => chrome.runtime.openOptionsPage();
    
    // --- Keep Alive Button Logic ---
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const keepAliveBtn = document.getElementById('keepAlive');
    
    // **NEW CODE**: Update the button text based on settings
    keepAliveBtn.textContent = `Keep Alive ${formatDuration(s.keepAliveMinutes)}`;

    keepAliveBtn.onclick = () => {
        chrome.runtime.sendMessage({ type: 'thm:keep-alive', tabId: activeTab.id });
        keepAliveBtn.textContent = 'Kept Alive!';
        keepAliveBtn.disabled = true;
        setTimeout(() => {
            keepAliveBtn.textContent = `Keep Alive ${formatDuration(s.keepAliveMinutes)}`;
            keepAliveBtn.disabled = false;
        }, 2000);
    };

    // --- Current Tab Display ---
    document.getElementById('current').textContent = activeTab.title;

    // --- At Risk Tabs Display ---
    const atriskUl = document.getElementById('atrisk');
    atriskUl.innerHTML = '';

    chrome.runtime.sendMessage({ type: 'get-at-risk-tabs' }, async (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        atriskUl.textContent = 'Could not load data.';
        return;
      }
      
      const { atRiskTabs } = response;

      if (!atRiskTabs || atRiskTabs.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No tabs are currently at risk.';
        li.style.color = '#666';
        atriskUl.appendChild(li);
        return;
      }

      const tabIds = atRiskTabs.map(t => t.id);
      const allTabs = await chrome.tabs.query({});
      const relevantTabs = allTabs.filter(t => tabIds.includes(t.id));

      relevantTabs.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = `${t.title || t.url}`;
        atriskUl.appendChild(li);
      });
    });

  } catch (err) {
    console.error('Popup init failed:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);