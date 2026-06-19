// ── SOLICITUDES ──────────────────────────────────────────────
async function cargarSolicitudes() {
  document.getElementById('tabla-wrap').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  document.getElementById('card-list').innerHTML  = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const p1 = new Date(_ano, _mes, 1).toISOString();
    const p2 = new Date(_ano, _mes + 1, 1).toISOString();
    const buscar = document.getElementById('inp-buscar')?.value?.trim() || '';
    let q = _sb.from('bib_solicitudes')
      .select('id,id_solicitud,fecha_recepcion,remitente_email,asunto,estado,profesor,materia,bib_documentos(id,nombre_archivo,num_hojas,tipo_impresion,forma_impresion)')
      .in('tipo_remitente', ['institucional', 'general'])
      .gte('fecha_recepcion', p1).lt('fecha_recepcion', p2)
      .order('fecha_recepcion', { ascending: false });
    if (_filtro === 'cancelado')      q = q.eq('estado', 'cancelado');
    else if (_filtro)                q = q.eq('estado', _filtro);
    else                             q = q.neq('estado', 'cancelado');
    if (buscar)  q = q.or(`profesor.ilike.%${buscar}%,asunto.ilike.%${buscar}%,remitente_email.ilike.%${buscar}%,id_solicitud.ilike.%${buscar}%`);
    const { data, error } = await q;
    if (error) throw error;
    renderTabla(data || []);
    renderCards(data || []);
  } catch(e) {
    const m = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p>${e.message}</p></div>`;
    document.getElementById('tabla-wrap').innerHTML = m;
    document.getElementById('card-list').innerHTML  = m;
  }
}

function renderTabla(rows) {
  const wrap = document.getElementById('tabla-wrap');
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-inbox"></i></div><p>Sin solicitudes en ${MESES[_mes]} ${_ano}</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="tw"><table>
    <thead><tr><th>ID</th><th>Fecha</th><th>Asunto / Solicitante</th><th>Estado</th><th>Hojas</th><th>Siguiente paso</th><th></th></tr></thead>
    <tbody>${rows.map(filaHTML).join('')}</tbody>
  </table></div>`;
}

function filaHTML(r) {
  const hojas = (r.bib_documentos||[]).reduce((a,d) => a+(d.num_hojas||0), 0);
  return `<tr id="row-${r.id}">
    <td class="td-id" onclick="verDetalle(${r.id})">${r.id_solicitud || '<span class="td-m">Sin ID</span>'}</td>
    <td class="td-m">${fmtFecha(r.fecha_recepcion)}</td>
    <td>
      <div style="font-size:13px;font-weight:500;max-width:220px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35">${r.asunto||'—'}</div>
      <div class="td-m">${r.profesor || r.remitente_email || ''}</div>
    </td>
    <td>${badge(r.estado)}</td>
    <td class="td-m">${hojas > 0 ? hojas : '—'}</td>
    <td>${accionHTML(r)}</td>
    <td style="display:flex;gap:4px;align-items:center">
      <button class="btn btn-detail" onclick="verDetalle(${r.id})"><i class="fa fa-eye fa-sm"></i></button>
      <button class="btn btn-danger-sm" onclick="abrirModalEliminar(${r.id})" title="Eliminar correo"><i class="fa fa-trash-can fa-sm"></i></button>
    </td>
  </tr>`;
}

function accionHTML(r) {
  const canBtn = `<button class="btn btn-danger-sm" style="margin-left:4px" onclick="abrirModalCancelar(${r.id},'copias')" title="Cancelar"><i class="fa fa-ban fa-xs"></i></button>`;
  if (r.estado === 'pendiente') return `<button class="btn btn-na" onclick="marcarRecibido(${r.id},this)"><i class="fa fa-check fa-sm"></i> Recibir</button>${canBtn}`;
  if (r.estado === 'recibido')  return `<button class="btn btn-nb" onclick="abrirModalImpreso(${r.id})"><i class="fa fa-print fa-sm"></i> Imprimir</button>${canBtn}`;
  if (r.estado === 'impreso')   return `<button class="btn btn-nc" onclick="abrirModalEntrega(${r.id})"><i class="fa fa-box-open fa-sm"></i> Entregar</button>${canBtn}`;
  return '<span class="td-m">—</span>';
}

