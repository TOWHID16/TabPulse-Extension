// Send helper
function send(type, payload) {
  // CRITICAL FIX: Check if the runtime is available and wrap the call in a try...catch block.
  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
      // This will catch the "Extension context invalidated" error.
      // We can safely ignore it because the page is likely unloading or the extension was reloaded.
      console.warn(`TabPulse: Could not send message of type "${type}". Context may be invalidated.`);
    }
  }
}

// 1) User input → resets idle clock
['pointerdown','click','keydown','wheel','touchstart','mousemove','scroll'].forEach(evt => {
  window.addEventListener(evt, () => send('thm:user-input'), { passive: true });
});

// 2) Network activity (fetch/xhr)
(function wrapNetwork(){
  const origFetch = window.fetch;
  window.fetch = async function(...args){
    send('thm:network-activity');
    try { return await origFetch.apply(this, args); }
    finally { /* no-op */ }
  };
  const OrigXHR = window.XMLHttpRequest;
  function XHR(){ const x = new OrigXHR(); x.addEventListener('loadstart', () => send('thm:network-activity')); return x; }
  XHR.prototype = OrigXHR.prototype; window.XMLHttpRequest = XHR;
})();

// 3) Media playing detection
(function mediaWatch(){
  function hook(el){
    const update = () => send('thm:media-playing', { playing: !el.paused && !el.ended && el.currentTime > 0 });
    ['play','pause','ended','waiting','seeking'].forEach(e=> el.addEventListener(e, update, { passive: true }));
    update();
  }
  const scan = () => document.querySelectorAll('video,audio').forEach(hook);
  const mo = new MutationObserver(scan); mo.observe(document.documentElement, { subtree: true, childList: true });
  scan();
})();

// 4) WebSocket activity
(function wsWatch(){
  const OrigWS = window.WebSocket;
  function WS(url, protocols){ const ws = new OrigWS(url, protocols); send('thm:websocket-active', { active: true }); ws.addEventListener('close', ()=> send('thm:websocket-active', { active: false })); return ws; }
  WS.prototype = OrigWS.prototype; window.WebSocket = WS;
})();

// 5) Heuristics: event‑loop lag (jank) and rAF fps
(function heuristics(){
  let lastTs = performance.now();
  let jankMs = 0;
  setInterval(()=>{
    const now = performance.now();
    const drift = now - lastTs - 1000; // expected 1000ms
    if (drift > 0) jankMs += drift; else jankMs *= 0.9; // decay
    lastTs = now;
  }, 1000);

  let frames = 0; let lastFpsAt = performance.now(); let rafFps = 60;
  function loop(){ frames++; const now = performance.now(); if (now - lastFpsAt >= 1000){ rafFps = frames; frames = 0; lastFpsAt = now; }
    requestAnimationFrame(loop);
  } requestAnimationFrame(loop);

  setInterval(()=>{
    const idleMs = 0; // computed in background using lastInputAt; here we just ship jank & fps
    send('thm:heuristics', { jankMs, rafFps, idleMs });
  }, 5000);
})();

// 6) Manual Keep‑Alive button (page action)
(function mountKeepAliveBadge(){
  // No DOM UI here; available via popup. Kept placeholder for future inline bubble.
})();

// 7) Save scroll & simple inputs before unload
window.addEventListener('beforeunload', () => {
  try {
    const key = 'thm_restore_' + location.href;
    const data = {
      scrollY: window.scrollY,
      inputs: Array.from(document.querySelectorAll('input,textarea,select')).slice(0, 50).map(el=>({
        sel: cssPath(el),
        value: (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value
      }))
    };
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {}
});

function cssPath(el){
  if (!(el instanceof Element)) return '';
  const path = [];
  for (; el && el.nodeType === Node.ELEMENT_NODE; el = el.parentElement){
    let sel = el.nodeName.toLowerCase();
    if (el.id){ sel += '#'+el.id; path.unshift(sel); break; }
    else {
      let sib = el, nth = 1;
      while (sib = sib.previousElementSibling){ if (sib.nodeName.toLowerCase() === el.nodeName.toLowerCase()) nth++; }
      sel += `:nth-of-type(${nth})`;
    }
    path.unshift(sel);
  }
  return path.join('>');
}