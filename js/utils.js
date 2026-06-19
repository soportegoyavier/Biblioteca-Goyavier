// ── HELPER: timeout para cualquier Promise ───────────────────
function withTimeout(promise, ms, msg) {
  const t = new Promise((_, reject) => setTimeout(() => reject(new Error(msg || 'Tiempo de espera agotado (' + ms/1000 + 's)')), ms));
  return Promise.race([promise, t]);
}

// ── UTILS FINANCIEROS ─────────────────────────────────────────
function fmtPesos(n) {
  return '$' + Math.round(n||0).toLocaleString('es-CO');
}

// ── UTILS ─────────────────────────────────────────────────────
function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' });
}
function badge(estado) {
  const m = {
    pendiente:['b-pendiente','Pendiente'],
    recibido: ['b-recibido', 'Recibido'],
    impreso:  ['b-impreso',  'Impreso'],
    entregado:['b-entregado','Entregado'],
    cancelado:['b-cancelado','Cancelado'],
  };
  const [cls,txt] = m[estado]||['b-pendiente','—'];
  return `<span class="badge ${cls}">${txt}</span>`;
}
function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type='info', dur=4500) {
  const tc  = document.getElementById('tc');
  const ico = {success:'<i class="fa fa-circle-check"></i>',error:'<i class="fa fa-circle-xmark"></i>',info:'<i class="fa fa-circle-info"></i>'};
  const el  = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${ico[type]||'ℹ️'}</span><span>${msg}</span>`;
  tc.appendChild(el);
  setTimeout(() => { el.style.animation='slideOut .3s ease forwards'; setTimeout(()=>el.remove(),300); }, dur);
}

// ── GAS JSONP ────────────────────────────────────────────────
function gasCall(accion, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = '_gc_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    let sc;
    const t = setTimeout(() => {
      delete window[cb]; sc?.remove();
      reject(new Error('Timeout al contactar el servidor de Gmail'));
    }, 50000);
    window[cb] = data => {
      clearTimeout(t); delete window[cb]; sc?.remove();
      data?.error ? reject(new Error(data.error)) : resolve(data);
    };
    sc = document.createElement('script');
    sc.src = GAS_URL + '?payload=' + encodeURIComponent(JSON.stringify({ accion, ...params })) + '&callback=' + cb;
    sc.onerror = () => { clearTimeout(t); delete window[cb]; reject(new Error('Error de red con GAS')); };
    document.head.appendChild(sc);
  });
}

// ── MODALES ───────────────────────────────────────────────────
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('keydown', e => {
  if(e.key==='Escape') document.querySelectorAll('.mo.open').forEach(o => o.classList.remove('open'));
});
