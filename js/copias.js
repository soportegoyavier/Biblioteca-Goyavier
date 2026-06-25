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
  btn.classList.add('loading'); btn.disabled = true;
  await abrirPickerDestinatarios(
    async (destinatarios) => {
      try {
        const { data: idRes } = await _sb.rpc('generar_id_solicitud');
        const { data: sol, error } = await _sb.from('bib_solicitudes')
          .update({ estado:'recibido', id_solicitud: idRes, notif_recibido_en: new Date().toISOString(), destinatarios })
          .eq('id', id).select('id_solicitud,asunto,profesor').single();
        if (error) throw error;
        await _sb.from('bib_historial_estados').insert({ solicitud_id:id, estado_anterior:'pendiente', estado_nuevo:'recibido' });
        if (destinatarios.length) {
          for (const dest of destinatarios) {
            const { data: numP } = await _sb.rpc('get_num_solicitud_para_email', { p_email: dest.email, p_solicitud_id: id });
            gasCall('enviarCorreo', { tipo:'recibido', destinatario: dest.email,
              numPersonal: numP || 1, idSolicitud: sol.id_solicitud,
              asunto: sol.asunto, profesor: sol.profesor }).catch(()=>{});
          }
        }
        toast(`Recibido · ID: ${idRes}`, 'success');
        await cargarSolicitudes();
        await actualizarBadges();
      } catch(e) {
        toast('Error: ' + e.message, 'error');
      } finally {
        btn.classList.remove('loading'); btn.disabled = false;
      }
    },
    () => { btn.classList.remove('loading'); btn.disabled = false; }
  );
}

// ── MODAL IMPRESO ─────────────────────────────────────────────
async function abrirModalImpreso(id) {
  _idImpreso            = id;
  _archivosDisponibles  = [];
  _impresoDestinatarios = [];
  _impresoExpanded      = new Set();
  _asuntoSolicitud      = '';

  document.getElementById('mi-nombre').value           = '';
  document.getElementById('btn-conf-impreso').disabled  = true;
  document.getElementById('mi-id').textContent          = 'Cargando...';
  document.getElementById('mi-asunto').textContent      = '';
  document.getElementById('modal-impreso').classList.add('open');
  renderImpresoDestinatarios();
  try {
    const { data, error } = await _sb.from('bib_solicitudes')
      .select('id_solicitud,asunto,destinatarios,bib_documentos(id,nombre_archivo)')
      .eq('id', id).single();
    if (error) throw error;
    _asuntoSolicitud = data.asunto || '';
    _impresoDestinatarios = (data.destinatarios || []).map(d => ({
      nombre:   typeof d === 'string' ? d : (d.nombre || d.email),
      email:    typeof d === 'string' ? d : d.email,
      archivos: []
    }));
    _archivosDisponibles = data.bib_documentos || [];
    document.getElementById('mi-id').textContent     = data.id_solicitud || 'Sin ID';
    document.getElementById('mi-asunto').textContent = _asuntoSolicitud;
    document.getElementById('mi-nombre').value       = _asuntoSolicitud;
    renderImpresoDestinatarios();
    _updateConfirmarBtn();
  } catch(e) {
    document.getElementById('mi-id').textContent = 'Error';
    toast('Error: ' + e.message, 'error');
  }
}

// ── RENDER POR COLABORADOR ────────────────────────────────────
function renderImpresoDestinatarios() {
  const list = document.getElementById('mi-dest-list');
  if (!list) return;
  if (!_impresoDestinatarios.length) {
    list.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:4px 0">Sin destinatarios — agrega un colaborador</div>';
    _updateConfirmarBtn(); return;
  }
  const asignadosGlobal = new Set(
    _impresoDestinatarios.flatMap(d => (d.archivos || []).map(a => a.doc_id))
  );
  list.innerHTML = _impresoDestinatarios.map((d, i) => _renderColabCard(d, i, asignadosGlobal)).join('');
  _updateConfirmarBtn();
}

