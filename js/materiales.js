// ── MATERIALES Y PRÉSTAMOS ────────────────────────────────────
// Este módulo NO es un inventario propio: registra movimientos (préstamo,
// asignación permanente, consumo) sobre el catálogo real de materiales,
// que vive en Zaiko (inventario oficial del colegio) — no en una tabla
// local. bib_materiales sigue existiendo solo como detalle interno para
// la FK de bib_movimiento_materiales, no se muestra ni se administra.

// Resumen simple (sin marca/color/tamaño/presentación) para el correo de
// devolución -- el detalle completo solo aplica al correo de entrega, que
// manda el arreglo de materiales tal cual y arma tarjetas en el backend (GAS).
function _formatMaterialesResumen(lineas) {
  return (lineas || []).map(l => {
    const cant   = l.cantidad_entregada ?? l.cantidad;
    const unidad = l.unidad_medida ?? l.unidad;
    return `${cant} ${unidad} de ${l.nombre}`;
  }).join(', ');
}

// ── NAVEGACIÓN DESDE ALERTAS DEL DASHBOARD ─────────────────────
async function irADetalleDesdeAlerta(tipo, id) {
  const navEl = document.querySelector('.ni[data-page="materiales"]');
  navTo('materiales', navEl);
  _matTab = tipo === 'libro' ? 'libros' : 'movimientos';
  await cargarMateriales();
  if (tipo === 'libro') await abrirDetalleLibro(id);
  else await abrirDetalleMovimiento(id);
}

// ── ENTRADA / TABS ─────────────────────────────────────────────
async function cargarMateriales() {
  document.getElementById('mat-tab-sel').value = _matTab;
  document.getElementById('mat-buscar').value = '';
  _matFiltro = '';
  _actualizarBotonNuevoMat();
  if (!_matCache.length) await _cargarMatCache();
  if (_matTab === 'catalogo')     await renderCatalogoMateriales();
  else if (_matTab === 'libros')  await renderLibros();
  else                            await renderMovimientos();
}

function _actualizarBotonNuevoMat() {
  const btn = document.getElementById('mat-btn-nuevo');
  if (_matTab === 'catalogo') { btn.style.display = 'none'; return; }
  btn.style.display = '';
  if (_matTab === 'libros') {
    btn.innerHTML = '<i class="fa fa-plus fa-sm"></i> Nuevo préstamo de libro';
    btn.setAttribute('onclick', 'abrirModalPrestamoLibro()');
  } else {
    btn.innerHTML = '<i class="fa fa-plus fa-sm"></i> Nuevo movimiento';
    btn.setAttribute('onclick', 'abrirModalMovimiento()');
  }
}

function cambiarTabMateriales(tab) {
  _matTab = tab;
  document.getElementById('mat-buscar').value = '';
  _matFiltro = '';
  cargarMateriales();
}

function matFiltrarDebounce() {
  clearTimeout(_matBuscarTimer);
  _matBuscarTimer = setTimeout(() => {
    _matFiltro = document.getElementById('mat-buscar').value.trim();
    if (_matTab === 'catalogo')    { _catPagina = 0; renderCatalogoMateriales(); }
    else if (_matTab === 'libros') renderLibros();
    else                           renderMovimientos();
  }, 300);
}

async function _cargarMatCache() {
  const { data } = await _sb.from('bib_materiales')
    .select('id,nombre,unidad_medida_default,marca,color,tamano,presentacion,referencia,activo')
    .order('nombre');
  _matCache = data || [];
}

async function usuarioActualEmail() {
  const { data: { user } } = await _sb.auth.getUser();
  return user?.email || 'sistema';
}

