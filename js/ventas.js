// ── VENTAS (módulo personal/externo) ─────────────────────────
async function cargarVentas() {
  const el = document.getElementById('ventas-list');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const p1 = new Date(_ano, _mes, 1).toISOString();
    const p2 = new Date(_ano, _mes + 1, 1).toISOString();
    const buscar = document.getElementById('inp-buscar-ventas')?.value?.trim() || '';
    let q = _sb.from('bib_solicitudes')
      .select('id,fecha_recepcion,remitente_email,remitente_nombre,asunto,estado,bib_trabajos_personal(id,precio_total,valor_pagado)')
      .eq('tipo_remitente', 'personal')
      .gte('fecha_recepcion', p1).lt('fecha_recepcion', p2)
      .order('fecha_recepcion', { ascending: false });
    if (buscar) q = q.or(`asunto.ilike.%${buscar}%,remitente_email.ilike.%${buscar}%`);
    const [{ data, error }, colabRes] = await Promise.all([
      q,
      _sb.from('bib_colaboradores').select('correo')
    ]);
    if (error) throw error;
    const emailsColab = new Set((colabRes.data || []).map(c => (c.correo || '').trim().toLowerCase()));
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
    return `<div class="vt-card" ${!esCancelado ? `onclick="abrirModalPersonal(${r.id})"` : 'style="opacity:.65;cursor:default"'}>
      <div class="vt-top">
        <div class="vt-info">
          <div class="vt-email">${r.remitente_email}</div>
          <div class="vt-date">${fmtFecha(r.fecha_recepcion)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">${badgeHtml}${moverBtn}${cancelVtBtn}${elimVtBtn}</div>
      </div>
      <div class="vt-asunto">${r.asunto||'—'}</div>
      ${finHtml}
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
  _archivosPersonalDisp = [];
  _archivosPersonalAsig = new Set();
  ['mp-nombre','mp-precio','mp-pagado','mp-obs'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('mp-saldo-preview').style.display = 'none';
  document.getElementById('mp-arch-list').innerHTML = '<span style="color:var(--muted);font-size:13px">Cargando...</span>';
  document.getElementById('mp-trab-section').style.display = 'none';
  document.getElementById('mp-fin-bar').style.display = 'none';
  document.getElementById('modal-personal').classList.add('open');
  try {
    const [solRes, trabRes] = await Promise.all([
      _sb.from('bib_solicitudes')
        .select('id,id_solicitud,remitente_email,asunto,bib_documentos(id,nombre_archivo,tipo_mime,storage_path)')
        .eq('id', solicitudId).single(),
      _sb.from('bib_trabajos_personal')
        .select('id,nombre,archivos,total_hojas,precio_total,valor_pagado,observaciones,created_at')
        .eq('solicitud_id', solicitudId).order('created_at', { ascending: true })
    ]);
    if (solRes.error) throw solRes.error;
    const sol = solRes.data;
    document.getElementById('mp-email').textContent  = sol.id_solicitud || sol.remitente_email;
    document.getElementById('mp-asunto').textContent = sol.asunto || '—';
    document.getElementById('mp-nombre').value = sol.asunto || '';
    _archivosPersonalDisp = sol.bib_documentos || [];
    const trabajos = trabRes.data || [];
    trabajos.forEach(t => (t.archivos||[]).forEach(a => _archivosPersonalAsig.add(a.id || a.nombre_archivo)));
    renderArchivosPersonal();
    _renderTrabajosPersonalList(trabajos, sol.remitente_email);
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
      <div class="file-check-row" onclick="toggleArchivoPers('${fid}')">
        <input type="checkbox" id="pfchk-${fid}" onclick="event.stopPropagation();toggleArchivoPers('${fid}')">
        <span>${nom}</span>
      </div>
      <div class="file-config" id="pfconf-${fid}">
        <div class="fc-grid">
          <div class="fgroup"><div class="fc-label">Copias</div><input type="number" id="pfcopias-${fid}" class="fc" value="1" min="1"></div>
          <div class="fgroup"><div class="fc-label">Páginas</div><input type="number" id="pfpaginas-${fid}" class="fc" value="1" min="1"></div>
        </div>
        <div class="fc-radios">
          <div class="fc-label">Tipo</div>
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="pftipo-${fid}" value="Blanco y negro" checked> B&N</label>
            <label class="fc-radio-lbl"><input type="radio" name="pftipo-${fid}" value="Color"> Color</label>
          </div>
          <div class="fc-label" style="margin-top:6px">Cara</div>
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="pfmodo-${fid}" value="Una cara" checked> Una cara</label>
            <label class="fc-radio-lbl"><input type="radio" name="pfmodo-${fid}" value="Doble cara"> Doble cara</label>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleArchivoPers(fid) {
  const chk = document.getElementById('pfchk-' + fid);
  const conf = document.getElementById('pfconf-' + fid);
  if (chk) chk.checked = !chk.checked;
  if (conf) conf.classList.toggle('open', chk?.checked);
}

function _renderTrabajosPersonalList(trabajos, emailRemit) {
  const section = document.getElementById('mp-trab-section');
  const finBar  = document.getElementById('mp-fin-bar');
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
        ${saldo>0.005?`<button class="btn-abono" onclick="event.stopPropagation();abrirModalAbono(${t.id},${_idPersonal},'${emailRemit}')"><i class="fa fa-hand-holding-dollar fa-xs"></i> Abonar</button>`:''}
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

function recalcSaldo() {
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

async function agregarTrabajoPersonal(evt) {
  const nombre = document.getElementById('mp-nombre').value.trim();
  const precio = parseFloat(document.getElementById('mp-precio').value) || 0;
  const pagado = Math.min(parseFloat(document.getElementById('mp-pagado').value)||0, precio);
  const obs    = document.getElementById('mp-obs').value.trim();
  if (!nombre) { toast('Escribe el nombre del trabajo', 'error'); return; }
  if (precio <= 0) { toast('El precio debe ser mayor a 0', 'error'); return; }

  const archivos = [];
  let totalHojas = 0;
  const nuevasAsig = new Set();
  for (const f of _archivosPersonalDisp) {
    const fid = f.id || f.nombre_archivo;
    const chk = document.getElementById('pfchk-' + fid);
    if (!chk?.checked) continue;
    const copias  = parseInt(document.getElementById('pfcopias-'+fid)?.value)  || 1;
    const paginas = parseInt(document.getElementById('pfpaginas-'+fid)?.value) || 1;
    const tipo    = document.querySelector(`input[name="pftipo-${fid}"]:checked`)?.value || 'Blanco y negro';
    const modo    = document.querySelector(`input[name="pfmodo-${fid}"]:checked`)?.value || 'Una cara';
    const hojas   = modo === 'Doble cara' ? copias * Math.ceil(paginas/2) : copias * paginas;
    archivos.push({ id: f.id, nombre_archivo: f.nombre_archivo, copias, paginas, tipo, modo, hojas });
    totalHojas += hojas;
    nuevasAsig.add(fid);
  }

  const btn = evt.currentTarget;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const { data: trab, error: tErr } = await _sb.from('bib_trabajos_personal').insert({
      solicitud_id: _idPersonal, nombre, archivos, total_hojas: totalHojas,
      precio_total: precio, valor_pagado: 0, observaciones: obs || null
    }).select().single();
    if (tErr) throw tErr;

    if (pagado > 0) {
      const { data: sol } = await _sb.from('bib_solicitudes').select('remitente_email').eq('id', _idPersonal).single();
      await _sb.from('bib_pagos').insert({
        trabajo_id: trab.id, solicitud_id: _idPersonal,
        remitente_email: sol?.remitente_email || '', monto: pagado, notas: 'Pago inicial'
      });
    }

    nuevasAsig.forEach(fid => _archivosPersonalAsig.add(fid));
    ['mp-nombre','mp-precio','mp-pagado','mp-obs'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('mp-saldo-preview').style.display = 'none';
    document.getElementById('mp-nombre').value = '';
    toast('Trabajo registrado', 'success');

    const [trabRes, solRes] = await Promise.all([
      _sb.from('bib_trabajos_personal').select('id,nombre,archivos,total_hojas,precio_total,valor_pagado,observaciones,created_at')
        .eq('solicitud_id', _idPersonal).order('created_at', { ascending: true }),
      _sb.from('bib_solicitudes').select('remitente_email').eq('id', _idPersonal).single()
    ]);
    renderArchivosPersonal();
    _renderTrabajosPersonalList(trabRes.data||[], solRes.data?.remitente_email||'');
    if (_pagina === 'ventas') cargarVentas();
  } catch(e) {
    toast('Error al guardar: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
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
    cerrarModal('modal-abono');
    toast('Abono registrado', 'success');
    if (document.getElementById('modal-personal').classList.contains('open')) {
      const [trabRes, solRes] = await Promise.all([
        _sb.from('bib_trabajos_personal').select('id,nombre,archivos,total_hojas,precio_total,valor_pagado,observaciones,created_at')
          .eq('solicitud_id', _idPersonal).order('created_at', { ascending: true }),
        _sb.from('bib_solicitudes').select('remitente_email').eq('id', _idPersonal).single()
      ]);
      _renderTrabajosPersonalList(trabRes.data||[], solRes.data?.remitente_email||'');
    }
    if (_pagina === 'ventas') cargarVentas();
    if (_pagina === 'caja')   cargarCaja();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}