function _renderColabCard(d, idx, asignadosGlobal) {
  const email      = d.email;
  const nombre     = d.nombre || d.email;
  const arch       = d.archivos || [];
  const expanded   = _impresoExpanded.has(email);
  const badge      = arch.length
    ? `<span style="font-size:11px;color:var(--green);font-weight:600">${arch.length} archivo${arch.length>1?'s':''}</span>`
    : `<span style="font-size:11px;color:var(--muted)">Sin archivos</span>`;
  const disponibles = _archivosDisponibles.filter(f =>
    !asignadosGlobal.has(f.id) || arch.some(a => a.doc_id === f.id)
  );
  return `<div class="dest-colab-card">
    <div class="dest-colab-hdr" onclick="toggleImpresoExpand('${email.replace(/'/g,"\\'")}')">
      <div class="picker-sel-avatar"><i class="fa fa-user"></i></div>
      <div style="flex:1;min-width:0;margin-left:10px">
        <div class="picker-nombre">${escHtml(nombre)}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px">
          <span class="picker-sel-email" style="display:inline">${escHtml(email)}</span>${badge}
        </div>
      </div>
      <i class="fa fa-chevron-${expanded?'up':'down'} fa-sm" style="color:var(--muted);margin:0 8px;flex-shrink:0"></i>
      <button class="btn-cls" onclick="event.stopPropagation();quitarImpresoDestinatario('${email.replace(/'/g,"\\'")}')"><i class="fa fa-xmark fa-xs"></i></button>
    </div>
    ${expanded ? `<div class="dest-colab-body">
      ${!disponibles.length
        ? '<div style="padding:12px 14px;font-size:13px;color:var(--muted)">Todos los archivos ya están asignados a otro colaborador</div>'
        : disponibles.map(f => _renderArchivoRow(idx, f, arch)).join('')}
    </div>` : ''}
  </div>`;
}

function _renderArchivoRow(colabIdx, f, archivosAsig) {
  const asig = archivosAsig.find(a => a.doc_id === f.id);
  const ok   = !!asig;
  const cfg  = asig || { copias:1, paginas:1, tipo_impresion:'Blanco y negro', modo_impresion:'Una cara', tamano_hoja:'Carta' };
  const sel  = (name, val, opt) => opt.map(o => `<option${cfg[name]===o?' selected':''}>${o}</option>`).join('');
  return `<div class="arch-row${ok?' arch-row-on':''}">
    <label class="arch-check-lbl" onclick="event.stopPropagation()">
      <input type="checkbox" ${ok?'checked':''}
        onchange="toggleArchivoColab(${colabIdx},${f.id},'${f.nombre_archivo.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}',this.checked)">
      <i class="fa fa-file-lines fa-sm" style="color:var(--muted);flex-shrink:0"></i>
      <span style="flex:1;font-size:13px;word-break:break-all">${escHtml(f.nombre_archivo)}</span>
    </label>
    ${ok ? `<div class="arch-cfg">
      <div class="fc-grid" style="margin-bottom:8px">
        <div><div class="fc-label">Copias <span class="req">*</span></div>
          <input type="number" class="fc" min="1" value="${cfg.copias}" style="margin:0"
            oninput="updateArchivoConfig(${colabIdx},${f.id},'copias',+this.value||1)"></div>
        <div><div class="fc-label">Páginas <span class="req">*</span></div>
          <input type="number" class="fc" min="1" value="${cfg.paginas}" style="margin:0"
            oninput="updateArchivoConfig(${colabIdx},${f.id},'paginas',+this.value||1)"></div>
      </div>
      <div class="fc-radios">
        <div class="fc-radio-group">
          <label class="fc-radio-lbl"><input type="radio" name="ftipo-${colabIdx}-${f.id}" value="Blanco y negro" ${cfg.tipo_impresion==='Blanco y negro'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'tipo_impresion',this.value)"><i class="fa fa-droplet-slash fa-sm"></i> B&N</label>
          <label class="fc-radio-lbl"><input type="radio" name="ftipo-${colabIdx}-${f.id}" value="Color" ${cfg.tipo_impresion==='Color'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'tipo_impresion',this.value)"><i class="fa fa-droplet fa-sm" style="color:#4c8eed"></i> Color</label>
        </div>
        <div class="fc-radio-group">
          <label class="fc-radio-lbl"><input type="radio" name="fmodo-${colabIdx}-${f.id}" value="Una cara" ${cfg.modo_impresion==='Una cara'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'modo_impresion',this.value)"><i class="fa fa-file fa-sm"></i> Una cara</label>
          <label class="fc-radio-lbl"><input type="radio" name="fmodo-${colabIdx}-${f.id}" value="Doble cara" ${cfg.modo_impresion==='Doble cara'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'modo_impresion',this.value)"><i class="fa fa-copy fa-sm"></i> Doble cara</label>
        </div>
        <div class="fc-radio-group">
          <label class="fc-radio-lbl"><input type="radio" name="fhoja-${colabIdx}-${f.id}" value="Carta" ${cfg.tamano_hoja==='Carta'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'tamano_hoja',this.value)"> Carta</label>
          <label class="fc-radio-lbl"><input type="radio" name="fhoja-${colabIdx}-${f.id}" value="Oficio" ${cfg.tamano_hoja==='Oficio'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'tamano_hoja',this.value)"> Oficio</label>
          <label class="fc-radio-lbl"><input type="radio" name="fhoja-${colabIdx}-${f.id}" value="Doble Carta" ${cfg.tamano_hoja==='Doble Carta'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'tamano_hoja',this.value)"> Doble Carta</label>
          <label class="fc-radio-lbl"><input type="radio" name="fhoja-${colabIdx}-${f.id}" value="A4" ${cfg.tamano_hoja==='A4'?'checked':''} onchange="updateArchivoConfig(${colabIdx},${f.id},'tamano_hoja',this.value)"> A4</label>
        </div>
      </div>
    </div>` : ''}
  </div>`;
}

