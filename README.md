# TabPulse (MV3)

Smart, customizable auto‑suspension for Chrome tabs with grace‑period warnings, activity detection (media/network/realtime), and user‑friendly whitelists.

## Features
- **Grace‑period warnings** with actionable buttons (Keep Alive / Suspend Now)
- **Smart activity detection**: user input, media playing, recent network requests, WebSocket usage
- **Customizable thresholds**: idle minutes, heuristic CPU/memory, grace period
- **Whitelists & safeguards**: pinned tabs, audible tabs, domain list
- **Manual Keep‑Alive** from popup (configurable duration)
- **Simple restore**: scroll position & basic inputs after reload

## Limitations
- Chrome Stable does **not** expose precise per‑tab CPU/Memory. We approximate health via event‑loop lag, frame rate, and activity.
- For exact resource metrics you’d need the `chrome.processes` API on Chrome Canary/Dev with special flags; this extension avoids that to stay broadly compatible.

## Install (Developer Mode)
1. Clone or download this folder.
2. Open **chrome://extensions**.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Pin the extension icon for quick access.

## How It Works
- A background service worker keeps per‑tab metadata (last input, network, media, websocket).
- A content script instruments `fetch`/`XMLHttpRequest`, media elements, and `WebSocket` to send activity pings.
- Every **10s** the scheduler evaluates tabs. If a tab is idle and unhealthy and not whitelisted → show a warning. After the **grace period** (default 60s) it calls `chrome.tabs.discard(tabId)`.
- Discarding unloads memory but keeps the tab visible. Clicking the tab reloads the page. The content script restores scroll and some inputs when possible.

## Configuration
Open the extension **Options** page to set thresholds and whitelist domains.

## Development Tips
- Use **chrome://discards** to see discardable tabs and test behavior.
- Use **chrome://performance** and **DevTools Performance Monitor** to observe tab activity while testing.

## Security & Privacy
- No external network calls. All data stays local in `chrome.storage`.
- Only minimal per‑tab metadata is stored.

## Roadmap
- ML‑based prediction of “come back soon” tabs.
- Per‑site profiles (aggressive vs. gentle suspension).
- Export/import settings.