function renderCards(rows) {
  const cont = document.getElementById('card-list');
  if (!rows.length) {
    cont.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-inbox"></i></div><p>Sin solicitudes en ${MESES[_mes]} ${_ano}</p></div>`;
    return;
  }
  cont.innerHTML = rows.map(r => `
    <div class="sol-card" id="card-${r.id}">
      <div class="sol-card-top">
        <div>
          <div class="sol-card-id" onclick="verDetalle(${r.id})" style="cursor:pointer">${r.id_solicitud||'Sin ID'}</div>
          <div class="sol-card-fecha">${fmtFecha(r.fecha_recepcion)}</div>
        </div>
        ${badge(r.estado)}
      </div>
      <div class="sol-card-asunto">${r.asunto||'—'}</div>
      <div class="sol-card-de">${r.profesor||r.remitente_email||'—'}</div>
      <div class="sol-card-footer">
        ${r.estado==='pendiente'?`<button class="btn btn-na" onclick="marcarRecibido(${r.id},this)"><i class="fa fa-check fa-sm"></i> Recibir</button>`:''}
        ${r.estado==='recibido' ?`<button class="btn btn-nb" onclick="abrirModalImpreso(${r.id})"><i class="fa fa-print fa-sm"></i> Imprimir</button>`:''}
        ${r.estado==='impreso'  ?`<button class="btn btn-nc" onclick="abrirModalEntrega(${r.id})"><i class="fa fa-box-open fa-sm"></i> Entregar</button>`:''}
        ${['pendiente','recibido','impreso'].includes(r.estado)?`<button class="btn btn-danger-sm" onclick="abrirModalCancelar(${r.id},'copias')"><i class="fa fa-ban fa-xs"></i></button>`:''}
        <button class="btn btn-danger" onclick="abrirModalEliminar(${r.id})" title="Eliminar correo"><i class="fa fa-trash-can fa-xs"></i></button>
        <button class="btn btn-detail" onclick="verDetalle(${r.id})"><i class="fa fa-eye fa-sm"></i> Detalle</button>
      </div>
    </div>`).join('');
}