function toggleImpresoExpand(email) {
  _impresoExpanded.has(email) ? _impresoExpanded.delete(email) : _impresoExpanded.add(email);
  renderImpresoDestinatarios();
}

function toggleArchivoColab(colabIdx, docId, nombre, checked) {
  const d = _impresoDestinatarios[colabIdx];
  if (!d) return;
  if (checked) {
    if (!d.archivos.find(a => a.doc_id === docId))
      d.archivos.push({ doc_id: docId, nombre, copias:1, paginas:1,
        tipo_impresion:'Blanco y negro', modo_impresion:'Una cara', tamano_hoja:'Carta', total_hojas:1 });
  } else {
    d.archivos = d.archivos.filter(a => a.doc_id !== docId);
  }
  _impresoExpanded.add(d.email);
  renderImpresoDestinatarios();
}

function updateArchivoConfig(colabIdx, docId, field, value) {
  const d = _impresoDestinatarios[colabIdx];
  if (!d) return;
  const a = d.archivos.find(a => a.doc_id === docId);
  if (!a) return;
  a[field] = value;
  a.total_hojas = a.modo_impresion === 'Doble cara'
    ? a.copias * Math.ceil(a.paginas / 2)
    : a.copias * a.paginas;
  _updateConfirmarBtn();
}

function quitarImpresoDestinatario(email) {
  _impresoDestinatarios = _impresoDestinatarios.filter(d => d.email !== email);
  _impresoExpanded.delete(email);
  renderImpresoDestinatarios();
}

function abrirPickerParaImpreso() {
  abrirPickerDestinatarios(
    (destinatarios) => {
      const existing = new Map(_impresoDestinatarios.map(d => [d.email, d]));
      _impresoDestinatarios = destinatarios.map(d => ({
        nombre:   d.nombre || d.email,
        email:    d.email,
        archivos: existing.get(d.email)?.archivos || []
      }));
      renderImpresoDestinatarios();
    },
    null,
    _impresoDestinatarios.map(d => ({ nombre: d.nombre, email: d.email }))
  );
}

function _updateConfirmarBtn() {
  const btn = document.getElementById('btn-conf-impreso');
  if (!btn) return;
  const hasName  = (document.getElementById('mi-nombre')?.value || '').trim().length > 0;
  const hasFiles = _impresoDestinatarios.some(d => (d.archivos || []).length > 0);
  btn.disabled = !(hasName && hasFiles);
}

