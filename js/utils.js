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
    preparado:['b-impreso',  'Preparado'],
    entregado_parcial:['b-parcial','Entrega parcial'],
    entregado:['b-entregado','Entregado'],
    cancelado:['b-cancelado','Cancelado'],
    activo:   ['b-recibido', 'Activo'],
    devuelto: ['b-entregado','Devuelto'],
    vencido:  ['b-cancelado','Vencido'],
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
// El backend (WebApp_Backend.gs) valida este access_token contra Supabase
// Auth antes de ejecutar cualquier acción -- sin sesión real de
// biblioteca@colegiogoyavier.edu.co, el endpoint responde "No autorizado".
//
// Reintentos: el patrón <script src=...> (JSONP, no fetch) hace que
// "Error de red con GAS" salga tanto por una falla de red real como por que
// Google tarda en arrancar una nueva ejecución del Web App bajo carga
// (síntoma observado: aparece justo cuando el usuario reintenta varias veces
// seguidas). También se reintenta el caso { locked: true } que devuelve
// sincronizarCorreos() cuando ya hay otra sincronización en curso (por el
// trigger automático o por otra pestaña) -- es justamente el caso más
// transitorio de todos, basta esperar un momento. Nunca se reintentan otros
// errores de negocio que ya llegaron como respuesta válida de GAS (ej. "No
// autorizado"), esos no se arreglan reintentando.
//
// reintentarTransporte=false (bug real encontrado probando con Playwright,
// 2026-08-06): un timeout/error de red del lado del cliente NO significa que
// el servidor no haya completado la ejecución -- GAS sigue corriendo aunque
// el navegador ya haya abandonado el <script> tag. Para acciones de
// escritura NO idempotentes hacia Zaiko (zaikoSalidaParcial,
// zaikoDevolucionParcial, zaikoPrestar, zaikoDevolver, zaikoCargarConteo,
// zaikoRegistrarLibro) esto causó una devolución duplicada: el cliente vio
// un fallo transitorio, reintentó, y ambos intentos terminaron aplicándose
// en Zaiko. { locked: true } sí sigue siendo seguro de reintentar siempre
// -- ese caso es una respuesta válida de GAS que garantiza que la acción
// todavía NO se ejecutó.
async function gasCall(accion, params = {}, opciones = {}) {
  const { reintentarTransporte = true, _intento = 0 } = opciones;
  const MAX_REINTENTOS = 2;
  const { data: { session } } = await _sb.auth.getSession();
  try {
    return await new Promise((resolve, reject) => {
      const cb = '_gc_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      let sc;
      const t = setTimeout(() => {
        delete window[cb]; sc?.remove();
        reject(new Error('Timeout al contactar el servidor de Gmail'));
      }, 50000);
      window[cb] = data => {
        clearTimeout(t); delete window[cb]; sc?.remove();
        if (data?.error) {
          const err = new Error(data.error);
          if (data.locked) err.locked = true;
          reject(err);
        } else {
          resolve(data);
        }
      };
      sc = document.createElement('script');
      sc.src = GAS_URL + '?payload=' + encodeURIComponent(JSON.stringify({ accion, ...params, token: session?.access_token || '' })) + '&callback=' + cb;
      sc.onerror = () => { clearTimeout(t); delete window[cb]; reject(new Error('Error de red con GAS')); };
      document.head.appendChild(sc);
    });
  } catch (e) {
    const esFalloTransporte = e.message === 'Error de red con GAS' || e.message.indexOf('Timeout al contactar') === 0;
    const debeReintentar = (esFalloTransporte && reintentarTransporte) || e.locked;
    if (debeReintentar && _intento < MAX_REINTENTOS) {
      await new Promise(r => setTimeout(r, 800 * (_intento + 1)));
      return gasCall(accion, params, { reintentarTransporte, _intento: _intento + 1 });
    }
    throw e;
  }
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

// ── TEMA CLARO / OSCURO ───────────────────────────────────────
function _aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  const lbl = document.getElementById('theme-lbl');
  if (lbl) lbl.textContent = tema === 'light' ? 'Modo oscuro' : 'Modo claro';
}
function toggleTema() {
  const actual = document.documentElement.getAttribute('data-theme');
  const nuevo = actual === 'light' ? 'dark' : 'light';
  _aplicarTema(nuevo);
  localStorage.setItem('bib_tema', nuevo);
}
// Aplicar tema guardado al cargar
_aplicarTema(localStorage.getItem('bib_tema') || 'light');

// ── MODALES ───────────────────────────────────────────────────
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('keydown', e => {
  if(e.key==='Escape') document.querySelectorAll('.mo.open').forEach(o => o.classList.remove('open'));
});
