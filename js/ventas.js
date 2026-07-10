// ── VENTAS (módulo personal/externo) ─────────────────────────
async function cargarVentas() {
  const el = document.getElementById('ventas-list');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const p1 = new Date(_ano, _mes, 1).toISOString();
    const p2 = new Date(_ano, _mes + 1, 1).toISOString();
    const buscar = document.getElementById('inp-buscar-ventas')?.value?.trim() || '';
    let q = _sb.from('bib_solicitudes')
      .select('id,fecha_recepcion,remitente_email,remitente_nombre,asunto,estado,es_manual,fecha_entrega,recepcion_confirmada,convertido_a_movimiento,bib_trabajos_personal(id,precio_total,valor_pagado)')
      .eq('tipo_remitente', 'personal')
      .gte('fecha_recepcion', p1).lt('fecha_recepcion', p2)
      .order('fecha_recepcion', { ascending: false });
    if (buscar) q = q.or(`asunto.ilike.%${buscar}%,remitente_email.ilike.%${buscar}%`);
    // bib_colaboradores_correos es casi estático — se cachea por sesión en vez
    // de re-consultarse en cada carga/filtro/tecla del buscador con debounce.
    const necesitaColabs = !_ventasColabEmailsCache;
    const [{ data, error }, colabRes] = await Promise.all([
      q,
      necesitaColabs ? _sb.from('bib_colaboradores_correos').select('email') : Promise.resolve(null)
    ]);
    if (error) throw error;
    if (necesitaColabs) {
      _ventasColabEmailsCache = new Set((colabRes.data || []).map(c => (c.email || '').trim().toLowerCase()));
    }
    const emailsColab = _ventasColabEmailsCache;
    let rows = data || [];
    if (_filtroVentas === 'cancelado') {
      rows = rows.filter(r => r.estado === 'cancelado');
    } else {
      rows = rows.filter(r => r.estado !== 'cancelado');
      if (_filtroVentas === 'sin')         rows = rows.filter(r => !(r.bib_trabajos_personal||[]).length);
      else if (_filtroVentas === 'deuda')  rows = rows.filter(r => (r.bib_trabajos_personal||[]).length && (r.bib_trabajos_personal||[]).reduce((a,t) => a+(t.precio_total-t.valor_pagado),0) > 0.005);
      else if (_filtroVentas === 'pagado') rows = rows.filter(r => (r.bib_trabajos_personal||[]).length && (r.bib_trabajos_personal||[]).reduce((a,t) => a+(t.precio_total-t.valor_pagado),0) <= 0.005);
    }
    renderVentas(rows, emailsColab);
    _actualizarBadgeVentas(rows);
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p>${e.message}</p></div>`;
  }
}

function renderVentas(rows, emailsColab) {
  const el = document.getElementById('ventas-list');
  if (!rows.length) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-inbox"></i></div><p>Sin solicitudes personales en ${MESES[_mes]} ${_ano}</p></div>`;
    return;
  }
  el.innerHTML = rows.map(r => {
    const trabs  = r.bib_trabajos_personal || [];
    const total  = trabs.reduce((a,t) => a+(t.precio_total||0), 0);
    const pagado = trabs.reduce((a,t) => a+(t.valor_pagado||0), 0);
    const saldo  = total - pagado;
    const esCancelado = r.estado === 'cancelado';
    let badgeHtml;
    if (esCancelado)         badgeHtml = `<span class="badge b-cancelado">Cancelada</span>`;
    else if (!trabs.length)  badgeHtml = `<span class="badge b-sin-reg">Sin registrar</span>`;
    else if (saldo > 0.005)  badgeHtml = `<span class="badge b-con-deuda">Con deuda</span>`;
    else                     badgeHtml = `<span class="badge b-pagado">Pagado</span>`;
    const finHtml = !esCancelado && trabs.length ? `
      <div class="vt-fin">
        <div class="vt-fin-item"><div class="vt-fin-lbl">Cobrado</div><div class="vt-fin-val">${fmtPesos(total)}</div></div>
        <div class="vt-fin-item"><div class="vt-fin-lbl">Recibido</div><div class="vt-fin-val pagado">${fmtPesos(pagado)}</div></div>
        ${saldo>0.005?`<div class="vt-fin-item"><div class="vt-fin-lbl">Pendiente</div><div class="vt-fin-val deuda">${fmtPesos(saldo)}</div></div>`:''}
        <div class="vt-fin-item" style="margin-left:auto"><div class="vt-fin-lbl">${trabs.length} trabajo${trabs.length>1?'s':''}</div></div>
      </div>` : '';
    const cancelVtBtn = !esCancelado ? `<button class="btn btn-danger-sm" onclick="event.stopPropagation();abrirModalCancelar(${r.id},'ventas')" title="Cancelar solicitud"><i class="fa fa-ban fa-xs"></i></button>` : '';
    const elimVtBtn   = `<button class="btn btn-danger" onclick="event.stopPropagation();abrirModalEliminar(${r.id})" title="Eliminar correo"><i class="fa fa-trash-can fa-xs"></i></button>`;
    const esColab     = emailsColab && emailsColab.has((r.remitente_email||'').trim().toLowerCase());
    const moverBtn    = esColab && !esCancelado ? `<button class="btn btn-mover-inst" onclick="event.stopPropagation();reclasificarComoInstitucional(${r.id})" title="Mover a Gestión de Copias (es colaborador/profe)"><i class="fa fa-arrow-right-to-bracket fa-xs"></i></button>` : '';
    const materialesBtn = !esCancelado && !r.convertido_a_movimiento
      ? `<button class="btn btn-ghost" onclick="event.stopPropagation();enviarASolicitudMateriales(${r.id})" title="Enviar a Materiales"><i class="fa fa-box-archive fa-xs"></i></button>` : '';
    const manualBadge = r.es_manual ? `<span style="font-size:10px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;background:var(--s3);color:var(--muted);border-radius:4px;padding:2px 6px">Manual</span>` : '';
    let accionBtn = '';
    if (!esCancelado && trabs.length) {
      if (r.recepcion_confirmada) {
        accionBtn = `<span style="font-size:11px;font-weight:600;color:var(--green)"><i class="fa fa-circle-check fa-xs"></i> Confirmado</span>`;
      } else if (r.fecha_entrega) {
        accionBtn = `<button class="btn-entrega-conf" onclick="event.stopPropagation();abrirConfirmarEntregaVentasById(${r.id})" title="Confirmar recepción manualmente"><i class="fa fa-circle-check fa-xs"></i> Confirmar</button>`;
      } else {
        accionBtn = `<button class="btn-entregar-vt" onclick="event.stopPropagation();abrirEntregarVentasById(${r.id})" title="Marcar como entregado"><i class="fa fa-box-open fa-xs"></i> Entregar</button>`;
      }
    }
    const lineaId = r.es_manual
      ? (r.remitente_nombre || 'Solicitud manual')
      : (r.remitente_email || r.remitente_nombre || '—');
    return `<div class="vt-card" ${!esCancelado ? `onclick="abrirModalPersonal(${r.id})"` : 'style="opacity:.65;cursor:default"'}>
      <div class="vt-top">
        <div class="vt-info">
          <div class="vt-email">${lineaId}</div>
          <div class="vt-date">${fmtFecha(r.fecha_recepcion)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">${badgeHtml}${manualBadge}${moverBtn}${materialesBtn}${cancelVtBtn}${elimVtBtn}</div>
      </div>
      <div class="vt-asunto">${r.asunto||'—'}</div>
      ${finHtml}
      ${accionBtn ? `<div style="padding:4px 0 2px;text-align:right">${accionBtn}</div>` : ''}
    </div>`;
  }).join('');
}