async function confirmarImpreso() {
  const nombre = (document.getElementById('mi-nombre')?.value || '').trim();
  if (!nombre) { toast('Indica el nombre del trabajo', 'error'); document.getElementById('mi-nombre').focus(); return; }
  const colabsConArch = _impresoDestinatarios.filter(d => (d.archivos || []).length > 0);
  if (!colabsConArch.length) { toast('Asigna archivos a al menos un colaborador', 'error'); return; }

  const btn = document.getElementById('btn-conf-impreso');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const calcHojas = a => a.modo_impresion === 'Doble cara'
      ? a.copias * Math.ceil(a.paginas / 2)
      : a.copias * a.paginas;

    const rows = colabsConArch.map(d => {
      const archivos = d.archivos.map(a => ({
        doc_id: a.doc_id, nombre: a.nombre, copias: a.copias, paginas: a.paginas,
        tipo_impresion: a.tipo_impresion, modo_impresion: a.modo_impresion,
        tamano_hoja: a.tamano_hoja, total_hojas: calcHojas(a)
      }));
      return { solicitud_id: _idImpreso, nombre, profesor: d.nombre,
        archivos, total_hojas: archivos.reduce((s, a) => s + a.total_hojas, 0), observaciones: null };
    });

    const { error: errT } = await _sb.from('bib_trabajos_impresion').insert(rows);
    if (errT) throw errT;

    const docUpdates = colabsConArch.flatMap(d =>
      d.archivos.map(a => _sb.from('bib_documentos').update({
        num_hojas: calcHojas(a), tipo_impresion: a.tipo_impresion, forma_impresion: a.modo_impresion
      }).eq('id', a.doc_id))
    );
    if (docUpdates.length) await Promise.all(docUpdates);

    const ahora       = new Date().toISOString();
    const destGuardar = _impresoDestinatarios.map(d => ({ nombre: d.nombre, email: d.email }));

    const { data: sol, error } = await _sb.from('bib_solicitudes')
      .update({ estado:'impreso', notif_impreso_en: ahora,
        profesor: colabsConArch[0]?.nombre || null, area: null, destinatarios: destGuardar })
      .eq('id', _idImpreso)
      .select('id_solicitud,asunto,profesor,materia').single();
    if (error) throw error;

    await _sb.from('bib_historial_estados').insert({
      solicitud_id: _idImpreso, estado_anterior:'recibido', estado_nuevo:'impreso'
    });

    for (let i = 0; i < colabsConArch.length; i++) {
      const d = colabsConArch[i];
      const r = rows[i];
      const { data: numP } = await _sb.rpc('get_num_solicitud_para_email',
        { p_email: d.email, p_solicitud_id: _idImpreso });
      gasCall('enviarCorreo', { tipo:'impreso', destinatario: d.email,
        numPersonal: numP||1, idSolicitud: sol.id_solicitud,
        asunto: sol.asunto, profesor: d.nombre,
        materia: sol.materia, numHojas: r.total_hojas }).catch(()=>{});
    }

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
  const list = document.getElementById('ss-list');
  if (!list) return;
  const lista = Object.keys(_profesoresData).length ? Object.keys(_profesoresData) : PROFS_LISTA;
  const matches = q ? lista.filter(p => p.toLowerCase().includes(q.toLowerCase())) : lista;
  const visible = matches.slice(0, 60);
  if (!visible.length) { list.innerHTML = '<div class="ss-empty">Sin resultados</div>'; return; }
  list.innerHTML = visible.map(p => {
    const on  = _profSeleccionado === p;
    const pd  = _profesoresData[p] || {};
    const sub = pd.area || '';
    return `<div class="ss-opt${on?' on':''}" onclick="selectProfesor('${p.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
      <div>${escHtml(p)}</div>
      ${sub ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${escHtml(sub)}</div>` : ''}
    </div>`;
  }).join('');
}

function selectProfesor(nombre) {
  _profSeleccionado = nombre;
  const pd = _profesoresData[nombre] || {};
  _profArea = pd.area || null;
  const display = document.getElementById('ss-display');
  if (display) { display.textContent = nombre; display.className = 'ss-selected'; }
  closeSS();
}

function resetSSDisplay() {
  _profSeleccionado = null;
  _profArea         = null;
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
  const sugerEl = document.getElementById('me-sugeridos');
  if (sugerEl) sugerEl.innerHTML = '';
  document.getElementById('modal-entrega').classList.add('open');
  try {
    const { data, error } = await _sb.from('bib_solicitudes')
      .select('id_solicitud,asunto,email_destino,remitente_email,remitente_nombre,profesor,materia,destinatarios,bib_documentos(num_hojas,tipo_impresion,forma_impresion)')
      .eq('id', id).single();
    if (error) throw error;
    document.getElementById('me-id').textContent = data.id_solicitud || 'Sin ID';
    document.getElementById('me-asunto').textContent = data.asunto || '';

    // Pre-llenar con todos los destinatarios de impresión (no el remitente)
    const dests = Array.isArray(data.destinatarios) && data.destinatarios.length ? data.destinatarios : [];
    const destNombres = dests.map(d => typeof d === 'string' ? d : (d.nombre || d.email));
    _entregaSelNames = new Set(destNombres);
    document.getElementById('me-recibe').value = destNombres.join(', ');

    // Chips multi-selección para cada destinatario
    if (sugerEl && destNombres.length) {
      sugerEl.innerHTML = destNombres.map(nom =>
        `<button type="button" class="chip-suger chip-suger-on"
          onclick="toggleEntregaChip('${nom.replace(/'/g,"\\'")}',this)">${escHtml(nom)}</button>`
      ).join('');
    }

    const hojas = (data.bib_documentos||[]).reduce((a,d) => a+(d.num_hojas||0), 0);
    const tipo  = data.bib_documentos?.[0]?.tipo_impresion || '—';
    const forma = data.bib_documentos?.[0]?.forma_impresion || '—';
    document.getElementById('me-info').innerHTML =
      `<strong>${data.asunto||'Sin asunto'}</strong><br>
       Profesor: ${data.profesor||'—'} · Materia: ${data.materia||'—'}<br>
       ${hojas} hojas · ${tipo} · ${forma}`;
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

