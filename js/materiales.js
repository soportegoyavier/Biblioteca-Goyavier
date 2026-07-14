// ── MATERIALES Y PRÉSTAMOS ────────────────────────────────────
// Este módulo NO es un inventario: solo registra movimientos (préstamo,
// asignación permanente, consumo) sobre un catálogo local reutilizable
// de materiales. El inventario oficial del colegio es Zaiko.

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
    if (_matTab === 'catalogo')    renderCatalogoMateriales();
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

// ── CATÁLOGO DE MATERIALES ─────────────────────────────────────
async function renderCatalogoMateriales(forzar = false) {
  const el = document.getElementById('mat-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    // Respeta la caché al solo navegar a la pestaña (ya la pudo haber
    // poblado cargarMateriales()); forzar=true garantiza datos frescos
    // justo después de escribir (agregar/activar/desactivar).
    if (forzar || !_matCache.length) await _cargarMatCache();
    let rows = _matCache;
    if (_matFiltro) {
      const low = _matFiltro.toLowerCase();
      rows = rows.filter(r => r.nombre.toLowerCase().includes(low));
    }
    el.innerHTML = `
      <div class="sec-hdr"><div class="sec-title">Catálogo de materiales</div><div class="sec-hdr-line"></div></div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:12px">
        Este catálogo no representa existencias — solo el listado de materiales conocidos por el sistema.
        Se completa automáticamente al registrar movimientos, o puedes agregarlo aquí.
      </p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <input type="text" id="nuevo-material-inp" class="fc" placeholder="Nombre del material..." style="max-width:260px;margin:0"
          onkeydown="if(event.key==='Enter')agregarMaterialCatalogo()">
        <input type="text" id="nuevo-material-unidad-inp" class="fc" placeholder="Unidad por defecto (opcional)" style="max-width:180px;margin:0"
          onkeydown="if(event.key==='Enter')agregarMaterialCatalogo()">
        <button class="btn btn-primary" onclick="agregarMaterialCatalogo()"><i class="fa fa-plus fa-sm"></i> Agregar</button>
      </div>
      ${rows.length ? rows.map(m => `
        <div class="notif-row" style="gap:10px">
          <div class="notif-info">
            <div class="notif-email">${escHtml(m.nombre)}</div>
            <div class="notif-tipo">${escHtml(m.unidad_medida_default || 'Sin unidad por defecto')}</div>
          </div>
          <label class="toggle" title="${m.activo ? 'Desactivar' : 'Activar'}">
            <input type="checkbox" ${m.activo ? 'checked' : ''} onchange="toggleMaterialActivo(${m.id}, this.checked)">
            <div class="toggle-track"><div class="toggle-thumb"></div></div>
          </label>
        </div>`).join('') : '<p style="font-size:13px;color:var(--muted)">Sin materiales registrados</p>'}
    `;
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

async function toggleMaterialActivo(id, activo) {
  const { error } = await _sb.from('bib_materiales').update({ activo }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await renderCatalogoMateriales(true);
  toast(activo ? 'Material activado' : 'Material desactivado', 'success');
}

async function agregarMaterialCatalogo() {
  const inp = document.getElementById('nuevo-material-inp');
  const unidadInp = document.getElementById('nuevo-material-unidad-inp');
  const nombre = inp?.value?.trim();
  if (!nombre) { toast('Ingresa un nombre', 'error'); inp?.focus(); return; }
  const { error } = await _sb.from('bib_materiales').insert({ nombre, unidad_medida_default: unidadInp?.value?.trim() || null });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  inp.value = ''; if (unidadInp) unidadInp.value = '';
  await renderCatalogoMateriales(true);
  toast('Material agregado', 'success');
}

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

function _renderSugerenciasMaterial() {
  const q = document.getElementById('nm-mat-nombre').value.trim();
  const panel = document.getElementById('nm-mat-sugerencias');
  if (!q) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  const low = q.toLowerCase();
  const fil = _matCache.filter(m => m.activo && m.nombre.toLowerCase().includes(low)).slice(0, 8);
  if (!fil.length) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = `<div class="ss-list">${fil.map(m => `
    <div class="ss-opt" onclick="_seleccionarMaterialSugerido('${m.id}')">${escHtml(m.nombre)}</div>
  `).join('')}</div>`;
  panel.style.display = 'block';
}

function _seleccionarMaterialSugerido(id) {
  const m = _matCache.find(x => String(x.id) === String(id));
  if (!m) return;
  document.getElementById('nm-mat-nombre').value = m.nombre;
  if (m.unidad_medida_default) document.getElementById('nm-mat-unidad').value = m.unidad_medida_default;
  if (m.marca)        document.getElementById('nm-mat-marca').value = m.marca;
  if (m.color)         document.getElementById('nm-mat-color').value = m.color;
  if (m.tamano)        document.getElementById('nm-mat-tamano').value = m.tamano;
  if (m.presentacion)  document.getElementById('nm-mat-presentacion').value = m.presentacion;
  document.getElementById('nm-mat-sugerencias').style.display = 'none';
}

function agregarLineaMaterial() {
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

  _movMaterialesTemp.push({
    nombre, cantidad, unidad,
    marca: marca || null, color: color || null, tamano: tamano || null,
    presentacion: presentacion || null,
  });
  document.getElementById('nm-mat-nombre').value = '';
  document.getElementById('nm-mat-cantidad').value = '';
  document.getElementById('nm-mat-unidad').value = '';
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
    return `
    <div style="display:flex;align-items:center;gap:10px;background:var(--s3);border-radius:var(--radius-sm);padding:8px 12px">
      <div style="flex:1;font-size:13px">
        ${escHtml(l.nombre)} — <strong>${l.cantidad} ${escHtml(l.unidad)}</strong>
        ${extra ? `<div style="font-size:11px;color:var(--muted)">${escHtml(extra)}</div>` : ''}
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

  const btn = document.getElementById('btn-guardar-movimiento');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const usuario = await usuarioActualEmail();
    const { data: idGenerado } = await _sb.rpc('generar_id_movimiento');

    const { data: mov, error: eMov } = await _sb.from('bib_movimientos').insert({
      id_movimiento: idGenerado || null,
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
      });
    }
    const { error: eLineas } = await _sb.from('bib_movimiento_materiales').insert(lineasParaInsertar);
    if (eLineas) throw eLineas;

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
        <tr><td style="color:var(--muted);padding:4px 0">Colaborador</td><td>${escHtml(mov.colaborador_nombre || '—')} (${escHtml(mov.colaborador_email || '—')})</td></tr>
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
      }).eq('id', _movDevolverId).select('id_prestamo,libro_titulo,prestatario_email').single();
      if (errLib) throw errLib;

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
    }).eq('id', _movDevolverId).select('id_movimiento,colaborador_email').single();
    if (error) throw error;
    await _sb.from('bib_movimientos_historial').insert({
      movimiento_id: _movDevolverId, estado_anterior: 'entregado', estado_nuevo: 'devuelto', notas: obs || null
    });

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
      .select('cantidad_entregada,cantidad_devuelta,movimiento_id').eq('id', _movRetornoLineaId).single();
    if (eLin) throw eLin;
    if (cantidad + linea.cantidad_devuelta > linea.cantidad_entregada) {
      toast('La cantidad devuelta no puede superar lo entregado', 'error');
      return;
    }
    const usuario = await usuarioActualEmail();
    const { error } = await _sb.from('bib_materiales_retornos').insert({
      movimiento_material_id: _movRetornoLineaId,
      cantidad, usuario, observaciones: obs || null,
    });
    if (error) throw error;
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
async function eliminarMovimiento() {
  if (!_movDetalleId) return;
  if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;
  try {
    const { error } = await _sb.from('bib_movimientos').delete().eq('id', _movDetalleId);
    if (error) throw error;
    toast('Movimiento eliminado', 'success');
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
  document.getElementById('modal-prestamo-libro').classList.add('open');
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
  _libBuscarTimer = setTimeout(_renderSugerenciasLibro, 200);
}

async function _renderSugerenciasLibro() {
  const q = document.getElementById('npl-libro-titulo').value.trim();
  const panel = document.getElementById('npl-libro-sugerencias');
  if (!q) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  if (!_libCache.length) {
    const { data } = await _sb.from('bib_libros').select('id,titulo,editorial,area,codigo').eq('activo', true).order('titulo');
    _libCache = data || [];
  }
  const low = q.toLowerCase();
  const fil = _libCache.filter(l => l.titulo.toLowerCase().includes(low)).slice(0, 8);
  if (!fil.length) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = `<div class="ss-list">${fil.map(l => `
    <div class="ss-opt" onclick="_seleccionarLibroSugerido('${l.id}')">${escHtml(l.titulo)}</div>
  `).join('')}</div>`;
  panel.style.display = 'block';
}

function _seleccionarLibroSugerido(id) {
  const l = _libCache.find(x => String(x.id) === String(id));
  if (!l) return;
  document.getElementById('npl-libro-titulo').value = l.titulo;
  if (l.editorial) document.getElementById('npl-libro-editorial').value = l.editorial;
  if (l.area)      document.getElementById('npl-libro-area').value = l.area;
  if (l.codigo)    document.getElementById('npl-libro-codigo').value = l.codigo;
  document.getElementById('npl-libro-sugerencias').style.display = 'none';
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
    const { data: idGenerado } = await _sb.rpc('generar_id_prestamo_libro');

    const { data: prestamo, error } = await _sb.from('bib_prestamos_libros').insert({
      id_prestamo: idGenerado || null,
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

    body.innerHTML = `
      <table style="width:100%;font-size:13px;margin-bottom:16px">
        <tr><td style="color:var(--muted);width:140px;padding:4px 0">Libro</td><td>${escHtml(lib.libro_titulo)}</td></tr>
        ${libroInfo.editorial ? `<tr><td style="color:var(--muted);padding:4px 0">Editorial</td><td>${escHtml(libroInfo.editorial)}</td></tr>` : ''}
        ${libroInfo.area ? `<tr><td style="color:var(--muted);padding:4px 0">Área</td><td>${escHtml(libroInfo.area)}</td></tr>` : ''}
        ${libroInfo.codigo ? `<tr><td style="color:var(--muted);padding:4px 0">Código</td><td>${escHtml(libroInfo.codigo)}</td></tr>` : ''}
        <tr><td style="color:var(--muted);padding:4px 0">Tipo</td><td>${tipoLbl[lib.tipo_prestatario] || lib.tipo_prestatario}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Prestatario</td><td>${escHtml(lib.prestatario_nombre)}${lib.prestatario_curso ? ' · ' + escHtml(lib.prestatario_curso) : ''}${lib.prestatario_email ? ' (' + escHtml(lib.prestatario_email) + ')' : ''}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0">Registrado por</td><td>${escHtml(lib.usuario_registro || '—')} · ${fmtFecha(lib.fecha_prestamo)}</td></tr>
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
    const { error } = await _sb.from('bib_prestamos_libros').delete().eq('id', _libDetalleId);
    if (error) throw error;
    toast('Préstamo eliminado', 'success');
    cerrarModal('modal-detalle-libro');
    await renderLibros();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}
