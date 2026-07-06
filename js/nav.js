// ── NAVEGACIÓN ───────────────────────────────────────────────
function navTo(page, el, mobId) {
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.mni').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const titulos = {
    dashboard:'Dashboard', copias:'Gestión de Copias', reportes:'Reportes',
    ventas:'Ventas / Personal', caja:'Caja', notificaciones:'Notificaciones',
    colaboradores:'Colaboradores', materiales:'Materiales y Préstamos',
    auditoria:'Auditoría'
  };
  document.getElementById('topbar-title').textContent = titulos[page] || page;

  if (el) el.classList.add('active');
  document.querySelector(`.ni[data-page="${page}"]`)?.classList.add('active');
  if (mobId) document.getElementById(mobId)?.classList.add('active');
  document.getElementById('page-' + page).classList.add('active');
  _pagina = page;

  const esCopias = page === 'copias';
  const esVentas = page === 'ventas';
  document.getElementById('mes-nav').style.display  = (esCopias || esVentas) ? '' : 'none';
  _actualizarBtnSync();

  if (page === 'dashboard')      cargarDashboard();
  if (page === 'copias')         cargarSolicitudes();
  if (page === 'reportes')       cargarReportes();
  if (page === 'ventas')         cargarVentas();
  if (page === 'caja')           { _initCajaFecha(); cargarCaja(); }
  if (page === 'notificaciones') { cargarNotificaciones(); cargarTiposCopia(); }
  if (page === 'colaboradores')  cargarColaboradores();
  if (page === 'materiales')     cargarMateriales();
  if (page === 'auditoria')      cargarAuditoria();

  toggleMobileMenu(false); // si se navegó desde el drawer móvil, se cierra solo
}

// Solo se puede sincronizar el mes actual: sincronizar un mes pasado
// termino siendo la via para reimportar por accidente correos que ya
// fueron eliminados/bloqueados a proposito, ademas de no tener sentido
// una vez que archivarAdjuntosAntiguos() (WebApp_Backend.gs) ya movio
// los archivos de ese mes a Drive.
function _actualizarBtnSync() {
  const btn = document.getElementById('btn-sync');
  if (!btn) return;
  const esCopiasOVentas = _pagina === 'copias' || _pagina === 'ventas';
  const esMesActual     = _ano === _hoy.getFullYear() && _mes === _hoy.getMonth();
  btn.style.display = esCopiasOVentas ? '' : 'none';
  btn.disabled       = !esMesActual;
  btn.title          = esMesActual ? '' : 'Solo se puede sincronizar el mes actual';
}

// ── DRAWER MÓVIL (hamburguesa) ─────────────────────────────────
function toggleMobileMenu(forzar) {
  const sb = document.querySelector('.sb');
  const bg = document.querySelector('.sb-backdrop');
  if (!sb || !bg) return;
  const abrir = forzar !== undefined ? forzar : !sb.classList.contains('open');
  sb.classList.toggle('open', abrir);
  bg.classList.toggle('open', abrir);
}

function refreshPage() {
  if      (_pagina === 'dashboard')      cargarDashboard();
  else if (_pagina === 'copias')         cargarSolicitudes();
  else if (_pagina === 'reportes')       cargarReportes();
  else if (_pagina === 'ventas')         cargarVentas();
  else if (_pagina === 'caja')           cargarCaja();
  else if (_pagina === 'notificaciones') { cargarNotificaciones(); cargarTiposCopia(); }
  else if (_pagina === 'colaboradores')  cargarColaboradores();
  else if (_pagina === 'materiales')     cargarMateriales();
  else if (_pagina === 'auditoria')      cargarAuditoria();
}

// ── MES ──────────────────────────────────────────────────────
function actualizarMesLabel() {
  const txt = MESES[_mes] + ' ' + _ano;
  ['mes-lbl','mes-lbl-mob','mes-lbl-v'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = txt; });
  const esHoy = _ano === _hoy.getFullYear() && _mes === _hoy.getMonth();
  ['btn-mes-sig','btn-mes-sig-mob','btn-mes-sig-v'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = esHoy; });
}

function cambiarMes(d) {
  _mes += d;
  if (_mes < 0)  { _mes = 11; _ano--; }
  if (_mes > 11) { _mes = 0;  _ano++; }
  actualizarMesLabel();
  _actualizarBtnSync();
  if (_pagina === 'copias') cargarSolicitudes();
  if (_pagina === 'ventas') cargarVentas();
}

// ── SINCRONIZAR ──────────────────────────────────────────────
async function sincronizar() {
  const esMesActual = _ano === _hoy.getFullYear() && _mes === _hoy.getMonth();
  if (!esMesActual) { toast('Solo se puede sincronizar el mes actual', 'error'); return; }

  const btn = document.getElementById('btn-sync');
  const ico = document.getElementById('sync-ico');
  const lbl = document.getElementById('sync-lbl');
  if (btn) btn.disabled = true;
  if (ico) ico.className = 'fa fa-rotate-right fa-spin-fast';
  lbl.textContent = 'Sincronizando...';

  // Ventas usa fecha mínima para no cargar correos anteriores al sistema
  const esVentasPage  = _pagina === 'ventas';
  const FECHA_INICIO  = '2026-06-01';

  let totalAgregados = 0;
  let offset = 0;
  let vuelta = 0;
  const MAX_VUELTAS = 15;

  try {
    while (vuelta < MAX_VUELTAS) {
      vuelta++;
      if (vuelta > 1) lbl.textContent = `Sincronizando (${vuelta})...`;

      const callParams = { mes: _mes, ano: _ano, startOffset: offset, maxMessages: 8, maxMs: 22000 };
      if (esVentasPage) callParams.fechaMinima = FECHA_INICIO;

      const res = await gasCall('sincronizarCorreos', callParams);
      if (res.error) throw new Error(res.error);
      totalAgregados += res.agregados || 0;

      if (res.parcial && res.nextOffset !== undefined && res.nextOffset > offset) {
        offset = res.nextOffset;
      } else {
        break;
      }
    }

    const msg = totalAgregados > 0
      ? `${totalAgregados} correo${totalAgregados !== 1 ? 's' : ''} nuevo${totalAgregados !== 1 ? 's' : ''}`
      : `Sin correos nuevos en ${MESES[_mes]}`;
    toast(msg, 'success');

    if (esVentasPage) {
      await cargarVentas();
    } else {
      await cargarSolicitudes();
      await actualizarBadges();
    }
  } catch(e) {
    toast('Error al sincronizar: ' + e.message, 'error');
  } finally {
    _actualizarBtnSync();
    if (ico) ico.className = 'fa fa-rotate-right';
    lbl.textContent = 'Sincronizar';
  }
}

// ── BADGES ────────────────────────────────────────────────────
async function actualizarBadges() {
  try {
    const { data } = await _sb.from('bib_solicitudes').select('estado').in('estado',['recibido','impreso']);
    _actualizarBadgeUI((data||[]).length);
  } catch(_) {}
}
function _actualizarBadgeUI(n) {
  ['nb-copias'].forEach(id => { const el=document.getElementById(id); if(el){el.textContent=n;el.style.display=n>0?'':'none';} });
  ['mnb-copias'].forEach(id => { const el=document.getElementById(id); if(el){el.textContent=n;el.style.display=n>0?'':'none';} });
}