// ── LISTA DE MOVIMIENTOS ───────────────────────────────────────
async function renderMovimientos() {
  const el = document.getElementById('mat-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    let q = _sb.from('bib_movimientos')
      .select('id,id_movimiento,tipo,colaborador_nombre,area,estado,fecha_limite_devolucion,fecha_devolucion_real,recepcion_confirmada,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];
    if (_matFiltro) {
      const low = _matFiltro.toLowerCase();
      rows = rows.filter(r =>
        (r.id_movimiento || '').toLowerCase().includes(low) ||
        (r.colaborador_nombre || '').toLowerCase().includes(low) ||
        (r.area || '').toLowerCase().includes(low));
    }
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-box-archive"></i></div><p>Sin movimientos registrados</p></div>';
      return;
    }
    const tipoLbl = { prestamo:'Préstamo', asignacion:'Asignación', consumo:'Consumo' };
    el.innerHTML = `<div class="tw"><table>
      <thead><tr><th>ID</th><th>Tipo</th><th>Colaborador</th><th>Área</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${rows.map(r => `<tr onclick="abrirDetalleMovimiento(${r.id})" style="cursor:pointer">
        <td class="td-id">${escHtml(r.id_movimiento || '—')}</td>
        <td>${tipoLbl[r.tipo] || r.tipo}</td>
        <td>${escHtml(r.colaborador_nombre || '—')}</td>
        <td>${escHtml(r.area || '—')}</td>
        <td class="td-m">${fmtFecha(r.created_at)}</td>
        <td>${badge(r.estado)} ${(r.tipo === 'prestamo' || r.tipo === 'asignacion') ? _badgePrestamo(r) : ''}
          ${r.estado==='entregado' ? `<span style="font-size:11px;font-weight:600;${r.recepcion_confirmada?'color:var(--green)':'color:var(--muted)'}">${r.recepcion_confirmada?'✓ Confirmado':'⏳ Sin confirmar'}</span>` : ''}
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

function _badgePrestamo(r) {
  if (r.fecha_devolucion_real) return badge('devuelto');
  if (r.fecha_limite_devolucion) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const lim = new Date(r.fecha_limite_devolucion + 'T00:00:00');
    if (lim < hoy) return badge('vencido');
  }
  return badge('activo');
}

// ── CATÁLOGO (fuente: Zaiko) ────────────────────────────────────
// El catálogo real vive en Zaiko (inventario oficial, categoría
// biblioteca, dos subcategorías: LIBRO / MATERIAL INSTITUCIONAL, ver
// 060_biblioteca_dos_subcategorias.sql) — esta pestaña es una vista
// de lo que ya existe allá, no un catálogo propio de Biblioteca.
// Paginado de verdad (fn_listar_activos_biblioteca_paginado) porque
// cargar todo de una vez con miles de libros vuelve lenta la pantalla.
let _catSubTab  = 'material'; // 'libro' | 'material'
let _catPagina  = 0;
const _CAT_POR_PAGINA = 20;
let _catTotal   = 0;

function _badgeEstadoZaikoMaterial(estado) {
  const m = { ACTIVO: ['b-recibido', 'Activo'], AGOTADO: ['b-cancelado', 'Agotado'], 'DADO DE BAJA': ['b-cancelado', 'Dado de baja'] };
  const [cls, txt] = m[estado] || ['b-pendiente', estado || '—'];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function cambiarCatSubTab(sub) {
  _catSubTab = sub;
  _catPagina = 0;
  renderCatalogoMateriales();
}

function _catCambiarPagina(delta) {
  _catPagina = Math.max(0, _catPagina + delta);
  renderCatalogoMateriales();
}

async function renderCatalogoMateriales(forzar = false) {
  const el = document.getElementById('mat-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const subcategoria = _catSubTab === 'libro' ? 'LIBRO' : 'MATERIAL INSTITUCIONAL';
    const { data: r, error: eCat } = await _sbZaiko.rpc('fn_listar_activos_biblioteca_paginado', {
      p_subcategoria: subcategoria, p_pagina: _catPagina, p_por_pagina: _CAT_POR_PAGINA, p_query: _matFiltro || ''
    });
    if (eCat) throw new Error(eCat.message);
    if (!r.ok) throw new Error(r.msg || 'No se pudo consultar Zaiko');
    const rows = r.items || [];
    _catTotal = r.total || 0;
    const totalPaginas = Math.max(1, Math.ceil(_catTotal / _CAT_POR_PAGINA));

    const tabs = `
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <button class="btn ${_catSubTab === 'libro' ? 'btn-primary' : 'btn-ghost'}" style="padding:6px 14px;font-size:12.5px" onclick="cambiarCatSubTab('libro')">Libros</button>
        <button class="btn ${_catSubTab === 'material' ? 'btn-primary' : 'btn-ghost'}" style="padding:6px 14px;font-size:12.5px" onclick="cambiarCatSubTab('material')">Material institucional</button>
      </div>`;

    const addBtn = _catSubTab === 'libro'
      ? `<button class="btn btn-primary" onclick="abrirAgregarLibro()"><i class="fa fa-plus fa-sm"></i> Agregar libro</button>`
      : `<button class="btn btn-primary" onclick="abrirConteoZaiko()"><i class="fa fa-plus fa-sm"></i> Agregar material(es)</button>`;

    const tabla = !rows.length
      ? '<div class="empty"><div class="eico"><i class="fa fa-boxes-stacked"></i></div><p>Sin registros en Zaiko</p></div>'
      : _catSubTab === 'libro'
      ? `<div class="tw"><table>
          <thead><tr><th>ID</th><th>Título</th><th>Editorial</th><th>Área temática</th><th>Código</th><th>Estado</th></tr></thead>
          <tbody>${rows.map(m => `<tr>
            <td class="td-id">${escHtml(m.id_activo)}</td>
            <td>${escHtml(m.nombre)}</td>
            <td class="td-m">${escHtml(m.editorial || '—')}</td>
            <td class="td-m">${escHtml(m.area_tematica || '—')}</td>
            <td class="td-m">${escHtml(m.serial || '—')}</td>
            <td>${_badgeEstadoZaikoMaterial(m.estado_activo)}</td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : `<div class="tw"><table>
          <thead><tr><th>ID</th><th>Material</th><th>Detalle</th><th>Cantidad</th><th>Estado</th></tr></thead>
          <tbody>${rows.map(m => {
            const extra = [m.marca, m.color, m.tamano, m.presentacion].filter(Boolean).join(' · ');
            return `<tr>
              <td class="td-id">${escHtml(m.id_activo)}</td>
              <td>${escHtml(m.nombre)}</td>
              <td class="td-m">${extra ? escHtml(extra) : '—'}</td>
              <td class="td-m">${escHtml(m.cantidad || '0')} ${escHtml(m.unidad || 'Unidad')}</td>
              <td>${_badgeEstadoZaikoMaterial(m.estado_activo)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`;

    const paginacion = `
      <div style="display:flex;align-items:center;gap:10px;margin-top:12px;font-size:13px;color:var(--muted)">
        <button class="btn btn-ghost" style="padding:6px 10px" ${_catPagina <= 0 ? 'disabled' : ''} onclick="_catCambiarPagina(-1)"><i class="fa fa-chevron-left fa-xs"></i></button>
        <span>Página ${_catPagina + 1} de ${totalPaginas} — ${_catTotal} registro(s)</span>
        <button class="btn btn-ghost" style="padding:6px 10px" ${_catPagina + 1 >= totalPaginas ? 'disabled' : ''} onclick="_catCambiarPagina(1)"><i class="fa fa-chevron-right fa-xs"></i></button>
      </div>`;

    el.innerHTML = `
      <div class="sec-hdr"><div class="sec-title">Catálogo</div><div class="sec-hdr-line"></div></div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:12px">
        Este catálogo viene directo del inventario oficial de Zaiko — lo que agregues aquí se crea allá.
      </p>
      ${tabs}
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">${addBtn}</div>
      ${tabla}
      ${rows.length ? paginacion : ''}
    `;
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

// bib_materiales sigue existiendo como tabla interna solo para la FK de
// bib_movimiento_materiales.material_id — ya no se muestra ni se
// administra directamente, se completa sola en segundo plano.
async function obtenerOCrearMaterial(nombre, unidadDefault) {
  const nombreTrim = nombre.trim();
  const existente = _matCache.find(m => m.nombre.toLowerCase() === nombreTrim.toLowerCase());
  if (existente) return existente;
  const { data, error } = await _sb.from('bib_materiales')
    .insert({ nombre: nombreTrim, unidad_medida_default: unidadDefault || null })
    .select('id,nombre,unidad_medida_default').single();
  if (error) throw error;
  _matCache.push(data);
  return data;
}

// ── AGREGAR LIBRO AL CATÁLOGO (puente Biblioteca→Zaiko) ─────────
// Crea un ejemplar nuevo directo en Zaiko (fn_registrar_libro_biblioteca) —
// campos propios de libro (título/editorial/área temática/código), no
// los de material (marca/color/tamaño/presentación/cantidad).
function abrirAgregarLibro() {
  document.getElementById('al-titulo').value = '';
  document.getElementById('al-editorial').value = '';
  document.getElementById('al-area').value = '';
  document.getElementById('al-codigo').value = '';
  document.getElementById('al-obs').value = '';
  document.getElementById('modal-agregar-libro').classList.add('open');
}

async function guardarLibroZaiko() {
  const titulo = document.getElementById('al-titulo').value.trim();
  if (!titulo) { toast('Ingresa el título', 'error'); return; }

  const btn = document.getElementById('btn-agregar-libro-guardar');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const r = await gasCall('zaikoRegistrarLibro', {
      titulo,
      editorial: document.getElementById('al-editorial').value.trim(),
      areaTematica: document.getElementById('al-area').value.trim(),
      codigo: document.getElementById('al-codigo').value.trim(),
      observacion: document.getElementById('al-obs').value.trim(),
    });
    if (!r.ok) throw new Error(r.msg || 'Error desconocido');
    toast('✅ Libro registrado en Zaiko', 'success');
    cerrarModal('modal-agregar-libro');
    if (_matTab === 'catalogo') await renderCatalogoMateriales(true);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── CARGAR CONTEO FÍSICO EN ZAIKO (puente Biblioteca→Zaiko) ─────
// Espejo best-effort — crea en el inventario oficial de Zaiko los
// materiales que el usuario agregue aquí, con la cantidad contada.
// No es un movimiento de Biblioteca ni depende del catálogo de
// bib_materiales — es simplemente agregar uno o varios materiales
// nuevos al conteo inicial de Zaiko. Mismo patrón de línea-por-línea
// (buscar/agregar + detalles adicionales) que "Nuevo movimiento".
let _conteoZaikoTemp = [];
let _czBuscarTimer;

function abrirConteoZaiko() {
  _conteoZaikoTemp = [];
  document.getElementById('cz-mat-nombre').value = '';
  document.getElementById('cz-mat-cantidad').value = '';
  document.getElementById('cz-mat-unidad').value = 'Unidad';
  document.getElementById('cz-mat-notas').value = '';
  _limpiarCzMatExtra();
  document.getElementById('cz-mat-extra').style.display = 'none';
  document.getElementById('cz-mat-extra-ico').className = 'fa fa-plus fa-xs';
  document.getElementById('cz-mat-sugerencias').style.display = 'none';
  renderListaConteoZaiko();
  document.getElementById('modal-conteo-zaiko').classList.add('open');
}

function toggleCzMatExtra() {
  const el  = document.getElementById('cz-mat-extra');
  const ico = document.getElementById('cz-mat-extra-ico');
  const abrir = el.style.display !== 'grid';
  el.style.display = abrir ? 'grid' : 'none';
  ico.className = abrir ? 'fa fa-minus fa-xs' : 'fa fa-plus fa-xs';
}

function _limpiarCzMatExtra() {
  ['cz-mat-marca','cz-mat-color','cz-mat-tamano','cz-mat-presentacion']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function czBuscarDebounce() {
  clearTimeout(_czBuscarTimer);
  _czBuscarTimer = setTimeout(_renderSugerenciasConteoZaiko, 200);
}

let _czSugerenciasActuales = [];

async function _renderSugerenciasConteoZaiko() {
  const q = document.getElementById('cz-mat-nombre').value.trim();
  const panel = document.getElementById('cz-mat-sugerencias');
  if (!q) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.innerHTML = `<div class="ss-list"><div class="ss-opt" style="color:var(--muted);cursor:default">Buscando en Zaiko…</div></div>`;
  panel.style.display = 'block';
  const items = await _buscarZaikoCatalogo('MATERIAL INSTITUCIONAL', q, 8);
  if (document.getElementById('cz-mat-nombre').value.trim() !== q) return; // ya escribió otra cosa mientras tanto
  _czSugerenciasActuales = items.filter(m => m.estado_activo === 'ACTIVO');
  if (!_czSugerenciasActuales.length) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.innerHTML = `<div class="ss-list">${_czSugerenciasActuales.map(m => `
    <div class="ss-opt" onclick="_seleccionarMaterialSugeridoConteo('${m.id_activo}')">${escHtml(m.nombre)} <span style="color:var(--muted);font-size:11px">· ${escHtml(m.id_activo)}</span></div>
  `).join('')}</div>`;
  panel.style.display = 'block';
}

function _seleccionarMaterialSugeridoConteo(idActivo) {
  const m = _czSugerenciasActuales.find(x => x.id_activo === idActivo);
  if (!m) return;
  document.getElementById('cz-mat-nombre').value = m.nombre;
  if (m.unidad) document.getElementById('cz-mat-unidad').value = m.unidad;
  if (m.marca)        document.getElementById('cz-mat-marca').value = m.marca;
  if (m.color)        document.getElementById('cz-mat-color').value = m.color;
  if (m.tamano)        document.getElementById('cz-mat-tamano').value = m.tamano;
  if (m.presentacion)  document.getElementById('cz-mat-presentacion').value = m.presentacion;
  document.getElementById('cz-mat-sugerencias').style.display = 'none';
}

function agregarLineaConteoZaiko() {
  const nombre = document.getElementById('cz-mat-nombre').value.trim();
  if (!nombre) { toast('Ingresa el nombre del material', 'error'); return; }
  const cantidad = document.getElementById('cz-mat-cantidad').value;
  const unidad   = document.getElementById('cz-mat-unidad').value.trim() || 'Unidad';
  const marca        = document.getElementById('cz-mat-marca').value.trim();
  const color         = document.getElementById('cz-mat-color').value.trim();
  const tamano        = document.getElementById('cz-mat-tamano').value.trim();
  const presentacion  = document.getElementById('cz-mat-presentacion').value.trim();
  const notas         = document.getElementById('cz-mat-notas').value.trim();

  _conteoZaikoTemp.push({
    nombre, cantidad, unidad,
    marca: marca || null, color: color || null, tamano: tamano || null,
    presentacion: presentacion || null, notas: notas || null,
  });

  document.getElementById('cz-mat-nombre').value = '';
  document.getElementById('cz-mat-cantidad').value = '';
  document.getElementById('cz-mat-unidad').value = 'Unidad';
  document.getElementById('cz-mat-notas').value = '';
  _limpiarCzMatExtra();
  document.getElementById('cz-mat-extra').style.display = 'none';
  document.getElementById('cz-mat-extra-ico').className = 'fa fa-plus fa-xs';
  document.getElementById('cz-mat-sugerencias').style.display = 'none';
  renderListaConteoZaiko();
}

function quitarLineaConteoZaiko(idx) {
  _conteoZaikoTemp.splice(idx, 1);
  renderListaConteoZaiko();
}

function renderListaConteoZaiko() {
  const el = document.getElementById('cz-lista');
  if (!_conteoZaikoTemp.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sin materiales agregados aún</p>';
    return;
  }
  el.innerHTML = _conteoZaikoTemp.map((l, i) => {
    const extra = [l.marca, l.color, l.tamano, l.presentacion].filter(Boolean).join(' · ');
    const cant = l.cantidad === '' || l.cantidad === null || l.cantidad === undefined ? '0 (AGOTADO)' : `${l.cantidad} ${escHtml(l.unidad)}`;
    return `
    <div style="display:flex;align-items:center;gap:10px;background:var(--s3);border-radius:var(--radius-sm);padding:8px 12px">
      <div style="flex:1;font-size:13px">
        ${escHtml(l.nombre)} — <strong>${cant}</strong>
        ${extra ? `<div style="font-size:11px;color:var(--muted)">${escHtml(extra)}</div>` : ''}
        ${l.notas ? `<div style="font-size:11px;color:var(--muted)">${escHtml(l.notas)}</div>` : ''}
      </div>
      <button class="btn-cls" onclick="quitarLineaConteoZaiko(${i})" title="Quitar"><i class="fa fa-xmark fa-xs"></i></button>
    </div>`;
  }).join('');
}

async function guardarConteoZaiko() {
  if (!_conteoZaikoTemp.length) { toast('Agrega al menos un material', 'error'); return; }

  const btn = document.getElementById('btn-conteo-zaiko-guardar');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const usuario = await usuarioActualEmail();
    const r = await gasCall('zaikoCargarConteo', { items: _conteoZaikoTemp, usuario });
    if (!r.ok) throw new Error(r.msg || 'Error desconocido');
    toast('✅ ' + r.creados + ' material(es) cargado(s) en Zaiko', 'success');
    cerrarModal('modal-conteo-zaiko');
    if (_matTab === 'catalogo') await renderCatalogoMateriales(true);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── MODAL: NUEVO MOVIMIENTO ────────────────────────────────────
function abrirModalMovimiento() {
  document.getElementById('nm-tipo').value = 'prestamo';
  document.getElementById('nm-area').value = '';
  document.getElementById('nm-fecha-lim').value = '';
  document.getElementById('nm-hora-est').value = '';
  document.getElementById('nm-obs').value = '';
  document.getElementById('nm-mat-nombre').value = '';
  document.getElementById('nm-mat-cantidad').value = '';
  document.getElementById('nm-mat-unidad').value = '';
  _limpiarNmMatExtra();
  document.getElementById('nm-mat-extra').style.display = 'none';
  document.getElementById('nm-mat-extra-ico').className = 'fa fa-plus fa-xs';
  document.getElementById('nm-colab-sel').textContent = 'Sin seleccionar';
  _movColabSel = null;
  _movSolicitudOrigen = null;
  _movMaterialesTemp = [];
  clearTimeout(_matModalBuscarTimer);
  _matSugerenciasActuales = [];
  document.getElementById('nm-mat-sugerencias').style.display = 'none';
  document.getElementById('nm-mat-sugerencias').innerHTML = '';
  document.getElementById('nm-mat-cantidad').removeAttribute('max');
  document.getElementById('nm-mat-stock-hint').textContent = '';
  renderListaMaterialesTemp();
  onCambioTipoMovimiento();
  document.getElementById('modal-movimiento').classList.add('open');
}

function toggleNmMatExtra() {
  const el  = document.getElementById('nm-mat-extra');
  const ico = document.getElementById('nm-mat-extra-ico');
  const abrir = el.style.display !== 'grid';
  el.style.display = abrir ? 'grid' : 'none';
  ico.className = abrir ? 'fa fa-minus fa-xs' : 'fa fa-plus fa-xs';
}

function _limpiarNmMatExtra() {
  ['nm-mat-marca','nm-mat-color','nm-mat-tamano','nm-mat-presentacion']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function onCambioTipoMovimiento() {
  const tipo = document.getElementById('nm-tipo').value;
  document.getElementById('nm-prestamo-wrap').style.display = tipo === 'prestamo' ? 'grid' : 'none';
}

function elegirColaboradorMovimiento() {
  abrirPickerDestinatarios(async (destinatarios) => {
    if (!destinatarios.length) return;
    const elegido = destinatarios[0];
    // El picker no devuelve el id/área del colaborador (solo nombre/email) — se resuelve
    // aparte para poblar bib_movimientos.colaborador_id y autocompletar el área.
    const { data: correo } = await _sb.from('bib_colaboradores_correos')
      .select('colaborador_id, bib_colaboradores(area)').eq('email', elegido.email).limit(1).single();
    _movColabSel = { id: correo?.colaborador_id || null, nombre: elegido.nombre, email: elegido.email };
    document.getElementById('nm-colab-sel').textContent = `${_movColabSel.nombre} · ${_movColabSel.email}`;
    const area = correo?.bib_colaboradores?.area;
    if (area) document.getElementById('nm-area').value = area;
  }, () => {}, _movColabSel ? [_movColabSel] : []);
}

function matBuscarDebounce() {
  clearTimeout(_matModalBuscarTimer);
  _matModalBuscarTimer = setTimeout(_renderSugerenciasMaterial, 200);
}

let _matSugerenciasActuales = [];

async function _renderSugerenciasMaterial() {
  const q = document.getElementById('nm-mat-nombre').value.trim();
  const panel = document.getElementById('nm-mat-sugerencias');
  if (!q) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.innerHTML = `<div class="ss-list"><div class="ss-opt" style="color:var(--muted);cursor:default">Buscando en Zaiko…</div></div>`;
  panel.style.display = 'block';
  const items = await _buscarZaikoCatalogo('MATERIAL INSTITUCIONAL', q, 8);
  if (document.getElementById('nm-mat-nombre').value.trim() !== q) return; // ya escribió otra cosa mientras tanto
  _matSugerenciasActuales = items.filter(m => m.estado_activo === 'ACTIVO');
  if (!_matSugerenciasActuales.length) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = `<div class="ss-list">${_matSugerenciasActuales.map(m => `
    <div class="ss-opt" onclick="_seleccionarMaterialSugerido('${m.id_activo}')">${escHtml(m.nombre)} <span style="color:var(--muted);font-size:11px">· ${escHtml(m.id_activo)} · disponibles: ${escHtml(m.cantidad)} ${escHtml(m.unidad || '')}</span></div>
  `).join('')}</div>`;
  panel.style.display = 'block';
}

function _seleccionarMaterialSugerido(idActivo) {
  const m = _matSugerenciasActuales.find(x => x.id_activo === idActivo);
  if (!m) return;
  document.getElementById('nm-mat-nombre').value = m.nombre;
  if (m.unidad) document.getElementById('nm-mat-unidad').value = m.unidad;
  if (m.marca)        document.getElementById('nm-mat-marca').value = m.marca;
  if (m.color)         document.getElementById('nm-mat-color').value = m.color;
  if (m.tamano)        document.getElementById('nm-mat-tamano').value = m.tamano;
  if (m.presentacion)  document.getElementById('nm-mat-presentacion').value = m.presentacion;
  document.getElementById('nm-mat-sugerencias').style.display = 'none';
  const cantInput = document.getElementById('nm-mat-cantidad');
  cantInput.max = m.cantidad;
  document.getElementById('nm-mat-stock-hint').textContent = `Disponibles en Zaiko: ${m.cantidad} ${m.unidad || ''}`;
}

// ── PUENTE ZAIKO PARA MATERIALES (espejo best-effort) ──────────
// Búsqueda en vivo contra Zaiko (fn_listar_activos_biblioteca_paginado) —
// antes se descargaba el catálogo completo una sola vez al abrir el
// modal y se filtraba en el navegador; con miles de libros/materiales
// eso volvía lenta la pantalla. Ahora cada búsqueda (ya con debounce)
// trae solo unos pocos resultados que coinciden con lo escrito.
async function _buscarZaikoCatalogo(subcategoria, query, porPagina = 8) {
  try {
    const { data, error } = await _sbZaiko.rpc('fn_listar_activos_biblioteca_paginado', {
      p_subcategoria: subcategoria, p_pagina: 0, p_por_pagina: porPagina, p_query: query || ''
    });
    if (error) { console.warn('No se pudo consultar Zaiko:', error.message); return []; }
    if (!data.ok) { console.warn('No se pudo consultar Zaiko:', data.msg); return []; }
    return data.items || [];
  } catch (e) {
    console.warn('No se pudo consultar Zaiko:', e.message);
    return [];
  }
}

// A diferencia de libros, un material no tiene "copias" — si hay más de
// un activo con el mismo nombre en Zaiko se usa el primero disponible.
async function _matchZaikoMaterial(nombre) {
  const items = await _buscarZaikoCatalogo('MATERIAL INSTITUCIONAL', nombre, 5);
  const norm = _normalizarTextoJS(nombre);
  return items.find(m => _normalizarTextoJS(m.nombre) === norm && m.estado_activo === 'ACTIVO') || null;
}

// Antes de guardar un movimiento (entrega = salida en Zaiko), vuelve a
// consultar el stock real de cada línea que ya tiene un material
// identificado en Zaiko (zaikoActivoId) — la cantidad pudo cambiar desde
// que se agregó la línea. Si no alcanza, bloquea el guardado en vez de
// dejar que Zaiko rechace la salida en silencio (best-effort no debe
// significar "el usuario nunca se entera"). Líneas de material nuevo
// (sin zaikoActivoId) no se validan: se crean en Zaiko con esa misma
// cantidad como stock inicial, siempre alcanza.
async function _validarStockZaiko(lineas) {
  const errores = [];
  for (const linea of lineas) {
    if (!linea.zaikoActivoId) continue;
    const items = await _buscarZaikoCatalogo('MATERIAL INSTITUCIONAL', linea.nombre, 5);
    const item = items.find(m => m.id_activo === linea.zaikoActivoId);
    if (!item) continue; // ya no se encuentra por nombre — no bloquear por un caso raro, zaikoSalidaParcial lo marcará como ERROR igual
    const disponible = parseFloat(item.cantidad);
    if (!isNaN(disponible) && linea.cantidad > disponible) {
      errores.push(`${linea.nombre}: pides ${linea.cantidad}, quedan ${disponible} en Zaiko`);
    }
  }
  return errores;
}

async function agregarLineaMaterial() {
  const nombre   = document.getElementById('nm-mat-nombre').value.trim();
  const cantidad = parseFloat(document.getElementById('nm-mat-cantidad').value);
  const unidad   = document.getElementById('nm-mat-unidad').value.trim();
  if (!nombre)                { toast('Ingresa el nombre del material', 'error'); return; }
  if (!cantidad || cantidad <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }
  if (!unidad)                 { toast('Ingresa la unidad de medida', 'error'); return; }

  const marca        = document.getElementById('nm-mat-marca').value.trim();
  const color        = document.getElementById('nm-mat-color').value.trim();
  const tamano       = document.getElementById('nm-mat-tamano').value.trim();
  const presentacion = document.getElementById('nm-mat-presentacion').value.trim();
  const zaikoMatch    = await _matchZaikoMaterial(nombre);

  _movMaterialesTemp.push({
    nombre, cantidad, unidad,
    marca: marca || null, color: color || null, tamano: tamano || null,
    presentacion: presentacion || null,
    zaikoActivoId: zaikoMatch ? zaikoMatch.id_activo : null,
  });
  document.getElementById('nm-mat-nombre').value = '';
  document.getElementById('nm-mat-cantidad').value = '';
  document.getElementById('nm-mat-cantidad').removeAttribute('max');
  document.getElementById('nm-mat-unidad').value = '';
  document.getElementById('nm-mat-stock-hint').textContent = '';
  _limpiarNmMatExtra();
  document.getElementById('nm-mat-extra').style.display = 'none';
  document.getElementById('nm-mat-extra-ico').className = 'fa fa-plus fa-xs';
  document.getElementById('nm-mat-sugerencias').style.display = 'none';
  renderListaMaterialesTemp();
}

function quitarLineaMaterial(idx) {
  _movMaterialesTemp.splice(idx, 1);
  renderListaMaterialesTemp();
}

function renderListaMaterialesTemp() {
  const el = document.getElementById('nm-mat-lista');
  if (!_movMaterialesTemp.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sin materiales agregados aún</p>';
    return;
  }
  el.innerHTML = _movMaterialesTemp.map((l, i) => {
    const extra = [l.marca, l.color, l.tamano, l.presentacion].filter(Boolean).join(' · ');
    const zaikoTag = l.zaikoActivoId
      ? `<span style="color:var(--green)">✓ ${escHtml(l.zaikoActivoId)} en Zaiko</span>`
      : `<span style="color:var(--muted)">Sin coincidencia en Zaiko — no se reflejará</span>`;
    return `
    <div style="display:flex;align-items:center;gap:10px;background:var(--s3);border-radius:var(--radius-sm);padding:8px 12px">
      <div style="flex:1;font-size:13px">
        ${escHtml(l.nombre)} — <strong>${l.cantidad} ${escHtml(l.unidad)}</strong>
        ${extra ? `<div style="font-size:11px;color:var(--muted)">${escHtml(extra)}</div>` : ''}
        <div style="font-size:11px">${zaikoTag}</div>
      </div>
      <button class="btn-cls" onclick="quitarLineaMaterial(${i})" title="Quitar"><i class="fa fa-xmark fa-xs"></i></button>
    </div>`;
  }).join('');
}

async function guardarMovimiento() {
  const tipo   = document.getElementById('nm-tipo').value;
  const area   = document.getElementById('nm-area').value.trim();
  const obs    = document.getElementById('nm-obs').value.trim();
  const fechaLim = document.getElementById('nm-fecha-lim').value;
  const horaEst  = document.getElementById('nm-hora-est').value;

  if (!_movColabSel)                     { toast('Selecciona el colaborador solicitante', 'error'); return; }
  if (!_movMaterialesTemp.length)         { toast('Agrega al menos un material', 'error'); return; }
  if (tipo === 'prestamo' && !fechaLim)   { toast('Indica la fecha de devolución', 'error'); return; }

  const errStock = await _validarStockZaiko(_movMaterialesTemp);
  if (errStock.length) { toast(errStock.join(' · '), 'error'); return; }

  const btn = document.getElementById('btn-guardar-movimiento');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const usuario = await usuarioActualEmail();
    const { data: idGenerado, error: eId } = await _sb.rpc('generar_id_movimiento');
    if (eId || !idGenerado) throw new Error('No se pudo generar el ID del movimiento: ' + (eId ? eId.message : 'respuesta vacía'));

    const { data: mov, error: eMov } = await _sb.from('bib_movimientos').insert({
      id_movimiento: idGenerado,
      tipo,
      colaborador_id: _movColabSel.id || null,
      colaborador_nombre: _movColabSel.nombre,
      colaborador_email: _movColabSel.email,
      area: area || null,
      usuario_registro: usuario,
      observaciones: obs || null,
      estado: 'entregado',
      fecha_limite_devolucion: tipo === 'prestamo' ? fechaLim : null,
      hora_estimada: tipo === 'prestamo' && horaEst ? horaEst : null,
      origen: _movSolicitudOrigen ? 'correo' : 'manual',
      solicitud_id: _movSolicitudOrigen || null,
    }).select('id').single();
    if (eMov) throw eMov;

    if (_movSolicitudOrigen) {
      await _sb.from('bib_solicitudes').update({ convertido_a_movimiento: true }).eq('id', _movSolicitudOrigen);
      _movSolicitudOrigen = null;
    }

    // Resolver el catálogo primero (secuencial, uno por línea — necesario
    // para que dos líneas con el mismo material nuevo reutilicen el mismo
    // id en vez de intentar crearlo dos veces en paralelo), pero insertar
    // todas las líneas en un solo round-trip en vez de uno por línea.
    const lineasParaInsertar = [];
    for (const linea of _movMaterialesTemp) {
      const mat = await obtenerOCrearMaterial(linea.nombre, linea.unidad);
      lineasParaInsertar.push({
        movimiento_id: mov.id,
        material_id: mat.id,
        nombre: linea.nombre,
        cantidad_entregada: linea.cantidad,
        unidad_medida: linea.unidad,
        marca: linea.marca, color: linea.color, tamano: linea.tamano,
        presentacion: linea.presentacion,
        zaiko_activo_id: linea.zaikoActivoId,
        zaiko_sync_estado: 'PENDIENTE',
      });
    }
    const { data: lineasInsertadas, error: eLineas } = await _sb.from('bib_movimiento_materiales')
      .insert(lineasParaInsertar)
      .select('id,zaiko_activo_id,cantidad_entregada,nombre,unidad_medida,marca,color,tamano,presentacion');
    if (eLineas) throw eLineas;

    // Espejo best-effort hacia Zaiko — una salida parcial por línea. Si el
    // material no tenía coincidencia, se crea en Zaiko de una vez con la
    // cantidad entregada como stock inicial (mismo mecanismo del conteo
    // físico) y de inmediato se le hace la salida de esa misma cantidad —
    // es lo único que Biblioteca sabe de un material que nunca había visto,
    // así que queda en 0/AGOTADO hasta que alguien haga un conteo real.
    // Nunca bloquea el guardado local ya hecho arriba.
    const _motivoMov = { prestamo: 'PRESTAMO MATERIAL', asignacion: 'ASIGNACION MATERIAL', consumo: 'CONSUMO MATERIAL' }[tipo] || 'SALIDA MATERIAL';
    for (const fila of lineasInsertadas) {
      try {
        let idActivo = fila.zaiko_activo_id;
        if (!idActivo) {
          const rc = await gasCall('zaikoCargarConteo', {
            items: [{
              nombre: fila.nombre, unidad: fila.unidad_medida,
              marca: fila.marca, color: fila.color, tamano: fila.tamano, presentacion: fila.presentacion,
              cantidad: fila.cantidad_entregada,
              notas: 'Creado automáticamente desde un movimiento de Biblioteca',
            }],
            usuario,
          });
          if (!rc.ok || !rc.ids || !rc.ids[0]) throw new Error(rc.msg || 'No se pudo crear el material en Zaiko');
          idActivo = rc.ids[0];
        }
        const rz = await gasCall('zaikoSalidaParcial', {
          idActivo,
          cantidad: fila.cantidad_entregada,
          destino: _movColabSel.nombre,
          motivo: _motivoMov,
          obs: obs || '',
          usuario,
        });
        await _sb.from('bib_movimiento_materiales').update({
          zaiko_activo_id: idActivo,
          zaiko_sync_estado: rz.ok ? 'SINCRONIZADO' : 'ERROR',
          zaiko_sync_detalle: rz.ok ? null : ('Salida no reflejada: ' + (rz.msg || 'error desconocido')),
        }).eq('id', fila.id);
      } catch (ze) {
        await _sb.from('bib_movimiento_materiales').update({
          zaiko_sync_estado: 'ERROR',
          zaiko_sync_detalle: 'Salida no reflejada: ' + ze.message,
        }).eq('id', fila.id);
      }
    }

    await _sb.from('bib_movimientos_historial').insert({
      movimiento_id: mov.id, estado_anterior: null, estado_nuevo: 'entregado',
      notas: 'Movimiento registrado'
    });

    if (_movColabSel.email) {
      gasCall('enviarCorreo', {
        tipo: 'movimiento_entregado',
        destinatario: _movColabSel.email,
        idSolicitud: idGenerado,
        movimientoId: mov.id,
        tipoMovimiento: tipo,
        materiales: _movMaterialesTemp.map(l => ({
          nombre: l.nombre, cantidad: l.cantidad, unidad: l.unidad,
          marca: l.marca, color: l.color, tamano: l.tamano, presentacion: l.presentacion
        })),
        fechaLimite: tipo === 'prestamo' ? fechaLim : null,
      }).catch(()=>{});
    }

    toast('Movimiento registrado', 'success');
    cerrarModal('modal-movimiento');
    await renderMovimientos();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── DETALLE DE MOVIMIENTO ──────────────────────────────────────
async function abrirDetalleMovimiento(id) {
  document.getElementById('modal-detalle-movimiento').classList.add('open');
  const body = document.getElementById('mdm-body');
  body.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const [{ data: mov, error: eMov }, { data: lineas, error: eLin }, { data: hist }] = await Promise.all([
      _sb.from('bib_movimientos').select('*').eq('id', id).single(),
      _sb.from('bib_movimiento_materiales').select('*').eq('movimiento_id', id),
      _sb.from('bib_movimientos_historial').select('*').eq('movimiento_id', id).order('created_at')
    ]);
    if (eMov) throw eMov;
    if (eLin) throw eLin;
    _movDetalleLineas = lineas || [];
    _movDetalleId = id;

    document.getElementById('mdm-id').textContent = mov.id_movimiento || ('#' + mov.id);
    const tipoLbl = { prestamo:'Préstamo', asignacion:'Asignación permanente', consumo:'Entrega / Consumo' };
    const esDevolvible = mov.tipo === 'prestamo' || mov.tipo === 'asignacion';
    const esAbierto = esDevolvible && !mov.fecha_devolucion_real;

    body.innerHTML = `
      <table style="width:100%;font-size:13px;margin-bottom:16px">
        <tr><td style="color:var(--muted);width:140px;padding:4px 0">Tipo</td><td>${tipoLbl[mov.tipo] || mov.tipo}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Colaborador</td><td>${escHtml(mov.colaborador_nombre || '—')} (${escHtml(mov.colaborador_email || '—')})
          <button class="btn-cls" style="margin-left:8px" onclick="editarColaboradorMovimiento(${mov.id})" title="Cambiar colaborador"><i class="fa fa-pen fa-xs"></i></button>
        </td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Área</td><td>${escHtml(mov.area || '—')}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Registrado por</td><td>${escHtml(mov.usuario_registro || '—')} · ${fmtFecha(mov.created_at)}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Confirmación</td><td>${mov.recepcion_confirmada
          ? `<span style="color:var(--green);font-weight:600">✓ Confirmado${mov.recepcion_confirmada_en ? ' · ' + fmtFecha(mov.recepcion_confirmada_en) : ''}</span>`
          : `<span style="font-size:12px;color:var(--muted)">Pendiente</span>
             <button style="margin-left:10px;padding:4px 12px;font-size:12px;border-radius:5px;border:1px solid var(--green);color:var(--green);background:transparent;cursor:pointer"
               onclick="confirmarRecepcionMaterialManual(${mov.id})">✓ Marcar como confirmado</button>`
        }</td></tr>
        ${esDevolvible ? `
        <tr><td style="color:var(--muted);padding:4px 0">${mov.fecha_limite_devolucion ? 'Fecha límite' : 'Estado'}</td><td>${mov.fecha_limite_devolucion ? mov.fecha_limite_devolucion + ' ' : ''}${_badgePrestamo(mov)}</td></tr>
        ${mov.fecha_devolucion_real ? `<tr><td style="color:var(--muted);padding:4px 0">Devuelto</td><td>${fmtFecha(mov.fecha_devolucion_real)} — recibido por ${escHtml(mov.usuario_recibio_devolucion || '—')}</td></tr>` : ''}
        ` : ''}
        ${mov.observaciones ? `<tr><td style="color:var(--muted);padding:4px 0">Observaciones</td><td>${escHtml(mov.observaciones)}</td></tr>` : ''}
      </table>

      ${esAbierto ? `<button class="btn btn-primary" style="margin-bottom:16px" onclick="abrirModalDevolucion(${mov.id})"><i class="fa fa-rotate-left fa-sm"></i> Registrar devolución</button>` : ''}

      <div class="sec-hdr"><div class="sec-title">Materiales</div><div class="sec-hdr-line"></div></div>
      <div class="tw" style="margin-bottom:16px"><table>
        <thead><tr><th>Material</th><th>Entregado</th><th>Devuelto</th><th>Consumido</th>${mov.tipo === 'consumo' ? '<th></th>' : ''}</tr></thead>
        <tbody>${(lineas || []).map(l => {
          const extra = [l.marca, l.color, l.tamano, l.presentacion].filter(Boolean).join(' · ');
          return `<tr>
          <td>${escHtml(l.nombre)}${extra ? `<div style="font-size:11px;color:var(--muted)">${escHtml(extra)}</div>` : ''}</td>
          <td>${l.cantidad_entregada} ${escHtml(l.unidad_medida)}</td>
          <td>${l.cantidad_devuelta} ${escHtml(l.unidad_medida)}</td>
          <td>${(l.cantidad_entregada - l.cantidad_devuelta)} ${escHtml(l.unidad_medida)}</td>
          ${mov.tipo === 'consumo' ? `<td><button class="btn btn-ghost" style="font-size:11px;padding:4px 8px" onclick="abrirModalRetornoMaterial(${l.id})">Registrar devuelto</button></td>` : ''}
        </tr>`;
        }).join('')}</tbody>
      </table></div>

      ${hist && hist.length ? `
      <div class="sec-hdr"><div class="sec-title">Historial</div><div class="sec-hdr-line"></div></div>
      <div style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px">
        ${hist.map(h => `<div>${fmtFecha(h.created_at)} — ${escHtml(h.estado_nuevo || '')}${h.notas ? ' · ' + escHtml(h.notas) : ''}</div>`).join('')}
      </div>` : ''}
    `;
  } catch(e) {
    body.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

// ── REGISTRAR DEVOLUCIÓN (préstamo / asignación / libro) ────────
function abrirModalDevolucion(id, tipo = 'movimiento') {
  _movDevolverId = id;
  _devolverTipo = tipo;
  document.getElementById('mdv-info').textContent = (tipo === 'libro' ? 'Préstamo de libro #' : 'Movimiento #') + id;
  document.getElementById('mdv-obs').value = '';
  const modalDev = document.getElementById('modal-devolucion');
  document.body.appendChild(modalDev); // asegura que quede por encima si se abre desde otro modal (.mo comparten z-index)
  modalDev.classList.add('open');
}

async function confirmarDevolucionMovimiento() {
  if (!_movDevolverId) return;
  const obs = document.getElementById('mdv-obs').value.trim();
  const btn = document.getElementById('btn-conf-devolucion');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const usuario = await usuarioActualEmail();
    const ahora = new Date().toISOString();

    if (_devolverTipo === 'libro') {
      const { data: lib, error: errLib } = await _sb.from('bib_prestamos_libros').update({
        fecha_devolucion_real: ahora,
        usuario_recibio_devolucion: usuario,
        notas_devolucion: obs || null,
      }).eq('id', _movDevolverId).select('id_prestamo,libro_titulo,prestatario_email,zaiko_activo_id,zaiko_sync_estado').single();
      if (errLib) throw errLib;

      // Espejo best-effort hacia Zaiko — solo si el préstamo sí se reflejó allá.
      if (lib.zaiko_activo_id && lib.zaiko_sync_estado === 'SINCRONIZADO') {
        try {
          const rz = await gasCall('zaikoDevolver', {
            idPrestamo: lib.id_prestamo,
            condicion: 'BUENO',
            obs: obs || '',
          });
          if (!rz.ok) {
            await _sb.from('bib_prestamos_libros').update({
              zaiko_sync_estado: 'ERROR',
              zaiko_sync_detalle: 'Devolución no reflejada: ' + (rz.msg || 'error desconocido'),
            }).eq('id', _movDevolverId);
          }
        } catch (ze) {
          await _sb.from('bib_prestamos_libros').update({
            zaiko_sync_estado: 'ERROR',
            zaiko_sync_detalle: 'Devolución no reflejada: ' + ze.message,
          }).eq('id', _movDevolverId);
        }
      }

      if (lib.prestatario_email) {
        gasCall('enviarCorreo', {
          tipo: 'libro_devuelto',
          destinatario: lib.prestatario_email,
          idSolicitud: lib.id_prestamo,
          libro: lib.libro_titulo,
          fechaDevolucion: fmtFecha(ahora),
          usuarioRecibio: usuario,
        }).catch(()=>{});
      }

      toast('Devolución registrada', 'success');
      cerrarModal('modal-devolucion');
      await abrirDetalleLibro(_movDevolverId);
      await renderLibros();
      return;
    }

    const { data: mov, error } = await _sb.from('bib_movimientos').update({
      fecha_devolucion_real: ahora,
      usuario_recibio_devolucion: usuario,
      notas_devolucion: obs || null,
    }).eq('id', _movDevolverId).select('id_movimiento,colaborador_email,colaborador_nombre').single();
    if (error) throw error;
    await _sb.from('bib_movimientos_historial').insert({
      movimiento_id: _movDevolverId, estado_anterior: 'entregado', estado_nuevo: 'devuelto', notas: obs || null
    });

    // Espejo best-effort hacia Zaiko — prestamo/asignacion se devuelven de
    // una sola vez (no hay retorno parcial por línea, a diferencia de
    // consumo), así que se devuelve la cantidad entregada completa de cada
    // línea que sí quedó reflejada en Zaiko al entregarse.
    const { data: lineasDevolver } = await _sb.from('bib_movimiento_materiales')
      .select('id,zaiko_activo_id,zaiko_sync_estado,cantidad_entregada').eq('movimiento_id', _movDevolverId);
    let _okSync = 0, _totalSync = 0;
    for (const linea of (lineasDevolver || [])) {
      if (!linea.zaiko_activo_id || linea.zaiko_sync_estado !== 'SINCRONIZADO') continue;
      _totalSync++;
      try {
        const rz = await gasCall('zaikoDevolucionParcial', {
          idActivo: linea.zaiko_activo_id,
          cantidad: linea.cantidad_entregada,
          origen: mov.colaborador_nombre || '',
          motivo: 'DEVOLUCION MATERIAL',
          obs: obs || '',
          usuario,
        });
        if (rz.ok) _okSync++;
      } catch (ze) { /* best-effort — se resume abajo */ }
    }
    if (_totalSync > 0) {
      await _sb.from('bib_movimientos').update({
        zaiko_sync_detalle: `Devolución: ${_okSync}/${_totalSync} línea(s) reflejadas en Zaiko`,
      }).eq('id', _movDevolverId);
    }

    if (mov.colaborador_email) {
      const { data: lineas } = await _sb.from('bib_movimiento_materiales')
        .select('nombre,cantidad_entregada,unidad_medida').eq('movimiento_id', _movDevolverId);
      gasCall('enviarCorreo', {
        tipo: 'movimiento_devuelto',
        destinatario: mov.colaborador_email,
        idSolicitud: mov.id_movimiento,
        materiales: _formatMaterialesResumen(lineas),
        fechaDevolucion: fmtFecha(ahora),
        usuarioRecibio: usuario,
      }).catch(()=>{});
    }

    toast('Devolución registrada', 'success');
    cerrarModal('modal-devolucion');
    await abrirDetalleMovimiento(_movDevolverId);
    await renderMovimientos();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── REGISTRAR MATERIAL DEVUELTO (consumo, retorno parcial) ─────
function abrirModalRetornoMaterial(lineaId) {
  const linea = _movDetalleLineas.find(l => l.id === lineaId);
  if (!linea) return;
  _movRetornoLineaId = lineaId;
  document.getElementById('mrm-info').textContent =
    `${linea.nombre} — Entregado: ${linea.cantidad_entregada} ${linea.unidad_medida} · Devuelto hasta ahora: ${linea.cantidad_devuelta} ${linea.unidad_medida}`;
  document.getElementById('mrm-cantidad').value = '';
  document.getElementById('mrm-cantidad').max = linea.cantidad_entregada - linea.cantidad_devuelta;
  document.getElementById('mrm-obs').value = '';
  document.getElementById('modal-retorno-material').classList.add('open');
}

async function confirmarRetornoMaterial() {
  if (!_movRetornoLineaId) return;
  const cantidad = parseFloat(document.getElementById('mrm-cantidad').value);
  const obs = document.getElementById('mrm-obs').value.trim();
  if (!cantidad || cantidad <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }

  const btn = document.getElementById('btn-conf-retorno');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const { data: linea, error: eLin } = await _sb.from('bib_movimiento_materiales')
      .select('cantidad_entregada,cantidad_devuelta,movimiento_id,nombre,zaiko_activo_id,zaiko_sync_estado').eq('id', _movRetornoLineaId).single();
    if (eLin) throw eLin;
    if (cantidad + linea.cantidad_devuelta > linea.cantidad_entregada) {
      toast('La cantidad devuelta no puede superar lo entregado', 'error');
      return;
    }
    const usuario = await usuarioActualEmail();
    const { data: retorno, error } = await _sb.from('bib_materiales_retornos').insert({
      movimiento_material_id: _movRetornoLineaId,
      cantidad, usuario, observaciones: obs || null,
      zaiko_sync_estado: (linea.zaiko_activo_id && linea.zaiko_sync_estado === 'SINCRONIZADO') ? 'PENDIENTE' : 'SIN_MATCH',
    }).select('id').single();
    if (error) throw error;

    // Espejo best-effort hacia Zaiko — solo si la salida original de esta
    // línea sí se reflejó allá.
    if (linea.zaiko_activo_id && linea.zaiko_sync_estado === 'SINCRONIZADO') {
      try {
        const rz = await gasCall('zaikoDevolucionParcial', {
          idActivo: linea.zaiko_activo_id,
          cantidad,
          motivo: 'RETORNO PARCIAL MATERIAL',
          obs: obs || '',
          usuario,
        });
        await _sb.from('bib_materiales_retornos').update({
          zaiko_sync_estado: rz.ok ? 'SINCRONIZADO' : 'ERROR',
          zaiko_sync_detalle: rz.ok ? null : ('Retorno no reflejado: ' + (rz.msg || 'error desconocido')),
        }).eq('id', retorno.id);
      } catch (ze) {
        await _sb.from('bib_materiales_retornos').update({
          zaiko_sync_estado: 'ERROR',
          zaiko_sync_detalle: 'Retorno no reflejado: ' + ze.message,
        }).eq('id', retorno.id);
      }
    }

    toast('Retorno registrado', 'success');
    cerrarModal('modal-retorno-material');
    await abrirDetalleMovimiento(linea.movimiento_id);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── CONFIRMAR RECEPCIÓN MANUAL ──────────────────────────────────
async function confirmarRecepcionMaterialManual(id) {
  const { error } = await _sb.from('bib_movimientos')
    .update({ recepcion_confirmada: true, recepcion_confirmada_en: new Date().toISOString() })
    .eq('id', id);
  if (error) { toast('Error al confirmar: ' + error.message, 'error'); return; }
  toast('Recepción confirmada', 'success');
  await abrirDetalleMovimiento(id);
  await renderMovimientos();
}

// ── ELIMINAR MOVIMIENTO ────────────────────────────────────────
// Corrige el colaborador de un movimiento ya guardado sin tener que
// eliminarlo y recrearlo. Mismo picker que usa el formulario de "Nuevo
// Movimiento" (elegirColaboradorMovimiento) -- reutilizado, no duplicado.
function editarColaboradorMovimiento(id) {
  abrirPickerDestinatarios(async (destinatarios) => {
    if (!destinatarios.length) return;
    const elegido = destinatarios[0];
    try {
      const { data: correo } = await _sb.from('bib_colaboradores_correos')
        .select('colaborador_id, bib_colaboradores(area)').eq('email', elegido.email).limit(1).single();
      const area = correo?.bib_colaboradores?.area;
      const { error } = await _sb.from('bib_movimientos').update({
        colaborador_id: correo?.colaborador_id || null,
        colaborador_nombre: elegido.nombre,
        colaborador_email: elegido.email,
        ...(area ? { area } : {}),
      }).eq('id', id);
      if (error) throw error;
      toast('Colaborador actualizado', 'success');
      await abrirDetalleMovimiento(id);
      await renderMovimientos();
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  }, () => {}, []);
}

async function eliminarMovimiento() {
  if (!_movDetalleId) return;
  if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;
  try {
    const { data: mov, error: eMov } = await _sb.from('bib_movimientos')
      .select('fecha_devolucion_real').eq('id', _movDetalleId).single();
    if (eMov) throw eMov;

    // Si el movimiento ya se devolvió por completo (prestamo/asignacion),
    // esa devolución ya intentó restaurar cada línea en Zaiko — no se
    // vuelve a tocar aquí para no duplicar el crédito. Solo se restaura
    // lo que sigue "afuera" en Zaiko: entregado y sincronizado, menos lo
    // que ya se devolvió de vuelta con éxito (retornos parciales de
    // consumo, vía bib_materiales_retornos).
    let restauradas = 0, aRestaurar = 0;
    if (!mov.fecha_devolucion_real) {
      const usuario = await usuarioActualEmail();
      const { data: lineas } = await _sb.from('bib_movimiento_materiales')
        .select('id,zaiko_activo_id,zaiko_sync_estado,cantidad_entregada,nombre').eq('movimiento_id', _movDetalleId);
      for (const linea of (lineas || [])) {
        if (!linea.zaiko_activo_id || linea.zaiko_sync_estado !== 'SINCRONIZADO') continue;
        const { data: retornos } = await _sb.from('bib_materiales_retornos')
          .select('cantidad,zaiko_sync_estado').eq('movimiento_material_id', linea.id);
        const yaDevuelto = (retornos || [])
          .filter(r => r.zaiko_sync_estado === 'SINCRONIZADO')
          .reduce((s, r) => s + Number(r.cantidad), 0);
        const pendiente = linea.cantidad_entregada - yaDevuelto;
        if (pendiente <= 0) continue;
        aRestaurar++;
        try {
          const rz = await gasCall('zaikoDevolucionParcial', {
            idActivo: linea.zaiko_activo_id,
            cantidad: pendiente,
            motivo: 'DEVOLUCION POR ELIMINACION DE MOVIMIENTO',
            usuario,
          });
          if (rz.ok) restauradas++;
        } catch (ze) { /* best-effort — se resume en el toast final */ }
      }
    }

    const { error } = await _sb.from('bib_movimientos').delete().eq('id', _movDetalleId);
    if (error) throw error;

    if (aRestaurar > 0) {
      toast(
        restauradas === aRestaurar
          ? `Movimiento eliminado — stock restaurado en Zaiko (${restauradas}/${aRestaurar})`
          : `Movimiento eliminado — stock restaurado solo en ${restauradas}/${aRestaurar} material(es), revisa Zaiko manualmente`,
        restauradas === aRestaurar ? 'success' : 'error'
      );
    } else {
      toast('Movimiento eliminado', 'success');
    }
    cerrarModal('modal-detalle-movimiento');
    await renderMovimientos();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── SUBMÓDULO LIBROS ────────────────────────────────────────────
async function renderLibros() {
  const el = document.getElementById('mat-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const { data, error } = await _sb.from('bib_prestamos_libros')
      .select('id,id_prestamo,libro_titulo,tipo_prestatario,prestatario_nombre,prestatario_email,es_institucional,fecha_limite_devolucion,fecha_devolucion_real,recepcion_confirmada,fecha_prestamo')
      .order('fecha_prestamo', { ascending: false })
      .limit(200);
    if (error) throw error;
    let rows = data || [];
    if (_matFiltro) {
      const low = _matFiltro.toLowerCase();
      rows = rows.filter(r =>
        (r.id_prestamo || '').toLowerCase().includes(low) ||
        (r.libro_titulo || '').toLowerCase().includes(low) ||
        (r.prestatario_nombre || '').toLowerCase().includes(low));
    }
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-book"></i></div><p>Sin préstamos de libros registrados</p></div>';
      return;
    }
    const tipoLbl = { estudiante:'Estudiante', colaborador:'Colaborador', institucional:'Institucional' };
    el.innerHTML = `<div class="tw"><table>
      <thead><tr><th>ID</th><th>Libro</th><th>Prestatario</th><th>Tipo</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${rows.map(r => `<tr onclick="abrirDetalleLibro(${r.id})" style="cursor:pointer">
        <td class="td-id">${escHtml(r.id_prestamo || '—')}</td>
        <td>${escHtml(r.libro_titulo)}</td>
        <td>${escHtml(r.prestatario_nombre)}</td>
        <td>${tipoLbl[r.tipo_prestatario] || r.tipo_prestatario}</td>
        <td class="td-m">${fmtFecha(r.fecha_prestamo)}</td>
        <td>${_badgePrestamoLibro(r)}
          ${r.prestatario_email ? `<span style="font-size:11px;font-weight:600;${r.recepcion_confirmada?'color:var(--green)':'color:var(--muted)'}">${r.recepcion_confirmada?'✓ Confirmado':'⏳ Sin confirmar'}</span>` : ''}
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

function _badgePrestamoLibro(r) {
  if (r.fecha_devolucion_real) return badge('devuelto');
  if (!r.es_institucional && r.fecha_limite_devolucion) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const lim = new Date(r.fecha_limite_devolucion + 'T00:00:00');
    if (lim < hoy) return badge('vencido');
  }
  return badge('activo');
}

function abrirModalPrestamoLibro() {
  document.getElementById('npl-tipo').value = 'estudiante';
  document.getElementById('npl-est-nombre').value = '';
  document.getElementById('npl-est-curso').value = '';
  document.getElementById('npl-colab-sel').textContent = 'Sin seleccionar';
  _libColabSel = null;
  document.getElementById('npl-libro-titulo').value = '';
  document.getElementById('npl-libro-editorial').value = '';
  document.getElementById('npl-libro-area').value = '';
  document.getElementById('npl-libro-codigo').value = '';
  document.getElementById('npl-fecha-lim').value = '';
  document.getElementById('npl-obs').value = '';
  onCambioTipoPrestatario();
  _zaikoCopiasDisponibles = [];
  document.getElementById('npl-zaiko-wrap').style.display = 'none';
  document.getElementById('npl-zaiko-copia').innerHTML = '';
  document.getElementById('npl-zaiko-hint').textContent = '';
  clearTimeout(_libBuscarTimer);
  _libSugerenciasZaiko = [];
  document.getElementById('npl-libro-sugerencias').style.display = 'none';
  document.getElementById('npl-libro-sugerencias').innerHTML = '';
  document.getElementById('modal-prestamo-libro').classList.add('open');
}

// ── PUENTE ZAIKO (espejo best-effort — ver plan de integración) ────────
// Biblioteca sigue siendo la fuente primaria de sus propios préstamos;
// esto solo refleja el movimiento hacia el inventario oficial. Si Zaiko
// no responde o el título no está catalogado ahí, el préstamo local se
// guarda igual — solo queda marcado como pendiente de sincronizar.
//
// Búsqueda en vivo (fn_listar_activos_biblioteca_paginado, vía
// _buscarZaikoCatalogo — ver bloque de materiales) en vez de descargar
// el catálogo completo de libros al abrir el modal: con miles de
// títulos, esa descarga volvía lenta la pantalla.
let _zaikoCopiasDisponibles = [];

function _normalizarTextoJS(s) {
  return (s || '').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function _actualizarCopiasZaiko() {
  const titulo = document.getElementById('npl-libro-titulo').value.trim();
  const wrap = document.getElementById('npl-zaiko-wrap');
  const sel  = document.getElementById('npl-zaiko-copia');
  const hint = document.getElementById('npl-zaiko-hint');
  _zaikoCopiasDisponibles = [];
  if (!titulo) { wrap.style.display = 'none'; return; }

  wrap.style.display = '';
  sel.style.display = 'none';
  sel.innerHTML = '';
  hint.textContent = 'Consultando Zaiko…';

  const items = await _buscarZaikoCatalogo('LIBRO', titulo, 20);
  if (document.getElementById('npl-libro-titulo').value.trim() !== titulo) return; // ya escribió otra cosa mientras tanto

  const tituloNorm = _normalizarTextoJS(titulo);
  const coincidencias = items.filter(c => _normalizarTextoJS(c.nombre) === tituloNorm);
  const disponibles = coincidencias.filter(c => c.estado_activo === 'ACTIVO');
  _zaikoCopiasDisponibles = disponibles;

  if (!coincidencias.length) {
    hint.textContent = 'Este título aún no tiene ejemplares registrados en el inventario oficial. El préstamo se guardará en Biblioteca igual, sin reflejarse en Zaiko.';
  } else if (!disponibles.length) {
    hint.textContent = 'Todas las copias catalogadas de este título están prestadas o no disponibles en Zaiko.';
  } else if (disponibles.length === 1) {
    // Una sola copia — se asigna sola, sin mostrar un desplegable de una
    // sola opción (ruido visual innecesario).
    sel.innerHTML = `<option value="${escHtml(disponibles[0].id_activo)}" selected>${escHtml(disponibles[0].id_activo)}</option>`;
    hint.textContent = 'Se usará automáticamente la copia ' + disponibles[0].id_activo + ' del inventario oficial.';
  } else {
    sel.innerHTML = disponibles.map(c => `<option value="${escHtml(c.id_activo)}">${escHtml(c.id_activo)}</option>`).join('');
    sel.style.display = '';
    hint.textContent = 'Elige cuál de las ' + disponibles.length + ' copias disponibles se presta.';
  }
}

function onCambioTipoPrestatario() {
  const tipo = document.getElementById('npl-tipo').value;
  document.getElementById('npl-estudiante-wrap').style.display = tipo === 'estudiante' ? '' : 'none';
  document.getElementById('npl-colab-wrap').style.display = tipo !== 'estudiante' ? '' : 'none';
  document.getElementById('npl-fecha-hint').style.display = tipo === 'institucional' ? '' : 'none';
  const req = document.querySelector('#npl-fecha-wrap .req');
  if (req) req.style.display = tipo === 'institucional' ? 'none' : '';
}

function elegirColaboradorLibro() {
  abrirPickerDestinatarios(async (destinatarios) => {
    if (!destinatarios.length) return;
    const elegido = destinatarios[0];
    const { data: correo } = await _sb.from('bib_colaboradores_correos')
      .select('colaborador_id').eq('email', elegido.email).limit(1).single();
    _libColabSel = { id: correo?.colaborador_id || null, nombre: elegido.nombre, email: elegido.email };
    document.getElementById('npl-colab-sel').textContent = `${_libColabSel.nombre} · ${_libColabSel.email}`;
  }, () => {}, _libColabSel ? [_libColabSel] : []);
}

function libroBuscarDebounce() {
  clearTimeout(_libBuscarTimer);
  _libBuscarTimer = setTimeout(() => {
    _renderSugerenciasLibro();
    _actualizarCopiasZaiko(); // búsqueda en vivo contra Zaiko, ya con debounce
  }, 200);
}

let _libSugerenciasZaiko = [];

// Combina lo que Biblioteca ya conoce (bib_libros -- libros que ya se
// prestaron alguna vez) con una busqueda en vivo contra el catalogo real
// de Zaiko -- antes solo miraba bib_libros, asi que un titulo que existe
// en Zaiko pero nunca se ha prestado por Biblioteca (ej. el catalogo
// completo recien cargado) no aparecia como sugerencia, aunque
// _actualizarCopiasZaiko() (mas abajo) si lo encontraba una vez escrito
// el titulo completo. Mismo patron que el buscador de materiales
// (_buscarZaikoCatalogo).
async function _renderSugerenciasLibro() {
  const q = document.getElementById('npl-libro-titulo').value.trim();
  const panel = document.getElementById('npl-libro-sugerencias');
  if (!q) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  if (!_libCache.length) {
    const { data } = await _sb.from('bib_libros').select('id,titulo,editorial,area,codigo').eq('activo', true).order('titulo');
    _libCache = data || [];
  }
  const low = q.toLowerCase();
  const filLocal = _libCache.filter(l => l.titulo.toLowerCase().includes(low));
  _libSugerenciasZaiko = await _buscarZaikoCatalogo('LIBRO', q, 8);
  if (document.getElementById('npl-libro-titulo').value.trim() !== q) return; // ya escribió otra cosa mientras tanto

  const titulosLocales = new Set(filLocal.map(l => _normalizarTextoJS(l.titulo)));
  const soloZaiko = _libSugerenciasZaiko.filter(m => !titulosLocales.has(_normalizarTextoJS(m.nombre)));

  const combinados = [
    ...filLocal.slice(0, 8).map(l => ({ tipo: 'local', id: l.id, titulo: l.titulo, extra: '' })),
    ...soloZaiko.slice(0, 8).map(m => ({ tipo: 'zaiko', id: m.id_activo, titulo: m.nombre, extra: `· ${m.id_activo} · en Zaiko` })),
  ].slice(0, 8);

  if (!combinados.length) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = `<div class="ss-list">${combinados.map(c => `
    <div class="ss-opt" onclick="_seleccionarLibroSugerido('${c.tipo}','${String(c.id).replace(/'/g, "\\'")}')">${escHtml(c.titulo)} ${c.extra ? `<span style="color:var(--muted);font-size:11px">${escHtml(c.extra)}</span>` : ''}</div>
  `).join('')}</div>`;
  panel.style.display = 'block';
}

function _seleccionarLibroSugerido(tipo, id) {
  if (tipo === 'zaiko') {
    const m = _libSugerenciasZaiko.find(x => x.id_activo === id);
    if (!m) return;
    document.getElementById('npl-libro-titulo').value = m.nombre;
    if (m.editorial)     document.getElementById('npl-libro-editorial').value = m.editorial;
    if (m.area_tematica) document.getElementById('npl-libro-area').value = m.area_tematica;
    if (m.serial)         document.getElementById('npl-libro-codigo').value = m.serial;
  } else {
    const l = _libCache.find(x => String(x.id) === String(id));
    if (!l) return;
    document.getElementById('npl-libro-titulo').value = l.titulo;
    if (l.editorial) document.getElementById('npl-libro-editorial').value = l.editorial;
    if (l.area)      document.getElementById('npl-libro-area').value = l.area;
    if (l.codigo)    document.getElementById('npl-libro-codigo').value = l.codigo;
  }
  document.getElementById('npl-libro-sugerencias').style.display = 'none';
  _actualizarCopiasZaiko();
}

async function obtenerOCrearLibro(titulo, editorial, area, codigo) {
  const tituloTrim = titulo.trim();
  const existente = _libCache.find(l => l.titulo.toLowerCase() === tituloTrim.toLowerCase());
  if (existente) return existente;
  const { data, error } = await _sb.from('bib_libros')
    .insert({ titulo: tituloTrim, editorial: editorial || null, area: area || null, codigo: codigo || null })
    .select('id,titulo,editorial,area,codigo').single();
  if (error) throw error;
  _libCache.push(data);
  return data;
}

async function guardarPrestamoLibro() {
  const tipo       = document.getElementById('npl-tipo').value;
  const titulo     = document.getElementById('npl-libro-titulo').value.trim();
  const editorial  = document.getElementById('npl-libro-editorial').value.trim();
  const area       = document.getElementById('npl-libro-area').value.trim();
  const codigo     = document.getElementById('npl-libro-codigo').value.trim();
  const fechaLim   = document.getElementById('npl-fecha-lim').value;
  const obs        = document.getElementById('npl-obs').value.trim();
  const esInstitucional = tipo === 'institucional';

  if (!titulo)                          { toast('Ingresa el título del libro', 'error'); return; }
  if (!esInstitucional && !fechaLim)     { toast('Indica la fecha de devolución', 'error'); return; }

  let prestatarioNombre, prestatarioEmail = null, prestatarioCurso = null;
  if (tipo === 'estudiante') {
    prestatarioNombre = document.getElementById('npl-est-nombre').value.trim();
    prestatarioCurso  = document.getElementById('npl-est-curso').value.trim() || null;
    if (!prestatarioNombre) { toast('Ingresa el nombre del estudiante', 'error'); return; }
  } else {
    if (!_libColabSel) { toast('Selecciona el colaborador', 'error'); return; }
    prestatarioNombre = _libColabSel.nombre;
    prestatarioEmail  = _libColabSel.email;
  }

  const btn = document.getElementById('btn-guardar-libro');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const usuario = await usuarioActualEmail();
    const libro = await obtenerOCrearLibro(titulo, editorial, area, codigo);
    const { data: idGenerado, error: eId } = await _sb.rpc('generar_id_prestamo_libro');
    if (eId || !idGenerado) throw new Error('No se pudo generar el ID del préstamo: ' + (eId ? eId.message : 'respuesta vacía'));

    const { data: prestamo, error } = await _sb.from('bib_prestamos_libros').insert({
      id_prestamo: idGenerado,
      libro_id: libro.id,
      libro_titulo: titulo,
      tipo_prestatario: tipo,
      prestatario_nombre: prestatarioNombre,
      prestatario_email: prestatarioEmail,
      prestatario_curso: prestatarioCurso,
      es_institucional: esInstitucional,
      usuario_registro: usuario,
      observaciones: obs || null,
      fecha_limite_devolucion: fechaLim || null,
    }).select('id').single();
    if (error) throw error;

    // Espejo best-effort hacia Zaiko — no bloquea el préstamo si falla.
    const copiaSel = document.getElementById('npl-zaiko-copia')?.value || '';
    if (copiaSel) {
      try {
        const rz = await gasCall('zaikoPrestar', {
          idPrestamo: idGenerado,
          idActivo: copiaSel,
          tituloLibro: titulo,
          prestatarioNombre,
          prestatarioEmail,
          tipoPrestatario: tipo,
          fechaPrestamo: new Date().toISOString(),
          fechaLimite: fechaLim || null,
          usuario,
        });
        await _sb.from('bib_prestamos_libros').update({
          zaiko_activo_id: copiaSel,
          zaiko_sync_estado: rz.ok ? 'SINCRONIZADO' : 'ERROR',
          zaiko_sync_detalle: rz.ok ? null : (rz.msg || 'Error desconocido'),
        }).eq('id', prestamo.id);
      } catch (ze) {
        await _sb.from('bib_prestamos_libros').update({
          zaiko_activo_id: copiaSel,
          zaiko_sync_estado: 'ERROR',
          zaiko_sync_detalle: ze.message,
        }).eq('id', prestamo.id);
      }
    }

    if (prestatarioEmail) {
      gasCall('enviarCorreo', {
        tipo: 'libro_prestado',
        destinatario: prestatarioEmail,
        idSolicitud: idGenerado,
        prestamoId: prestamo.id,
        libro: titulo,
        editorial: editorial || null,
        fechaLimite: fechaLim || null,
        esInstitucional,
      }).catch(()=>{});
    }

    toast('Préstamo registrado', 'success');
    cerrarModal('modal-prestamo-libro');
    await renderLibros();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

async function abrirDetalleLibro(id) {
  document.getElementById('modal-detalle-libro').classList.add('open');
  const body = document.getElementById('mdl-body');
  body.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const { data: lib, error } = await _sb.from('bib_prestamos_libros')
      .select('*, bib_libros(editorial,area,codigo)').eq('id', id).single();
    if (error) throw error;
    _libDetalleId = id;

    document.getElementById('mdl-id').textContent = lib.id_prestamo || ('#' + lib.id);
    const tipoLbl = { estudiante:'Estudiante', colaborador:'Colaborador', institucional:'Institucional (docente)' };
    const esAbierto = !lib.fecha_devolucion_real;
    const libroInfo = lib.bib_libros || {};
    const zaikoLbl = lib.zaiko_sync_estado === 'SINCRONIZADO'
      ? `<span style="color:var(--green);font-weight:600">✓ Reflejado (${escHtml(lib.zaiko_activo_id || '')})</span>`
      : lib.zaiko_sync_estado === 'ERROR'
        ? `<span style="color:var(--red);font-weight:600" title="${escHtml(lib.zaiko_sync_detalle || '')}">⚠️ No reflejado en Zaiko</span>`
        : `<span style="color:var(--muted)">— Sin copia en Zaiko —</span>`;

    body.innerHTML = `
      <table style="width:100%;font-size:13px;margin-bottom:16px">
        <tr><td style="color:var(--muted);width:140px;padding:4px 0">Libro</td><td>${escHtml(lib.libro_titulo)}</td></tr>
        ${libroInfo.editorial ? `<tr><td style="color:var(--muted);padding:4px 0">Editorial</td><td>${escHtml(libroInfo.editorial)}</td></tr>` : ''}
        ${libroInfo.area ? `<tr><td style="color:var(--muted);padding:4px 0">Área</td><td>${escHtml(libroInfo.area)}</td></tr>` : ''}
        ${libroInfo.codigo ? `<tr><td style="color:var(--muted);padding:4px 0">Código</td><td>${escHtml(libroInfo.codigo)}</td></tr>` : ''}
        <tr><td style="color:var(--muted);padding:4px 0">Tipo</td><td>${tipoLbl[lib.tipo_prestatario] || lib.tipo_prestatario}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Prestatario</td><td>${escHtml(lib.prestatario_nombre)}${lib.prestatario_curso ? ' · ' + escHtml(lib.prestatario_curso) : ''}${lib.prestatario_email ? ' (' + escHtml(lib.prestatario_email) + ')' : ''}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Registrado por</td><td>${escHtml(lib.usuario_registro || '—')} · ${fmtFecha(lib.fecha_prestamo)}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Inventario Zaiko</td><td>${zaikoLbl}</td></tr>
        ${lib.prestatario_email ? `<tr><td style="color:var(--muted);padding:4px 0">Confirmación</td><td>${lib.recepcion_confirmada
          ? `<span style="color:var(--green);font-weight:600">✓ Confirmado${lib.recepcion_confirmada_en ? ' · ' + fmtFecha(lib.recepcion_confirmada_en) : ''}</span>`
          : `<span style="font-size:12px;color:var(--muted)">Pendiente</span>
             <button style="margin-left:10px;padding:4px 12px;font-size:12px;border-radius:5px;border:1px solid var(--green);color:var(--green);background:transparent;cursor:pointer"
               onclick="confirmarRecepcionLibroManual(${lib.id})">✓ Marcar como confirmado</button>`
        }</td></tr>` : ''}
        <tr><td style="color:var(--muted);padding:4px 0">${lib.fecha_limite_devolucion ? 'Fecha límite' : 'Estado'}</td><td>${lib.fecha_limite_devolucion ? lib.fecha_limite_devolucion + ' ' : ''}${_badgePrestamoLibro(lib)}</td></tr>
        ${lib.fecha_devolucion_real ? `<tr><td style="color:var(--muted);padding:4px 0">Devuelto</td><td>${fmtFecha(lib.fecha_devolucion_real)} — recibido por ${escHtml(lib.usuario_recibio_devolucion || '—')}</td></tr>` : ''}
        ${lib.observaciones ? `<tr><td style="color:var(--muted);padding:4px 0">Observaciones</td><td>${escHtml(lib.observaciones)}</td></tr>` : ''}
      </table>
      ${esAbierto ? `<button class="btn btn-primary" onclick="abrirModalDevolucion(${lib.id},'libro')"><i class="fa fa-rotate-left fa-sm"></i> Registrar devolución</button>` : ''}
    `;
  } catch(e) {
    body.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

async function confirmarRecepcionLibroManual(id) {
  const { error } = await _sb.from('bib_prestamos_libros')
    .update({ recepcion_confirmada: true, recepcion_confirmada_en: new Date().toISOString() })
    .eq('id', id);
  if (error) { toast('Error al confirmar: ' + error.message, 'error'); return; }
  toast('Recepción confirmada', 'success');
  await abrirDetalleLibro(id);
  await renderLibros();
}

// ── ENVIAR A MATERIALES (desde Copias o Ventas) ────────────────
async function enviarASolicitudMateriales(solicitudId) {
  try {
    const { data: sol, error } = await _sb.from('bib_solicitudes')
      .select('remitente_email,remitente_nombre,profesor,asunto,observaciones,convertido_a_movimiento')
      .eq('id', solicitudId).single();
    if (error) throw error;
    if (sol.convertido_a_movimiento) { toast('Esta solicitud ya fue enviada a Materiales', 'error'); return; }

    if (document.getElementById('modal-detalle')?.classList.contains('open')) cerrarModal('modal-detalle');

    const navEl = document.querySelector('.ni[data-page="materiales"]');
    navTo('materiales', navEl);
    _matTab = 'movimientos';
    await cargarMateriales();

    abrirModalMovimiento();
    _movSolicitudOrigen = solicitudId;

    const nombreRemitente = sol.profesor || sol.remitente_nombre || sol.remitente_email || 'Remitente desconocido';
    _movColabSel = { id: null, nombre: nombreRemitente, email: sol.remitente_email || null };
    document.getElementById('nm-colab-sel').textContent = sol.remitente_email
      ? `${nombreRemitente} · ${sol.remitente_email}` : nombreRemitente;

    if (sol.remitente_email) {
      const { data: correo } = await _sb.from('bib_colaboradores_correos')
        .select('colaborador_id, bib_colaboradores(area)').eq('email', sol.remitente_email).limit(1).single();
      if (correo) {
        _movColabSel.id = correo.colaborador_id;
        if (correo.bib_colaboradores?.area) document.getElementById('nm-area').value = correo.bib_colaboradores.area;
      }
    }
    document.getElementById('nm-obs').value = [sol.asunto, sol.observaciones].filter(Boolean).join(' — ');

    toast('Completa el tipo de movimiento y los materiales para terminar de registrarlo', 'info');
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function eliminarPrestamoLibro() {
  if (!_libDetalleId) return;
  if (!confirm('¿Eliminar este préstamo? Esta acción no se puede deshacer.')) return;
  try {
    const { data: lib, error: eLib } = await _sb.from('bib_prestamos_libros')
      .select('id_prestamo,fecha_devolucion_real,zaiko_activo_id,zaiko_sync_estado').eq('id', _libDetalleId).single();
    if (eLib) throw eLib;

    // Si el préstamo ya se devolvió, esa devolución ya liberó el libro en
    // Zaiko -- no se vuelve a tocar aquí para no duplicar el efecto. Solo se
    // libera lo que sigue "afuera" en Zaiko: prestado y sincronizado (mismo
    // criterio que eliminarMovimiento() para materiales).
    let restaurado = null;
    if (!lib.fecha_devolucion_real && lib.zaiko_activo_id && lib.zaiko_sync_estado === 'SINCRONIZADO') {
      try {
        const rz = await gasCall('zaikoDevolver', {
          idPrestamo: lib.id_prestamo,
          condicion: 'BUENO',
          obs: 'DEVOLUCION POR ELIMINACION DE PRESTAMO',
        });
        restaurado = !!rz.ok;
      } catch (ze) { restaurado = false; }
    }

    const { error } = await _sb.from('bib_prestamos_libros').delete().eq('id', _libDetalleId);
    if (error) throw error;

    toast(
      restaurado === false
        ? 'Préstamo eliminado — no se pudo liberar el libro en Zaiko, revísalo manualmente'
        : 'Préstamo eliminado',
      restaurado === false ? 'error' : 'success'
    );
    cerrarModal('modal-detalle-libro');
    await renderLibros();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}
