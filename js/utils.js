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

// ── VER ARCHIVO EN NUEVA PESTAÑA ─────────────────────────────
// PDF/imagen → blob URL (visor nativo del navegador)
// Office (doc/xls/ppt) → Microsoft Office Online Viewer
async function verArchivo(url, mime) {
  const officeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  const isOffice = officeTypes.includes(mime) ||
    /\.(doc|docx|xls|xlsx|ppt|pptx)(\?|$)/i.test(url);

  if (isOffice) {
    // Office Online no necesita fetch; abre síncronamente
    const viewerUrl = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(url);
    const win = window.open(viewerUrl, '_blank');
    if (!win) toast('Permite ventanas emergentes para ver archivos', 'info');
    return;
  }

  // PDF e imágenes: blob URL para forzar renderizado inline
  // Abrir ventana SÍNCRONAMENTE — si se abre tras un await el navegador lo bloquea
  const win = window.open('about:blank', '_blank');
  if (!win) { toast('Permite ventanas emergentes para ver archivos', 'info'); return; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const type = (mime && mime !== 'application/octet-stream') ? mime : 'application/pdf';
    const blob = new Blob([buf], { type });
    const blobUrl = URL.createObjectURL(blob);
    win.location.href = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  } catch(e) {
    win.close();
    toast('No se pudo abrir el archivo: ' + e.message, 'error');
  }
}

// ── LIMPIEZA AUTOMÁTICA DE ARCHIVOS ──────────────────────────
// Corre una vez por mes al iniciar sesión.
// Borra de Storage los archivos de solicitudes ya entregadas de meses anteriores.
async function limpiarArchivosAntiguos() {
  const key = 'bib_limpieza_' + _hoy.getFullYear() + '_' + _hoy.getMonth();
  if (localStorage.getItem(key)) return;
  try {
    const inicioMes = new Date(_hoy.getFullYear(), _hoy.getMonth(), 1).toISOString();
    const { data: solic } = await _sb.from('bib_solicitudes')
      .select('id').eq('estado', 'entregado').lt('fecha_recepcion', inicioMes);
    if (!solic?.length) { localStorage.setItem(key, '1'); return; }
    const { data: docs } = await _sb.from('bib_documentos')
      .select('id, storage_path').in('solicitud_id', solic.map(s => s.id)).not('storage_path', 'is', null);
    if (!docs?.length) { localStorage.setItem(key, '1'); return; }
    const paths = docs.map(d => d.storage_path);
    for (let i = 0; i < paths.length; i += 100) {
      await _sb.storage.from('biblioteca-adjuntos').remove(paths.slice(i, i + 100));
    }
    await _sb.from('bib_documentos').update({ storage_path: null }).in('id', docs.map(d => d.id));
    localStorage.setItem(key, '1');
    console.log(`[Biblioteca] Limpieza: ${docs.length} archivo(s) de meses anteriores eliminados`);
  } catch(e) {
    console.warn('[Biblioteca] Limpieza automática falló:', e.message);
  }
}

// ── MODALES ───────────────────────────────────────────────────
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('keydown', e => {
  if(e.key==='Escape') document.querySelectorAll('.mo.open').forEach(o => o.classList.remove('open'));
});
