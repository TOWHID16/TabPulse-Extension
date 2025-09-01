(function restore(){
  try {
    const key = 'thm_restore_' + location.href;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.scrollY) window.scrollTo({ top: data.scrollY });
    if (Array.isArray(data.inputs)) {
      data.inputs.forEach(({ sel, value }) => {
        const el = safeSelect(sel);
        if (!el) return;
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!value; else el.value = value;
      });
    }
  } catch {}
})();

function safeSelect(sel){
  try { return document.querySelector(sel); } catch { return null; }
}