// ── MARCAR RECIBIDO ───────────────────────────────────────────
async function marcarRecibido(id, btn) {
  if (!confirm('¿Confirmar como Recibida? Se enviará correo al solicitante.')) return;
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const { data: idRes } = await _sb.rpc('generar_id_solicitud');
    const { data: sol, error } = await _sb.from('bib_solicitudes')
      .update({ estado:'recibido', id_solicitud: idRes, notif_recibido_en: new Date().toISOString() })
      .eq('id', id).select('id_solicitud,asunto,email_destino,remitente_email,profesor').single();
    if (error) throw error;
    await _sb.from('bib_historial_estados').insert({ solicitud_id:id, estado_anterior:'pendiente', estado_nuevo:'recibido' });
    gasCall('enviarCorreo', { tipo:'recibido', destinatario: sol.email_destino||sol.remitente_email,
      idSolicitud: sol.id_solicitud, asunto: sol.asunto, profesor: sol.profesor }).catch(()=>{});
    toast(`Recibido · ID: ${idRes}`, 'success');
    await cargarSolicitudes();
    await actualizarBadges();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── MODAL IMPRESO ─────────────────────────────────────────────
async function abrirModalImpreso(id) {
  _idImpreso = id;
  _trabajosImpresion = [];
  _archivosDisponibles = [];
  _archivosAsignados = new Set();
  _asuntoSolicitud = '';
  resetSSDisplay();
  document.getElementById('mi-obs').value    = '';
  document.getElementById('mi-nombre').value = '';
  document.getElementById('mi-trab-section').style.display = 'none';
  document.getElementById('mi-trab-list').innerHTML = '';
  document.getElementById('mi-form-hdr').textContent = 'Trabajo de impresión';
  document.getElementById('btn-conf-impreso').disabled = true;
  document.getElementById('mi-id').textContent = 'Cargando...';
  document.getElementById('mi-asunto').textContent = '';
  document.getElementById('modal-impreso').classList.add('open');
  try {
    const { data, error } = await _sb.from('bib_solicitudes')
      .select('id_solicitud,asunto,bib_documentos(id,nombre_archivo)')
      .eq('id', id).single();
    if (error) throw error;
    _asuntoSolicitud = data.asunto || '';
    document.getElementById('mi-id').textContent = data.id_solicitud || 'Sin ID';
    document.getElementById('mi-asunto').textContent = _asuntoSolicitud;
    document.getElementById('mi-nombre').value = _asuntoSolicitud;
    _archivosDisponibles = data.bib_documentos || [];
    renderArchivosConConfig();
  } catch(e) {
    document.getElementById('mi-id').textContent = 'Error';
    toast('Error: ' + e.message, 'error');
  }
}

function renderArchivosConConfig() {
  const list    = document.getElementById('mi-arch-list');
  const counter = document.getElementById('mi-arch-counter');
  const elPend  = document.getElementById('mi-arch-pending');
  const elTotal = document.getElementById('mi-arch-total');

  if (!_archivosDisponibles.length) {
    list.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin archivos registrados en esta solicitud</span>';
    if (counter) counter.style.display = 'none';
    return;
  }

  const pendientes = _archivosDisponibles.filter(f => !_archivosAsignados.has(String(f.id))).length;
  if (counter) counter.style.display = '';
  if (elPend)  elPend.textContent  = pendientes;
  if (elTotal) elTotal.textContent = _archivosDisponibles.length;

  const todosInst   = _archivosDisponibles.every(f => _archivosAsignados.has(String(f.id)));
  const btnInst     = document.getElementById('btn-agregar-inst');
  const msgInst     = document.getElementById('msg-todos-inst');
  if (btnInst) { btnInst.disabled = todosInst; btnInst.style.opacity = todosInst ? '0.45' : ''; }
  if (msgInst) { msgInst.style.display = todosInst ? '' : 'none'; }

  list.innerHTML = _archivosDisponibles.map(f => {
    const fid      = String(f.id);
    const asignado = _archivosAsignados.has(fid);
    if (asignado) {
      return `<div class="file-item" id="fi-${fid}">
        <div class="file-check-row file-assigned">
          <i class="fa fa-file-lines fa-sm" style="color:var(--muted)"></i>
          <span>${escHtml(f.nombre_archivo)}</span>
          <span class="file-assigned-badge"><i class="fa fa-check fa-sm"></i> Asignado</span>
        </div>
      </div>`;
    }
    return `<div class="file-item" id="fi-${fid}">
      <label class="file-check-row" for="fchk-${fid}">
        <input type="checkbox" id="fchk-${fid}" value="${fid}" data-name="${escHtml(f.nombre_archivo)}"
               onchange="toggleArchivoCheck('${fid}')">
        <i class="fa fa-file-lines fa-sm" style="color:var(--muted)"></i>
        <span>${escHtml(f.nombre_archivo)}</span>
      </label>
      <div class="file-config" id="fconf-${fid}">
        <div class="fc-grid">
          <div>
            <div class="fc-label">Copias <span class="req">*</span></div>
            <input type="number" class="fc" id="fcopias-${fid}" min="1" value="1" style="margin:0">
          </div>
          <div>
            <div class="fc-label">Páginas <span class="req">*</span></div>
            <input type="number" class="fc" id="fpaginas-${fid}" min="1" value="1" style="margin:0">
          </div>
        </div>
        <div class="fc-radios">
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="ftipo-${fid}" value="Blanco y negro"><i class="fa fa-droplet-slash fa-sm"></i> B&N</label>
            <label class="fc-radio-lbl"><input type="radio" name="ftipo-${fid}" value="Color"><i class="fa fa-droplet fa-sm" style="color:#4c8eed"></i> Color</label>
          </div>
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="fmodo-${fid}" value="Una cara"><i class="fa fa-file fa-sm"></i> Una cara</label>
            <label class="fc-radio-lbl"><input type="radio" name="fmodo-${fid}" value="Doble cara"><i class="fa fa-copy fa-sm"></i> Doble cara</label>
          </div>
          <div class="fc-radio-group">
            <label class="fc-radio-lbl"><input type="radio" name="fhoja-${fid}" value="Carta"> Carta</label>
            <label class="fc-radio-lbl"><input type="radio" name="fhoja-${fid}" value="Oficio"> Oficio</label>
            <label class="fc-radio-lbl"><input type="radio" name="fhoja-${fid}" value="Doble Carta"> Doble Carta</label>
            <label class="fc-radio-lbl"><input type="radio" name="fhoja-${fid}" value="A4"> A4</label>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleArchivoCheck(fid) {
  const chk  = document.getElementById('fchk-' + fid);
  const conf = document.getElementById('fconf-' + fid);
  if (conf) conf.classList.toggle('open', chk.checked);
}

function agregarTrabajo() {
  const nombre = document.getElementById('mi-nombre').value.trim();
  const obs    = document.getElementById('mi-obs').value.trim();

  if (!nombre) { toast('Indica el nombre del trabajo', 'error'); document.getElementById('mi-nombre').focus(); return; }
  if (!_profSeleccionado) { toast('Selecciona el profesor destinatario', 'error'); toggleSSDropdown(); return; }

  const checks = [...document.querySelectorAll('#mi-arch-list input[type=checkbox]:checked')];
  if (!checks.length && _archivosDisponibles.length > 0) {
    toast('Selecciona al menos un archivo del correo', 'error'); return;
  }

  const archivos = [];
  for (const chk of checks) {
    const fid    = chk.value;
    const nom    = chk.dataset.name;
    const copias = parseInt((document.getElementById('fcopias-'  + fid) || {}).value) || 0;
    const pags   = parseInt((document.getElementById('fpaginas-' + fid) || {}).value) || 0;
    const tipo   = (document.querySelector(`input[name="ftipo-${fid}"]:checked`) || {}).value || '';
    const modo   = (document.querySelector(`input[name="fmodo-${fid}"]:checked`) || {}).value || '';
    const hoja   = (document.querySelector(`input[name="fhoja-${fid}"]:checked`) || {}).value || '';

    if (copias < 1) { toast(`"${nom}": copias debe ser ≥ 1`, 'error'); return; }
    if (pags   < 1) { toast(`"${nom}": páginas debe ser ≥ 1`, 'error'); return; }
    if (!tipo)      { toast(`"${nom}": selecciona B&N o Color`, 'error'); return; }
    if (!modo)      { toast(`"${nom}": selecciona Una o Doble cara`, 'error'); return; }
    if (!hoja)      { toast(`"${nom}": selecciona el tamaño de hoja`, 'error'); return; }

    const hojas = modo === 'Doble cara' ? copias * Math.ceil(pags / 2) : copias * pags;
    archivos.push({ nombre: nom, copias, paginas: pags, tipo_impresion: tipo, modo_impresion: modo, tamano_hoja: hoja, total_hojas: hojas });
    _archivosAsignados.add(fid);
  }

  const totalHojas = archivos.reduce((a, f) => a + f.total_hojas, 0);
  const nombreAnterior = nombre;
  _trabajosImpresion.push({ nombre, profesor: _profSeleccionado, archivos, total_hojas: totalHojas, observaciones: obs || null });

  renderTrabajosCards();
  document.getElementById('btn-conf-impreso').disabled = false;

  _profSeleccionado = null;
  resetSSDisplay();
  document.getElementById('mi-nombre').value = _asuntoSolicitud;
  document.getElementById('mi-obs').value = '';
  document.getElementById('mi-form-hdr').textContent = 'Agregar otro trabajo (opcional)';
  renderArchivosConConfig();
  toast(`Trabajo "${nombreAnterior}" agregado`, 'success');
}

function renderTrabajosCards() {
  const section = document.getElementById('mi-trab-section');
  const list    = document.getElementById('mi-trab-list');
  const count   = document.getElementById('mi-trab-count');
  section.style.display = _trabajosImpresion.length ? '' : 'none';
  count.textContent = _trabajosImpresion.length + ' trabajo' + (_trabajosImpresion.length !== 1 ? 's' : '');
  list.innerHTML = _trabajosImpresion.map((t, i) => {
    const archLines = (t.archivos || []).map(a =>
      `<div style="display:flex;align-items:baseline;gap:6px;margin-top:3px;font-size:12px">
        <i class="fa fa-file-lines fa-sm" style="color:var(--muted);flex-shrink:0"></i>
        <span>${escHtml(a.nombre)}</span>
        <span style="color:var(--muted);white-space:nowrap">${a.copias}c × ${a.paginas}p — ${escHtml(a.tipo_impresion)} — ${escHtml(a.modo_impresion)}${a.tamano_hoja ? ' — ' + escHtml(a.tamano_hoja) : ''}</span>
      </div>`
    ).join('');
    return `<div class="trab-card">
      <div class="trab-body">
        <div class="trab-name">${escHtml(t.nombre)}</div>
        <div class="trab-profs"><i class="fa fa-user-tie fa-sm"></i> ${escHtml(t.profesor)}</div>
        ${archLines || '<div style="font-size:12px;color:var(--muted)">Sin archivos asignados</div>'}
        <div class="trab-meta" style="margin-top:5px"><strong>${t.total_hojas} hoja${t.total_hojas !== 1 ? 's' : ''}</strong>${t.observaciones ? ` — <em>${escHtml(t.observaciones)}</em>` : ''}</div>
      </div>
      <button class="trab-del" onclick="eliminarTrabajo(${i})" title="Quitar"><i class="fa fa-trash-can fa-sm"></i></button>
    </div>`;
  }).join('');
}

function eliminarTrabajo(i) {
  const trabajo = _trabajosImpresion[i];
  (trabajo.archivos || []).forEach(a => {
    const f = _archivosDisponibles.find(d => d.nombre_archivo === a.nombre);
    if (f) _archivosAsignados.delete(String(f.id));
  });
  _trabajosImpresion.splice(i, 1);
  renderTrabajosCards();
  renderArchivosConConfig();
  if (!_trabajosImpresion.length) {
    document.getElementById('btn-conf-impreso').disabled = true;
    document.getElementById('mi-form-hdr').textContent = 'Trabajo de impresión';
  }
}

async function confirmarImpreso() {
  if (!_idImpreso || !_trabajosImpresion.length) return;
  const btn = document.getElementById('btn-conf-impreso');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const rows = _trabajosImpresion.map(t => ({ solicitud_id: _idImpreso, ...t }));
    const { error: errT } = await _sb.from('bib_trabajos_impresion').insert(rows);
    if (errT) throw errT;

    const ahora = new Date().toISOString();
    const { data: sol, error } = await _sb.from('bib_solicitudes')
      .update({ estado: 'impreso', notif_impreso_en: ahora })
      .eq('id', _idImpreso)
      .select('id_solicitud,asunto,email_destino,remitente_email,profesor,materia').single();
    if (error) throw error;

    await _sb.from('bib_historial_estados').insert({
      solicitud_id: _idImpreso, estado_anterior: 'recibido', estado_nuevo: 'impreso'
    });

    const totalHojas = _trabajosImpresion.reduce((a, t) => a + t.total_hojas, 0);
    gasCall('enviarCorreo', {
      tipo: 'impreso', destinatario: sol.email_destino || sol.remitente_email,
      idSolicitud: sol.id_solicitud, asunto: sol.asunto,
      profesor: sol.profesor, materia: sol.materia, numHojas: totalHojas
    }).catch(() => {});

    toast('Impresión registrada. Correo enviado.', 'success');
    cerrarModal('modal-impreso');
    await cargarSolicitudes();
    await actualizarBadges();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

// ── Single-select profesor ─────────────────────────────────────
function initSingleSelect() {
  document.addEventListener('click', e => {
    if (!e.target.closest('#ss-wrap')) closeSS();
  });
}

function toggleSSDropdown() {
  const panel = document.getElementById('ss-panel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none' && panel.style.display !== '';
  if (isOpen) { closeSS(); return; }
  panel.style.display = 'block';
  document.getElementById('ss-trigger').classList.add('open');
  const search = document.getElementById('ss-search');
  if (search) { search.value = ''; search.focus(); }
  renderSSOptions('');
}

function closeSS() {
  const panel = document.getElementById('ss-panel');
  if (panel) panel.style.display = 'none';
  const trigger = document.getElementById('ss-trigger');
  if (trigger) trigger.classList.remove('open');
}

function renderSSOptions(q) {
  const list    = document.getElementById('ss-list');
  if (!list) return;
  const matches = q ? PROFS_LISTA.filter(p => p.toLowerCase().includes(q.toLowerCase())) : PROFS_LISTA;
  const visible = matches.slice(0, 60);
  if (!visible.length) { list.innerHTML = '<div class="ss-empty">Sin resultados</div>'; return; }
  list.innerHTML = visible.map(p => {
    const on = _profSeleccionado === p;
    return `<div class="ss-opt${on?' on':''}" onclick="selectProfesor('${p.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">${escHtml(p)}</div>`;
  }).join('');
}

function selectProfesor(nombre) {
  _profSeleccionado = nombre;
  const display = document.getElementById('ss-display');
  if (display) { display.textContent = nombre; display.className = 'ss-selected'; }
  closeSS();
}

function resetSSDisplay() {
  _profSeleccionado = null;
  const display = document.getElementById('ss-display');
  if (display) { display.textContent = 'Buscar o seleccionar...'; display.className = 'ss-placeholder'; }
  closeSS();
}

// ── MODAL ENTREGA ─────────────────────────────────────────────
async function abrirModalEntrega(id) {
  _idEntrega = id;
  document.getElementById('me-recibe').value = '';
  document.getElementById('me-id').textContent = 'Cargando...';
  document.getElementById('me-asunto').textContent = '';
  document.getElementById('me-info').innerHTML = '';
  document.getElementById('modal-entrega').classList.add('open');
  try {
    const { data, error } = await _sb.from('bib_solicitudes')
      .select('id_solicitud,asunto,email_destino,remitente_email,remitente_nombre,profesor,materia,bib_documentos(num_hojas,tipo_impresion,forma_impresion)')
      .eq('id', id).single();
    if (error) throw error;
    document.getElementById('me-id').textContent = data.id_solicitud || 'Sin ID';
    document.getElementById('me-asunto').textContent = data.asunto || '';
    document.getElementById('me-recibe').value = data.remitente_nombre || '';
    const hojas = (data.bib_documentos||[]).reduce((a,d) => a+(d.num_hojas||0), 0);
    const tipo  = data.bib_documentos?.[0]?.tipo_impresion || '—';
    const forma = data.bib_documentos?.[0]?.forma_impresion || '—';
    document.getElementById('me-info').innerHTML =
      `<strong>${data.asunto||'Sin asunto'}</strong><br>
       Profesor: ${data.profesor||'—'} · Materia: ${data.materia||'—'}<br>
       ${hojas} hojas · ${tipo} · ${forma}`;
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function confirmarEntrega() {
  if (!_idEntrega) return;
  const recibe = document.getElementById('me-recibe').value.trim();
  if (!recibe) { toast('Indica quién recibe el material', 'error'); document.getElementById('me-recibe').focus(); return; }
  const btn = document.getElementById('btn-conf-entrega');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const ahora = new Date().toISOString();
    const { data: sol, error } = await _sb.from('bib_solicitudes')
      .update({ estado:'entregado', nombre_recibe: recibe, fecha_entrega: ahora, notif_entregado_en: ahora })
      .eq('id', _idEntrega)
      .select('id_solicitud,asunto,email_destino,remitente_email,profesor,materia,bib_documentos(num_hojas,tipo_impresion,forma_impresion)').single();
    if (error) throw error;
    await _sb.from('bib_historial_estados').insert({ solicitud_id:_idEntrega, estado_anterior:'impreso', estado_nuevo:'entregado' });
    const hojas = (sol.bib_documentos||[]).reduce((a,d) => a+(d.num_hojas||0), 0);
    gasCall('enviarCorreo', {
      tipo:'entregado', destinatario: sol.email_destino||sol.remitente_email,
      idSolicitud: sol.id_solicitud, asunto: sol.asunto, profesor: sol.profesor,
      materia: sol.materia, numHojas: hojas,
      tipoImpresion: sol.bib_documentos?.[0]?.tipo_impresion,
      forma: sol.bib_documentos?.[0]?.forma_impresion,
      nombreRecibe: recibe,
      fechaEntrega: new Date(ahora).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' })
    }).catch(()=>{});
    toast('Entrega registrada. Correo enviado.', 'success');
    cerrarModal('modal-entrega');
    await cargarSolicitudes();
    await actualizarBadges();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

// ── MODAL DETALLE (URLs firmadas) ─────────────────────────────
async function verDetalle(id) {
  document.getElementById('md-id').textContent = '';
  document.getElementById('md-body').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  document.getElementById('modal-detalle').classList.add('open');
  try {
    const { data, error } = await _sb.from('bib_solicitudes').select('*,bib_documentos(*)').eq('id', id).single();
    if (error) throw error;
    document.getElementById('md-id').textContent = data.id_solicitud || 'Sin ID';

    const docs = data.bib_documentos || [];
    const urls = await Promise.all(docs.map(async d => {
      if (!d.storage_path) return null;
      const { data: sd } = await _sb.storage.from('biblioteca-adjuntos').createSignedUrl(d.storage_path, 3600, { download: false });
      return sd?.signedUrl || null;
    }));

    const validUrls = urls.map((u,i) => u ? { url: u, nombre: docs[i].nombre_archivo } : null).filter(Boolean);
    const adjHTML = docs.length > 0 ? `
      ${validUrls.length > 1 ? `<button class="adj-btn view" style="margin-bottom:10px;padding:7px 14px;font-size:12px" onclick="descargarTodos(${JSON.stringify(validUrls).replace(/"/g,'&quot;')})">⬇ Descargar todos (${validUrls.length})</button>` : ''}
      <div class="adj-list">${docs.map((d,i) => {
        const url = urls[i];
        const ext = (d.nombre_archivo||'').split('.').pop().toLowerCase();
        const ico = ext==='pdf'?'<i class="fa fa-file-pdf" style="color:#f85149"></i>':['doc','docx'].includes(ext)?'<i class="fa fa-file-word" style="color:#4c8eed"></i>':['jpg','jpeg','png','gif','webp'].includes(ext)?'<i class="fa fa-file-image" style="color:#a371f7"></i>':'<i class="fa fa-file" style="color:var(--muted)"></i>';
        const tam = d.tamano_bytes ? (d.tamano_bytes/1024).toFixed(0)+' KB' : '';
        return `<div class="adj-item">
          <span class="adj-ico">${ico}</span>
          <div style="flex:1;min-width:0">
            <div class="adj-name">${d.nombre_archivo}</div>
            <div class="adj-meta">${[tam,d.tipo_impresion,d.forma_impresion,d.num_hojas?d.num_hojas+' hojas':''].filter(Boolean).join(' · ')}</div>
          </div>
          <div class="adj-actions">
            ${url ? `<button class="adj-btn view" onclick="verArchivo('${url}','${d.tipo_mime||'application/pdf'}')"><i class="fa fa-eye fa-sm"></i></button><a class="adj-btn dl" href="${url + '&download=' + encodeURIComponent(d.nombre_archivo)}" target="_blank"><i class="fa fa-download fa-sm"></i></a>`
                  : '<span style="font-size:11px;color:var(--dim)">Sin archivo</span>'}
          </div>
        </div>`;
      }).join('')}</div>` : '<p style="font-size:12px;color:var(--dim)">Sin adjuntos</p>';

    document.getElementById('md-body').innerHTML = `
      <div class="dr"><span class="dlbl">Asunto</span><span class="dval">${data.asunto||'—'}</span></div>
      <div class="dr"><span class="dlbl">Remitente</span><span class="dval">${data.remitente_email||'—'}</span></div>
      <div class="dr"><span class="dlbl">Notificar a</span><span class="dval">${data.email_destino||'—'}</span></div>
      <div class="dr"><span class="dlbl">Estado</span><span class="dval">${badge(data.estado)}</span></div>
      <div class="dr"><span class="dlbl">Fecha recepción</span><span class="dval">${fmtFecha(data.fecha_recepcion)}</span></div>
      <hr class="msep">
      <div class="dr"><span class="dlbl">Profesor</span><span class="dval">${data.profesor||'—'}</span></div>
      <div class="dr"><span class="dlbl">Área</span><span class="dval">${data.area||'—'}</span></div>
      <div class="dr"><span class="dlbl">Materia</span><span class="dval">${data.materia||'—'}</span></div>
      ${data.observaciones?`<div class="dr"><span class="dlbl">Observaciones</span><span class="dval">${data.observaciones}</span></div>`:''}
      ${data.estado==='entregado'?`
      <hr class="msep">
      <div class="dr"><span class="dlbl">Entregado a</span><span class="dval">${data.nombre_recibe||'—'}</span></div>
      <div class="dr"><span class="dlbl">Fecha entrega</span><span class="dval">${fmtFecha(data.fecha_entrega)}</span></div>`:''}
      <hr class="msep">
      <div class="msec-hdr" style="margin-bottom:10px">Documentos adjuntos</div>
      ${adjHTML}`;
  } catch(e) {
    document.getElementById('md-body').innerHTML = `<p style="color:var(--red);padding:12px">Error: ${e.message}</p>`;
  }
}

// ── DESCARGA MÚLTIPLE ────────────────────────────────────────
function descargarTodos(archivos) {
  archivos.forEach((a, i) => {
    setTimeout(() => {
      const link = document.createElement('a');
      link.href     = a.url;
      link.download = a.nombre;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, i * 800); // 800ms entre cada descarga para que el browser no las bloquee
  });
  toast(`Descargando ${archivos.length} archivos…`, 'info');
}

// ── FILTROS ───────────────────────────────────────────────────
function setFiltro(estado, btn) {
  _filtro = estado;
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cargarSolicitudes();
}
function buscarDebounce() { clearTimeout(_buscarTimer); _buscarTimer = setTimeout(cargarSolicitudes, 380); }

// ── SEGMENTED CONTROL ─────────────────────────────────────────
function setSeg(grupoId, btn, valor) {
  document.querySelectorAll('#'+grupoId+' .seg-opt').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  document.getElementById(grupoId==='seg-tipo'?'mi-tipo':'mi-forma').value = valor;
}
function limpiarSeg(grupoId) {
  document.querySelectorAll('#'+grupoId+' .seg-opt').forEach(b => b.classList.remove('sel'));
}