function toggleEntregaChip(nom, btn) {
  if (_entregaSelNames.has(nom)) {
    _entregaSelNames.delete(nom);
    btn.classList.remove('chip-suger-on');
  } else {
    _entregaSelNames.add(nom);
    btn.classList.add('chip-suger-on');
  }
  document.getElementById('me-recibe').value = Array.from(_entregaSelNames).join(', ');
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
      .select('id_solicitud,asunto,profesor,materia,destinatarios,bib_documentos(num_hojas,tipo_impresion,forma_impresion)').single();
    if (error) throw error;
    await _sb.from('bib_historial_estados').insert({ solicitud_id:_idEntrega, estado_anterior:'impreso', estado_nuevo:'entregado' });

    const { data: trabajos } = await _sb.from('bib_trabajos_impresion')
      .select('profesor,archivos,total_hojas').eq('solicitud_id', _idEntrega);
    const trabajosMap = new Map((trabajos||[]).map(t => [t.profesor, t]));

    const destinatarios = sol.destinatarios || [];
    const fechaFmt = new Date(ahora).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' });
    if (destinatarios.length) {
      for (const dest of destinatarios) {
        const email  = typeof dest === 'string' ? dest : dest.email;
        const nombre = typeof dest === 'string' ? dest : (dest.nombre || dest.email);
        const trab   = trabajosMap.get(nombre);
        const hojasDest = trab?.total_hojas ?? 0;
        const primerArch = Array.isArray(trab?.archivos) ? trab.archivos[0] : null;
        const { data: numP } = await _sb.rpc('get_num_solicitud_para_email', { p_email: email, p_solicitud_id: _idEntrega });
        gasCall('enviarCorreo', {
          tipo:'entregado', destinatario: email,
          numPersonal: numP || 1, idSolicitud: sol.id_solicitud,
          asunto: sol.asunto, profesor: nombre,
          materia: sol.materia, numHojas: hojasDest,
          tipoImpresion: primerArch?.tipo_impresion,
          forma: primerArch?.modo_impresion,
          nombreRecibe: nombre,
          fechaEntrega: fechaFmt
        }).catch(()=>{});
      }
    }
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
    const [{ data, error }, { data: trabajos }] = await Promise.all([
      _sb.from('bib_solicitudes').select('*,bib_documentos(*)').eq('id', id).single(),
      _sb.from('bib_trabajos_impresion').select('profesor,archivos,total_hojas').eq('solicitud_id', id)
    ]);
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
            ${url ? `<button class="adj-btn view" data-url="${escHtml(url)}" data-mime="${escHtml(d.tipo_mime||'application/pdf')}" onclick="verArchivo(this.dataset.url,this.dataset.mime)"><i class="fa fa-eye fa-sm"></i></button><a class="adj-btn dl" href="${escHtml(url)}&download=${encodeURIComponent(d.nombre_archivo||'archivo')}" target="_blank"><i class="fa fa-download fa-sm"></i></a>`
                  : d.drive_link ? `<a class="adj-btn view" href="${escHtml(d.drive_link)}" target="_blank" title="Abrir en Google Drive"><i class="fa fa-brands fa-google-drive fa-sm"></i></a>`
                  : '<span style="font-size:11px;color:var(--dim)">Sin archivo</span>'}
          </div>
        </div>`;
      }).join('')}</div>` : '<p style="font-size:12px;color:var(--dim)">Sin adjuntos</p>';

    // Destinatarios como texto
    const dests = Array.isArray(data.destinatarios) && data.destinatarios.length
      ? data.destinatarios.map(d => (typeof d === 'string' ? d : (d.nombre || d.email))).join(', ')
      : (data.email_destino || '—');

    // Sección trabajos de impresión
    let trabajosHTML = '';
    if (trabajos && trabajos.length && ['impreso','entregado'].includes(data.estado)) {
      const totalGeneral = trabajos.reduce((s, t) => s + (t.total_hojas || 0), 0);
      const cards = trabajos.map(t => {
        const arch = Array.isArray(t.archivos) ? t.archivos : [];
        const archLines = arch.map(a =>
          `<div style="margin-top:5px;padding-left:8px">
            <div style="display:flex;gap:6px;align-items:center;font-size:12px">
              <i class="fa fa-file-lines fa-sm" style="color:var(--muted);flex-shrink:0"></i>
              <span style="flex:1;font-weight:500">${escHtml(a.nombre||'')}</span>
            </div>
            <div style="font-size:11px;color:var(--muted);padding-left:18px;margin-top:2px">
              ${a.copias||0} copia${(a.copias||0)!==1?'s':''} &nbsp;·&nbsp;
              ${a.paginas||0} página${(a.paginas||0)!==1?'s':''} &nbsp;·&nbsp;
              ${escHtml(a.tipo_impresion||'—')} &nbsp;·&nbsp;
              ${escHtml(a.modo_impresion||'')} &nbsp;·&nbsp;
              ${escHtml(a.tamano_hoja||'—')} &nbsp;·&nbsp;
              <strong style="color:var(--text)">${a.total_hojas||0} hoja${(a.total_hojas||0)!==1?'s':''}</strong>
            </div>
          </div>`
        ).join('');
        return `<div style="border:1px solid var(--border2);border-radius:7px;padding:10px 12px;background:var(--s2);margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-weight:600;font-size:13px"><i class="fa fa-user fa-sm" style="color:var(--muted);margin-right:5px"></i>${escHtml(t.profesor||'—')}</div>
            <span style="font-size:12px;font-weight:600;color:var(--blue)">${t.total_hojas||0} hoja${t.total_hojas!==1?'s':''}</span>
          </div>
          ${archLines}
        </div>`;
      }).join('');
      trabajosHTML = `<hr class="msep">
      <div class="msec-hdr" style="margin-bottom:10px">Trabajos de impresión</div>
      ${cards}
      <div style="text-align:right;font-size:13px;font-weight:600;color:var(--text);margin-top:4px">Total: ${totalGeneral} hoja${totalGeneral!==1?'s':''}</div>`;
    }

    document.getElementById('md-body').innerHTML = `
      <div class="dr"><span class="dlbl">Asunto</span><span class="dval">${data.asunto||'—'}</span></div>
      <div class="dr"><span class="dlbl">Remitente</span><span class="dval">${data.remitente_email||'—'}</span></div>
      <div class="dr"><span class="dlbl">Notificar a</span><span class="dval">${dests}</span></div>
      <div class="dr"><span class="dlbl">Estado</span><span class="dval">${badge(data.estado)}</span></div>
      <div class="dr"><span class="dlbl">Fecha recepción</span><span class="dval">${fmtFecha(data.fecha_recepcion)}</span></div>
      <hr class="msep">
      <div class="dr"><span class="dlbl">Área</span><span class="dval">${data.area||'—'}</span></div>
      ${data.observaciones?`<div class="dr"><span class="dlbl">Observaciones</span><span class="dval">${data.observaciones}</span></div>`:''}
      ${data.estado==='entregado'?`
      <hr class="msep">
      <div class="dr"><span class="dlbl">Entregado a</span><span class="dval">${data.nombre_recibe||'—'}</span></div>
      <div class="dr"><span class="dlbl">Fecha entrega</span><span class="dval">${fmtFecha(data.fecha_entrega)}</span></div>`:''}
      ${trabajosHTML}
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