async function reclasificarComoInstitucional(solicitudId) {
  if (!confirm('¿Mover esta solicitud a Gestión de Copias como institucional?')) return;
  try {
    const { error } = await _sb.from('bib_solicitudes')
      .update({ tipo_remitente: 'institucional' })
      .eq('id', solicitudId);
    if (error) throw error;
    toast('Solicitud movida a Gestión de Copias', 'success');
    cargarVentas();
  } catch(e) {
    toast('Error al reclasificar: ' + e.message, 'error');
  }
}

function _actualizarBadgeVentas(rows) {
  const n = (rows||[]).filter(r => !(r.bib_trabajos_personal||[]).length).length;
  ['nb-ventas','mnb-ventas'].forEach(id => { const el=document.getElementById(id); if(el){el.textContent=n;el.style.display=n>0?'':'none';} });
}

function setFiltroVentas(f, btn) {
  _filtroVentas = f;
  document.querySelectorAll('#page-ventas .fb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cargarVentas();
}
function buscarVentasDebounce() { clearTimeout(_buscarVentasTimer); _buscarVentasTimer = setTimeout(cargarVentas, 380); }

// ── MODAL PERSONAL ────────────────────────────────────────────
async function abrirModalPersonal(solicitudId) {
  _idPersonal = solicitudId;
  _esManualPersonal = false;
  _esCandidatoColab = false;
  _archivosPersonalDisp = [];
  _archivosPersonalAsig = new Set();
  ['mp-nombre','mp-pagado','mp-obs'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('mp-precio').value = '0';
  document.getElementById('mp-saldo-preview').style.display = 'none';
  document.getElementById('mp-precio-preview').style.display = 'none';
  document.getElementById('mp-color-opts').style.display = 'none';
  document.getElementById('mp-colab-badge').style.display = 'none';
  document.getElementById('mp-arch-list').innerHTML = '<span style="color:var(--muted);font-size:13px">Cargando...</span>';
  document.getElementById('mp-trab-section').style.display = 'none';
  document.getElementById('mp-fin-bar').style.display = 'none';
  document.getElementById('modal-personal').classList.add('open');
  try {
    const [solRes, trabRes] = await Promise.all([
      _sb.from('bib_solicitudes')
        .select('id,id_solicitud,remitente_email,remitente_nombre,asunto,es_manual,tipo_solicitante,gmail_message_id,bib_documentos(id,nombre_archivo,tipo_mime,storage_path)')
        .eq('id', solicitudId).single(),
      _sb.from('bib_trabajos_personal')
        .select('id,nombre,archivos,total_hojas,precio_total,valor_pagado,observaciones,created_at')
        .eq('solicitud_id', solicitudId).order('created_at', { ascending: true })
    ]);
    if (solRes.error) throw solRes.error;
    const sol = solRes.data;
    _esManualPersonal = sol.es_manual || false;
    _personalSolCache = { remitente_email: sol.remitente_email, remitente_nombre: sol.remitente_nombre, tipo_solicitante: sol.tipo_solicitante };
    // "Responder" solo aplica a correos reales (no a solicitudes manuales, que no tienen hilo de Gmail al que contestar)
    const btnResponder = document.getElementById('mp-btn-responder');
    if (!_esManualPersonal && sol.gmail_message_id) {
      _detalleActual = { remitente_email: sol.remitente_email, asunto: sol.asunto, gmail_message_id: sol.gmail_message_id };
      btnResponder.style.display = '';
    } else {
      btnResponder.style.display = 'none';
    }

    // Check colaborador por email
    if (sol.remitente_email) {
      const { data: colabMatch } = await _sb.from('bib_colaboradores_correos')
        .select('id').ilike('email', sol.remitente_email.trim()).limit(1);
      _esCandidatoColab = !!(colabMatch && colabMatch.length);
    }

    const lineaId = _esManualPersonal
      ? (sol.remitente_nombre || 'Solicitud manual')
      : (sol.id_solicitud || sol.remitente_email || '—');
    document.getElementById('mp-email').textContent  = lineaId;
    document.getElementById('mp-asunto').textContent = sol.asunto || '—';
    document.getElementById('mp-nombre').value = sol.asunto || '';
    _archivosPersonalDisp = sol.bib_documentos || [];
    const trabajos = trabRes.data || [];
    trabajos.forEach(t => (t.archivos||[]).forEach(a => _archivosPersonalAsig.add(a.id || a.nombre_archivo)));

    // Mostrar badge de colaborador
    if (_esCandidatoColab) document.getElementById('mp-colab-badge').style.display = '';

    if (_esManualPersonal) {
      document.getElementById('mp-arch-group').style.display = 'none';
      document.getElementById('mp-manual-config').style.display = '';
      document.getElementById('mp-man-copias').value = '1';
      document.getElementById('mp-man-paginas').value = '1';
      const rBN    = document.querySelector('input[name="mp-man-tipo"][value="Blanco y negro"]');
      const rUna   = document.querySelector('input[name="mp-man-modo"][value="Una cara"]');
      const rCarta = document.querySelector('input[name="mp-man-hoja"][value="Carta"]');
      if (rBN)    rBN.checked    = true;
      if (rUna)   rUna.checked   = true;
      if (rCarta) rCarta.checked = true;
      document.getElementById('btn-agregar-pers').disabled = false;
      document.getElementById('btn-agregar-pers').style.opacity = '';
      document.getElementById('msg-todos-pers').style.display = 'none';
    } else {
      document.getElementById('mp-arch-group').style.display = '';
      document.getElementById('mp-manual-config').style.display = 'none';
      renderArchivosPersonal();
    }
    recalcPrecioPersonal();
    _renderTrabajosPersonalList(trabajos, sol.remitente_email || sol.remitente_nombre || '');
  } catch(e) { toast('Error al cargar: ' + e.message, 'error'); }
}

function renderArchivosPersonal() {
  const cont = document.getElementById('mp-arch-list');
  if (!_archivosPersonalDisp.length) {
    cont.innerHTML = '<span style="color:var(--muted);font-size:13px">Este correo no tiene archivos adjuntos</span>';
    document.getElementById('mp-arch-counter').style.display = 'none';
    return;
  }
  const pendientes  = _archivosPersonalDisp.filter(f => !_archivosPersonalAsig.has(f.id||f.nombre_archivo));
  document.getElementById('mp-arch-counter').style.display = '';
  document.getElementById('mp-arch-pending').textContent = pendientes.length;
  document.getElementById('mp-arch-total').textContent   = _archivosPersonalDisp.length;

  const todosPers = pendientes.length === 0;
  const btnPers   = document.getElementById('btn-agregar-pers');
  const msgPers   = document.getElementById('msg-todos-pers');
  if (btnPers) { btnPers.disabled = todosPers; btnPers.style.opacity = todosPers ? '0.45' : ''; }
  if (msgPers) { msgPers.style.display = todosPers ? '' : 'none'; }

  cont.innerHTML = _archivosPersonalDisp.map(f => {
    const fid  = f.id || f.nombre_archivo;
    const asig = _archivosPersonalAsig.has(fid);
    const nom  = f.nombre_archivo.length > 45 ? f.nombre_archivo.substring(0,45)+'…' : f.nombre_archivo;
    if (asig) return `<div class="file-item"><div class="file-check-row file-assigned"><span>${nom}</span><span class="file-assigned-badge"><i class="fa fa-check fa-xs"></i> Asignado</span></div></div>`;
    return `<div class="file-item" id="pfi-${fid}">
      <label class="file-check-row" for="pfchk-${fid}">
        <input type="checkbox" id="pfchk-${fid}" onchange="toggleArchivoPers('${fid}')">
        <span>${nom}</span>
      </label>
      <div class="file-config" id="pfconf-${fid}">
        <div class="fc-grid">
          <div class="fgroup"><div class="fc-label">Copias</div><input type="number" id="pfcopias-${fid}" class="fc" value="1" min="1"></div>
          <div class="fgroup"><div class="fc-label">Páginas</div><input type="number" id="pfpaginas-${fid}" class="fc" value="1" min="1"></div>
        </div>
        <div class="fc-radios">
          <div class="fc-label">Tipo</div>
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="pftipo-${fid}" value="Blanco y negro" checked onchange="onTipoFileChange()"> B&N</label>
            <label class="fc-radio-lbl"><input type="radio" name="pftipo-${fid}" value="Color" onchange="onTipoFileChange()"> Color</label>
          </div>
          <div class="fc-label" style="margin-top:6px">Cara</div>
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="pfmodo-${fid}" value="Una cara" checked onchange="recalcPrecioPersonal()"> Una cara</label>
            <label class="fc-radio-lbl"><input type="radio" name="pfmodo-${fid}" value="Doble cara" onchange="recalcPrecioPersonal()"> Doble cara</label>
          </div>
          <div class="fc-label" style="margin-top:6px">Tamaño</div>
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="pfhoja-${fid}" value="Carta" checked> Carta</label>
            <label class="fc-radio-lbl"><input type="radio" name="pfhoja-${fid}" value="Oficio"> Oficio</label>
            <label class="fc-radio-lbl"><input type="radio" name="pfhoja-${fid}" value="Doble Carta"> Doble Carta</label>
            <label class="fc-radio-lbl"><input type="radio" name="pfhoja-${fid}" value="A4"> A4</label>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleArchivoPers(fid) {
  const chk = document.getElementById('pfchk-' + fid);
  const conf = document.getElementById('pfconf-' + fid);
  if (conf) conf.classList.toggle('open', chk?.checked);
  onTipoFileChange();
}

function _renderTrabajosPersonalList(trabajos, emailRemit) {
  const section = document.getElementById('mp-trab-section');
  const finBar  = document.getElementById('mp-fin-bar');
  _trabajosPersonalCache = trabajos;
  if (!trabajos.length) { section.style.display = 'none'; finBar.style.display = 'none'; return; }
  section.style.display = '';
  finBar.style.display  = '';
  document.getElementById('mp-trab-count').textContent = trabajos.length + ' trabajo' + (trabajos.length>1?'s':'');
  const totP  = trabajos.reduce((a,t) => a+(t.precio_total||0), 0);
  const totPg = trabajos.reduce((a,t) => a+(t.valor_pagado||0), 0);
  const totSl = totP - totPg;
  document.getElementById('mp-fin-total').textContent    = fmtPesos(totP);
  document.getElementById('mp-fin-recibido').textContent = fmtPesos(totPg);
  document.getElementById('mp-fin-saldo').textContent    = fmtPesos(totSl);
  document.getElementById('mp-fin-saldo').className      = 'fin-cell-val ' + (totSl>0.005?'deuda':'pagado');
  document.getElementById('mp-trab-list').innerHTML = trabajos.map(t => {
    const saldo  = (t.precio_total||0) - (t.valor_pagado||0);
    const archStr = (t.archivos||[]).map(a=>a.nombre_archivo).join(', ') || 'Sin archivos';
    const hojaStr = t.total_hojas > 0 ? ` · ${t.total_hojas} hoja${t.total_hojas>1?'s':''}` : '';
    return `<div class="trab-p-card">
      <div class="trab-p-head">
        <div class="trab-p-name">${t.nombre}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost-sm" onclick="event.stopPropagation();abrirModalEditarTrabajo(${t.id})" title="Editar hojas/páginas o total abonado"><i class="fa fa-pen fa-xs"></i></button>
          ${saldo>0.005?`<button class="btn-abono" onclick="event.stopPropagation();abrirModalAbono(${t.id},${_idPersonal},'${emailRemit}')"><i class="fa fa-hand-holding-dollar fa-xs"></i> Abonar</button>`:''}
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">${archStr}${hojaStr}</div>
      <div class="trab-p-fin">
        <div class="trab-p-fin-item"><div class="trab-p-fin-lbl">Precio</div><div class="trab-p-fin-v">${fmtPesos(t.precio_total||0)}</div></div>
        <div class="trab-p-fin-item"><div class="trab-p-fin-lbl">Pagado</div><div class="trab-p-fin-v verde">${fmtPesos(t.valor_pagado||0)}</div></div>
        <div class="trab-p-fin-item"><div class="trab-p-fin-lbl">Saldo</div><div class="trab-p-fin-v ${saldo>0.005?'rojo':'verde'}">${fmtPesos(saldo)}</div></div>
      </div>
    </div>`;
  }).join('');
}

// ── EDITAR TRABAJO (corregir hojas/páginas y/o el total abonado) ──
function abrirModalEditarTrabajo(trabajoId) {
  const t = (_trabajosPersonalCache || []).find(x => x.id === trabajoId);
  if (!t) { toast('Trabajo no encontrado', 'error'); return; }
  _editarTrabajoId = trabajoId;
  document.getElementById('mte-info').textContent   = t.nombre;
  document.getElementById('mte-hojas').value  = t.total_hojas || 0;
  document.getElementById('mte-precio').value = t.precio_total || 0;
  document.getElementById('mte-pagado').value = t.valor_pagado || 0;
  document.getElementById('mte-notas').value  = '';
  document.getElementById('modal-editar-trabajo').classList.add('open');
}

// El total abonado no se sobreescribe directamente: bib_trabajos_personal.valor_pagado
// se recalcula a partir de la suma de bib_pagos (mismo mecanismo que usa "Abonar"), así
// que una corrección se registra como un pago con el delta (puede ser negativo).
async function confirmarEditarTrabajo() {
  const hojas       = parseFloat(document.getElementById('mte-hojas').value);
  const precio      = parseFloat(document.getElementById('mte-precio').value);
  const pagadoNuevo = parseFloat(document.getElementById('mte-pagado').value);
  const notas       = document.getElementById('mte-notas').value.trim();
  if ([hojas, precio, pagadoNuevo].some(v => isNaN(v) || v < 0)) {
    toast('Los valores no pueden estar vacíos ni ser negativos', 'error'); return;
  }
  const t = (_trabajosPersonalCache || []).find(x => x.id === _editarTrabajoId);
  if (!t) { toast('Trabajo no encontrado', 'error'); return; }

  const btn = document.getElementById('btn-conf-editar-trabajo');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const { error: uErr } = await _sb.from('bib_trabajos_personal')
      .update({ total_hojas: hojas, precio_total: precio })
      .eq('id', _editarTrabajoId);
    if (uErr) throw uErr;

    const delta = pagadoNuevo - (t.valor_pagado || 0);
    if (Math.abs(delta) > 0.005) {
      const { error: pErr } = await _sb.from('bib_pagos').insert({
        trabajo_id: _editarTrabajoId, solicitud_id: _idPersonal,
        remitente_email: _personalSolCache?.remitente_email || '',
        monto: delta, notas: 'Corrección manual' + (notas ? ': ' + notas : '')
      });
      if (pErr) throw pErr;
    }

    cerrarModal('modal-editar-trabajo');
    toast('Trabajo actualizado', 'success');
    const trabRes = await _sb.from('bib_trabajos_personal')
      .select('id,nombre,archivos,total_hojas,precio_total,valor_pagado,observaciones,created_at')
      .eq('solicitud_id', _idPersonal).order('created_at', { ascending: true });
    _renderTrabajosPersonalList(trabRes.data || [], _personalSolCache?.remitente_email || _personalSolCache?.remitente_nombre || '');
    if (_pagina === 'ventas') cargarVentas();
    if (_pagina === 'caja')   cargarCaja();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

function recalcSaldo() { recalcPrecioPersonal(); }

// ── PRECIO AUTOMÁTICO ─────────────────────────────────────────
function _calcTrabajoPersonal() {
  let totalHojas   = 0; // hojas de papel físicas (para stock/reporte) -- doble cara usa la mitad
  let totalPaginas = 0; // páginas realmente impresas (para precio) -- doble cara NO las reduce
  const archivos = [];
  const nuevasAsig = new Set();

  if (_esManualPersonal) {
    const copias  = parseInt(document.getElementById('mp-man-copias')?.value)  || 1;
    const paginas = parseInt(document.getElementById('mp-man-paginas')?.value) || 1;
    const tipo    = document.querySelector('input[name="mp-man-tipo"]:checked')?.value || 'Blanco y negro';
    const modo    = document.querySelector('input[name="mp-man-modo"]:checked')?.value || 'Una cara';
    const hoja    = document.querySelector('input[name="mp-man-hoja"]:checked')?.value || 'Carta';
    const hojas   = modo === 'Doble cara' ? copias * Math.ceil(paginas / 2) : copias * paginas;
    totalHojas    = hojas;
    totalPaginas  = copias * paginas;
    const nombre  = document.getElementById('mp-nombre')?.value.trim() || 'Trabajo manual';
    archivos.push({ nombre_archivo: nombre, copias, paginas, tipo, modo, tamano_hoja: hoja, hojas });
  } else {
    for (const f of _archivosPersonalDisp) {
      const fid = f.id || f.nombre_archivo;
      const chk = document.getElementById('pfchk-' + fid);
      if (!chk?.checked) continue;
      const copias  = parseInt(document.getElementById('pfcopias-' + fid)?.value)  || 1;
      const paginas = parseInt(document.getElementById('pfpaginas-' + fid)?.value) || 1;
      const tipo    = document.querySelector(`input[name="pftipo-${fid}"]:checked`)?.value || 'Blanco y negro';
      const modo    = document.querySelector(`input[name="pfmodo-${fid}"]:checked`)?.value || 'Una cara';
      const hoja    = document.querySelector(`input[name="pfhoja-${fid}"]:checked`)?.value || 'Carta';
      const hojas   = modo === 'Doble cara' ? copias * Math.ceil(paginas / 2) : copias * paginas;
      archivos.push({ id: f.id, nombre_archivo: f.nombre_archivo, copias, paginas, tipo, modo, tamano_hoja: hoja, hojas });
      totalHojas   += hojas;
      totalPaginas += copias * paginas;
      nuevasAsig.add(fid);
    }
  }

  const tipo = _esManualPersonal
    ? (document.querySelector('input[name="mp-man-tipo"]:checked')?.value || 'Blanco y negro')
    : _getPrimerTipoSeleccionado();

  let precioUnitario = 0;
  let porcentajeColor = null;
  let modoToner = null;

  if (tipo === 'Color') {
    const pct        = parseInt(document.querySelector('input[name="mp-color-pct"]:checked')?.value || '100');
    const tonerMode  = document.querySelector('input[name="mp-toner"]:checked')?.value || 'ahorro';
    const colorBase  = Math.ceil(pct / 25) * 500;
    const tonerExtra = tonerMode === 'full' ? 500 : 0;
    precioUnitario   = colorBase + tonerExtra;
    porcentajeColor  = pct;
    modoToner        = tonerMode;
  } else {
    precioUnitario = _esCandidatoColab ? 200 : 300;
  }

  // Precio por PÁGINA impresa, no por hoja de papel: doble cara usa menos hojas
  // pero imprime las mismas páginas (mismo consumo de tóner), no debe salir más barato.
  _precioUnitarioCalculado = precioUnitario;
  return { precioTotal: totalPaginas * precioUnitario, totalHojas, totalPaginas, archivos, nuevasAsig, porcentajeColor, modoToner };
}

function recalcPrecioPersonal() {
  const { precioTotal, totalHojas, totalPaginas, porcentajeColor, modoToner } = _calcTrabajoPersonal();
  document.getElementById('mp-precio').value = precioTotal;

  const tipo = _esManualPersonal
    ? (document.querySelector('input[name="mp-man-tipo"]:checked')?.value || 'Blanco y negro')
    : _getPrimerTipoSeleccionado();

  const preview  = document.getElementById('mp-precio-preview');
  const detalleEl = document.getElementById('mp-precio-detalle');
  const calcEl   = document.getElementById('mp-precio-calc');
  if (totalHojas > 0 && precioTotal > 0) {
    preview.style.display = '';
    let detalle = '';
    if (tipo === 'Color') {
      const tonerMode = document.querySelector('input[name="mp-toner"]:checked')?.value || 'ahorro';
      detalle = `Color ${porcentajeColor}%${tonerMode === 'full' ? ' + Full toner' : ''} · ${totalPaginas} página${totalPaginas !== 1 ? 's' : ''} × ${fmtPesos(_precioUnitarioCalculado)}`;
    } else {
      detalle = `B&N${_esCandidatoColab ? ' (colaborador)' : ''} · ${totalPaginas} página${totalPaginas !== 1 ? 's' : ''} × ${fmtPesos(_precioUnitarioCalculado)}`;
    }
    detalleEl.textContent = detalle;
    calcEl.textContent    = fmtPesos(precioTotal);
  } else {
    preview.style.display = 'none';
  }
  recalcSaldoPersonal();
}

function recalcSaldoPersonal() {
  const precio = parseFloat(document.getElementById('mp-precio').value) || 0;
  const pagado = parseFloat(document.getElementById('mp-pagado').value) || 0;
  const prev   = document.getElementById('mp-saldo-preview');
  const val    = document.getElementById('mp-saldo-val');
  if (precio > 0) {
    prev.style.display = '';
    val.textContent    = fmtPesos(precio - pagado);
    val.style.color    = (precio - pagado) > 0.005 ? 'var(--red)' : 'var(--green)';
  } else {
    prev.style.display = 'none';
  }
}

function _getPrimerTipoSeleccionado() {
  for (const f of _archivosPersonalDisp) {
    const fid = f.id || f.nombre_archivo;
    const chk = document.getElementById('pfchk-' + fid);
    if (!chk?.checked) continue;
    return document.querySelector(`input[name="pftipo-${fid}"]:checked`)?.value || 'Blanco y negro';
  }
  return 'Blanco y negro';
}

function onTipoManualChange() {
  const tipo = document.querySelector('input[name="mp-man-tipo"]:checked')?.value || 'Blanco y negro';
  document.getElementById('mp-color-opts').style.display = tipo === 'Color' ? '' : 'none';
  recalcPrecioPersonal();
}

function onTipoFileChange() {
  const anyColor = _archivosPersonalDisp.some(f => {
    const fid = f.id || f.nombre_archivo;
    const chk = document.getElementById('pfchk-' + fid);
    if (!chk?.checked) return false;
    return document.querySelector(`input[name="pftipo-${fid}"]:checked`)?.value === 'Color';
  });
  document.getElementById('mp-color-opts').style.display = anyColor ? '' : 'none';
  recalcPrecioPersonal();
}

async function agregarTrabajoPersonal(evt) {
  const nombre = document.getElementById('mp-nombre').value.trim();
  const obs    = document.getElementById('mp-obs').value.trim();
  if (!nombre) { toast('Escribe el nombre del trabajo', 'error'); return; }

  const { precioTotal, totalHojas, archivos, nuevasAsig, porcentajeColor, modoToner } = _calcTrabajoPersonal();
  if (precioTotal <= 0) { toast('Selecciona al menos un archivo o configura el trabajo', 'error'); return; }

  const pagado = Math.min(parseFloat(document.getElementById('mp-pagado').value)||0, precioTotal);

  const btn = evt.currentTarget;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const { data: trab, error: tErr } = await _sb.from('bib_trabajos_personal').insert({
      solicitud_id: _idPersonal, nombre, archivos, total_hojas: totalHojas,
      precio_total: precioTotal, precio_unitario: _precioUnitarioCalculado,
      porcentaje_color: porcentajeColor, modo_toner: modoToner,
      valor_pagado: 0, observaciones: obs || null
    }).select().single();
    if (tErr) throw tErr;

    if (pagado > 0) {
      await _sb.from('bib_pagos').insert({
        trabajo_id: trab.id, solicitud_id: _idPersonal,
        remitente_email: _personalSolCache?.remitente_email || '', monto: pagado, notas: 'Pago inicial'
      });
      await _enviarComprobantePago(trab.id, pagado);
    }

    nuevasAsig.forEach(fid => _archivosPersonalAsig.add(fid));
    ['mp-nombre','mp-pagado','mp-obs'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('mp-precio').value = '0';
    document.getElementById('mp-saldo-preview').style.display = 'none';
    document.getElementById('mp-precio-preview').style.display = 'none';
    document.getElementById('mp-color-opts').style.display = 'none';
    if (_esManualPersonal) {
      document.getElementById('mp-man-copias').value = '1';
      document.getElementById('mp-man-paginas').value = '1';
      const rBN    = document.querySelector('input[name="mp-man-tipo"][value="Blanco y negro"]');
      const rCarta = document.querySelector('input[name="mp-man-hoja"][value="Carta"]');
      if (rBN)    rBN.checked    = true;
      if (rCarta) rCarta.checked = true;
    }
    toast('Trabajo registrado', 'success');

    const trabRes = await _sb.from('bib_trabajos_personal')
      .select('id,nombre,archivos,total_hojas,precio_total,valor_pagado,observaciones,created_at')
      .eq('solicitud_id', _idPersonal).order('created_at', { ascending: true });
    if (!_esManualPersonal) renderArchivosPersonal();
    _renderTrabajosPersonalList(trabRes.data||[], _personalSolCache?.remitente_email || _personalSolCache?.remitente_nombre || '');
    if (_pagina === 'ventas') cargarVentas();
  } catch(e) {
    toast('Error al guardar: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// Comprobante de pago -- se manda tanto desde el pago inicial (al crear el
// trabajo) como desde un abono posterior, mismo correo en los dos casos.
// Solo si el remitente tiene correo real (_personalSolCache.remitente_email,
// no el nombre de respaldo que usa la UI cuando no hay correo).
async function _enviarComprobantePago(trabajoId, monto) {
  const emailReal = _personalSolCache?.remitente_email;
  // No se envían correos a estudiantes, aunque haya quedado un email registrado.
  if (!emailReal || _personalSolCache?.tipo_solicitante === 'estudiante') return false;
  const { data: trab } = await _sb.from('bib_trabajos_personal')
    .select('nombre,precio_total,valor_pagado').eq('id', trabajoId).single();
  if (!trab) return false;
  const saldo = Math.max(0, (trab.precio_total||0) - (trab.valor_pagado||0));
  gasCall('enviarCorreo', {
    tipo: 'abono_registrado',
    destinatario: emailReal,
    nombreRecibe: _personalSolCache?.remitente_nombre || emailReal,
    asunto: trab.nombre,
    monto: monto,
    precioTotal: trab.precio_total,
    pagado: trab.valor_pagado,
    saldo: saldo,
    fecha: new Date().toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' })
  }).catch(()=>{});
  return true;
}

// ── MODAL ABONO ───────────────────────────────────────────────
function abrirModalAbono(trabajoId, solicitudId, emailRemit) {
  _abonoTrabajoId   = trabajoId;
  _abonoSolicitudId = solicitudId;
  _abonoEmailRemit  = emailRemit;
  document.getElementById('mab-monto').value = '';
  document.getElementById('mab-notas').value = '';
  document.getElementById('mab-info').textContent = emailRemit;
  document.getElementById('modal-abono').classList.add('open');
}

async function confirmarAbono() {
  const monto = parseFloat(document.getElementById('mab-monto').value) || 0;
  const notas = document.getElementById('mab-notas').value.trim();
  if (monto <= 0) { toast('El monto debe ser mayor a 0', 'error'); return; }
  const btn = document.getElementById('btn-conf-abono');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const { error } = await _sb.from('bib_pagos').insert({
      trabajo_id: _abonoTrabajoId, solicitud_id: _abonoSolicitudId,
      remitente_email: _abonoEmailRemit, monto, notas: notas||null
    });
    if (error) throw error;
    const seEnvioCorreo = await _enviarComprobantePago(_abonoTrabajoId, monto);
    cerrarModal('modal-abono');
    toast('Abono registrado' + (seEnvioCorreo ? ' · Comprobante enviado' : ''), 'success');
    if (document.getElementById('modal-personal').classList.contains('open')) {
      const trabRes = await _sb.from('bib_trabajos_personal')
        .select('id,nombre,archivos,total_hojas,precio_total,valor_pagado,observaciones,created_at')
        .eq('solicitud_id', _idPersonal).order('created_at', { ascending: true });
      _renderTrabajosPersonalList(trabRes.data||[], _personalSolCache?.remitente_email||'');
    }
    if (_pagina === 'ventas') cargarVentas();
    if (_pagina === 'caja')   cargarCaja();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}

// ── NUEVA SOLICITUD MANUAL ─────────────────────────────────────
function abrirModalNuevaSolicitudManual() {
  document.getElementById('mnm-nombre').value = '';
  document.getElementById('mnm-grado').value = '';
  document.getElementById('mnm-email').value = '';
  document.getElementById('mnm-asunto').value = '';
  document.getElementById('mnm-colab-badge').style.display = 'none';
  document.getElementById('mnm-colab-select').value = '';
  document.getElementById('mnm-colab-info').style.display = 'none';
  document.querySelector('input[name="mnm-tipo"][value="estudiante"]').checked = true;
  onMnmTipoChange();
  document.getElementById('modal-nueva-manual').classList.add('open');
  setTimeout(() => document.getElementById('mnm-nombre').focus(), 80);
}

// Estudiante/Externo: nombre+grado+email libres. Colaborador: se elige de
// una lista (ya tiene nombre/área/correo en bib_colaboradores), solo falta
// la descripción del trabajo.
async function onMnmTipoChange() {
  const tipo    = document.querySelector('input[name="mnm-tipo"]:checked')?.value || 'estudiante';
  const esColab = tipo === 'colaborador';
  const esEstudiante = tipo === 'estudiante';
  document.getElementById('mnm-sec-manual').style.display = esColab ? 'none' : '';
  document.getElementById('mnm-sec-colab').style.display  = esColab ? '' : 'none';
  // No se envían correos a estudiantes: ni se pide ni se guarda el email.
  document.getElementById('mnm-email-group').style.display    = esEstudiante ? 'none' : '';
  document.getElementById('mnm-estudiante-nota').style.display = esEstudiante ? '' : 'none';
  if (esEstudiante) {
    document.getElementById('mnm-email').value = '';
    document.getElementById('mnm-colab-badge').style.display = 'none';
  }
  if (esColab && !_mnmColabsCache) {
    const sel = document.getElementById('mnm-colab-select');
    sel.innerHTML = '<option value="">Cargando...</option>';
    const { data, error } = await _sb.from('bib_colaboradores')
      .select('id,nombre,area,bib_colaboradores_correos(email,principal)')
      .eq('activo', true).order('area').order('nombre');
    _mnmColabsCache = error ? [] : (data || []);
    sel.innerHTML = '<option value="">Selecciona...</option>' +
      _mnmColabsCache.map(c => `<option value="${c.id}">${escHtml(c.nombre)}${c.area ? ' — ' + escHtml(c.area) : ''}</option>`).join('');
  }
}

function onMnmColabSeleccionado() {
  const id   = document.getElementById('mnm-colab-select').value;
  const info = document.getElementById('mnm-colab-info');
  const c    = (_mnmColabsCache || []).find(x => String(x.id) === id);
  if (!c) { info.style.display = 'none'; return; }
  const correos = c.bib_colaboradores_correos || [];
  const email   = (correos.find(e => e.principal) || correos[0] || {}).email || '';
  info.textContent  = [c.area, email].filter(Boolean).join(' · ') || 'Sin área ni correo registrados';
  info.style.display = '';
}

function onMnmEmailChange() {
  clearTimeout(_mnmEmailTimer);
  _mnmEmailTimer = setTimeout(async () => {
    const email = document.getElementById('mnm-email').value.trim().toLowerCase();
    const badge = document.getElementById('mnm-colab-badge');
    if (!email) { badge.style.display = 'none'; return; }
    const { data } = await _sb.from('bib_colaboradores_correos')
      .select('id').ilike('email', email).limit(1);
    badge.style.display = (data && data.length) ? '' : 'none';
  }, 400);
}

async function confirmarNuevaSolicitudManual() {
  const tipo   = document.querySelector('input[name="mnm-tipo"]:checked')?.value || 'estudiante';
  const asunto = document.getElementById('mnm-asunto').value.trim();
  if (!asunto) { toast('Escribe la descripción del trabajo', 'error'); return; }

  let nombre = null, email = null, area = null, grado = null;
  if (tipo === 'colaborador') {
    const id = document.getElementById('mnm-colab-select').value;
    const c  = (_mnmColabsCache || []).find(x => String(x.id) === id);
    if (!c) { toast('Selecciona un colaborador', 'error'); return; }
    const correos = c.bib_colaboradores_correos || [];
    nombre = c.nombre;
    area   = c.area || null;
    email  = (correos.find(e => e.principal) || correos[0] || {}).email || null;
  } else {
    nombre = document.getElementById('mnm-nombre').value.trim() || null;
    // No se envían correos a estudiantes, aunque el campo tenga un valor residual.
    email  = tipo === 'estudiante' ? null : (document.getElementById('mnm-email').value.trim() || null);
    grado  = document.getElementById('mnm-grado').value.trim() || null;
  }

  const btn = document.getElementById('btn-conf-manual');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const { data: sol, error } = await _sb.from('bib_solicitudes').insert({
      tipo_remitente: 'personal',
      tipo_solicitante: tipo,
      es_manual: true,
      remitente_nombre: nombre,
      remitente_email: email,
      area: area,
      grado: grado,
      asunto: asunto,
      estado: 'pendiente',
      fecha_recepcion: new Date().toISOString()
    }).select().single();
    if (error) throw error;
    cerrarModal('modal-nueva-manual');
    toast('Solicitud creada', 'success');
    cargarVentas();
    abrirModalPersonal(sol.id);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// ── ENTREGAR VENTAS (paso 1) ───────────────────────────────────
async function abrirEntregarVentasById(solicitudId) {
  const { data, error } = await _sb.from('bib_solicitudes')
    .select('id,remitente_email,remitente_nombre,asunto,tipo_solicitante').eq('id', solicitudId).single();
  if (error) { toast('Error al cargar solicitud', 'error'); return; }
  _confirmarEntregaVentasId = data.id;
  const info = data.remitente_nombre || data.remitente_email || data.asunto || ('Solicitud #' + solicitudId);
  document.getElementById('mev-info').textContent = info;
  const emailRow  = document.getElementById('mev-email-row');
  const emailDest = document.getElementById('mev-email-dest');
  // No se envían correos a estudiantes, aunque haya quedado un email registrado.
  if (data.remitente_email && data.tipo_solicitante !== 'estudiante') {
    emailRow.style.display = '';
    emailDest.textContent  = data.remitente_email;
    document.getElementById('mev-send-email').checked = true;
  } else {
    emailRow.style.display = 'none';
    document.getElementById('mev-send-email').checked = false;
  }
  document.getElementById('modal-entregar-ventas').classList.add('open');
}

async function marcarEntregadoVentas() {
  const btn = document.getElementById('btn-marcar-entregado');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const ahora = new Date().toISOString();
    const { data: sol, error } = await _sb.from('bib_solicitudes')
      .update({ fecha_entrega: ahora })
      .eq('id', _confirmarEntregaVentasId)
      .select('id,remitente_email,remitente_nombre,asunto,tipo_solicitante').single();
    if (error) throw error;

    const sendEmail = document.getElementById('mev-send-email')?.checked;
    // No se envían correos a estudiantes, aunque el checkbox quede marcado.
    if (sendEmail && sol.remitente_email && sol.tipo_solicitante !== 'estudiante') {
      // Solo Ventas cobra (Gestión de Copias es institucional, sin precio) --
      // por eso el correo de aquí sí lleva pagado/saldo y se marca esPersonal
      // para que el backend lo distinga visualmente del de Copias.
      const { data: trabajos } = await _sb.from('bib_trabajos_personal')
        .select('precio_total,valor_pagado').eq('solicitud_id', _confirmarEntregaVentasId);
      const total  = (trabajos||[]).reduce((a,t) => a+(t.precio_total||0), 0);
      const pagado = (trabajos||[]).reduce((a,t) => a+(t.valor_pagado||0), 0);
      gasCall('enviarCorreo', {
        tipo: 'entregado',
        destinatario: sol.remitente_email,
        asunto: sol.asunto,
        nombreRecibe: sol.remitente_nombre || sol.remitente_email,
        solicitudUuid: String(_confirmarEntregaVentasId),
        fechaEntrega: new Date(ahora).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        esPersonal: true,
        precioTotal: total, pagado: pagado, saldo: Math.max(0, total - pagado)
      }).catch(() => {});
    }

    const seEnvio = sendEmail && sol.remitente_email && sol.tipo_solicitante !== 'estudiante';
    toast('Marcado como entregado' + (seEnvio ? ' · Correo enviado' : ''), 'success');
    cerrarModal('modal-entregar-ventas');
    cargarVentas();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// ── CONFIRMAR RECEPCIÓN VENTAS (paso 2, manual) ────────────────
async function abrirConfirmarEntregaVentasById(solicitudId) {
  const { data, error } = await _sb.from('bib_solicitudes')
    .select('id,remitente_nombre,remitente_email,asunto').eq('id', solicitudId).single();
  if (error) { toast('Error al cargar solicitud', 'error'); return; }
  _confirmarEntregaVentasId = data.id;
  const info = data.remitente_nombre || data.remitente_email || data.asunto || ('Solicitud #' + solicitudId);
  document.getElementById('mcev-info').textContent = info;
  document.getElementById('modal-confirmar-entrega-ventas').classList.add('open');
}

async function confirmarEntregaVentas() {
  const btn = document.getElementById('btn-conf-entrega-ventas');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const ahora = new Date().toISOString();
    const { error } = await _sb.from('bib_solicitudes')
      .update({ recepcion_confirmada: true, recepcion_confirmada_en: ahora })
      .eq('id', _confirmarEntregaVentasId);
    if (error) throw error;
    toast('Recepción confirmada', 'success');
    cerrarModal('modal-confirmar-entrega-ventas');
    cargarVentas();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}
