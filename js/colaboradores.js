// ── COLABORADORES — Admin CRUD + Picker de destinatarios ──────

// ── ESTADO LOCAL ─────────────────────────────────────────────
let _colabs         = [];
let _editColabId    = null;
let _pickerColabs    = [];        // caché para el picker
let _pickerSel       = new Set(); // emails seleccionados
let _pickerConfirm   = null;      // callback onConfirm(destinatarios[], tipoCopia)
let _pickerCancel    = null;      // callback onCancel()
let _pickerExtraOpen = false;     // sección "agregar otro" expandida
let _pickerTipoCopia = 'General'; // tipo seleccionado en el picker
let _pickerTiposList = [];        // tipos cargados de bib_tipos_copia
let _pickerShowTipo  = false;     // si mostrar selector de tipo

// ── ADMIN: CARGAR Y RENDERIZAR ────────────────────────────────
async function cargarColaboradores() {
  const cont = document.getElementById('colab-content');
  if (!cont) return;
  cont.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const { data, error } = await _sb
      .from('bib_colaboradores')
      .select('id,nombre,cargo,area,activo,bib_colaboradores_correos(id,email,principal)')
      .order('area').order('nombre');
    if (error) throw error;
    _colabs = data || [];
    renderColabs();
  } catch(e) {
    cont.innerHTML = `<div class="empty"><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

function renderColabs() {
  const cont   = document.getElementById('colab-content');
  const q      = (document.getElementById('colab-buscar')?.value || '').trim().toLowerCase();
  const filtro = document.getElementById('colab-filtro')?.value || '';

  let lista = _colabs;
  if (filtro === 'activos')   lista = lista.filter(c => c.activo);
  if (filtro === 'inactivos') lista = lista.filter(c => !c.activo);
  if (q) lista = lista.filter(c =>
    c.nombre.toLowerCase().includes(q) ||
    (c.cargo||'').toLowerCase().includes(q) ||
    (c.area||'').toLowerCase().includes(q) ||
    (c.bib_colaboradores_correos||[]).some(e => e.email.toLowerCase().includes(q))
  );

  if (!lista.length) {
    cont.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-users-slash"></i></div><p>Sin resultados</p></div>';
    return;
  }

  const areas = {};
  lista.forEach(c => { const a = c.area||'Sin área'; if (!areas[a]) areas[a]=[]; areas[a].push(c); });

  cont.innerHTML = `<div class="colab-grid">${
    Object.entries(areas).map(([area, cs]) => `
      <div class="colab-area-group">
        <div class="colab-area-hdr"><i class="fa fa-layer-group fa-sm"></i> ${escHtml(area)}</div>
        ${cs.map(colabCard).join('')}
      </div>`).join('')
  }</div>`;
}

function colabCard(c) {
  const emails = (c.bib_colaboradores_correos||[]).map(e => e.email);
  return `<div class="colab-card${!c.activo?' colab-off':''}">
    <div class="colab-info">
      <div class="colab-nombre">${escHtml(c.nombre)}${!c.activo?'<span class="colab-badge-off">Inactivo</span>':''}</div>
      <div class="colab-cargo">${escHtml(c.cargo||'—')}</div>
      ${emails.length ? `<div class="colab-chips">${emails.map(e=>`<span class="colab-email-chip">${escHtml(e)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="colab-acciones">
      <button class="btn btn-detail" onclick="abrirEditColaborador(${c.id})" title="Editar"><i class="fa fa-pencil fa-sm"></i></button>
      <button class="btn ${c.activo?'btn-danger-sm':'btn-na'}" onclick="toggleActivoColab(${c.id},${!c.activo})" title="${c.activo?'Desactivar':'Activar'}">
        <i class="fa fa-power-off fa-sm"></i>
      </button>
    </div>
  </div>`;
}

function colabFiltrarDebounce() {
  clearTimeout(window._colabFiltTimer);
  window._colabFiltTimer = setTimeout(renderColabs, 280);
}

async function toggleActivoColab(id, activo) {
  const { error } = await _sb.from('bib_colaboradores').update({ activo }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  const c = _colabs.find(x => x.id === id);
  if (c) c.activo = activo;
  renderColabs();
  _pickerColabs = []; // invalidar caché picker
  toast(activo ? 'Activado' : 'Desactivado', 'success');
}

// ── FORMULARIO ADD / EDIT ─────────────────────────────────────
function abrirNuevoColaborador() {
  _editColabId = null;
  document.getElementById('mc-titulo').textContent = 'Nuevo colaborador';
  document.getElementById('mc-nombre').value = '';
  document.getElementById('mc-cargo').value  = '';
  document.getElementById('mc-area').value   = '';
  document.getElementById('mc-emails-list').innerHTML = _emailRow('');
  document.getElementById('modal-colab').classList.add('open');
  setTimeout(() => document.getElementById('mc-nombre').focus(), 80);
}

async function abrirEditColaborador(id) {
  _editColabId = id;
  const c = _colabs.find(x => x.id === id);
  if (!c) return;
  document.getElementById('mc-titulo').textContent = 'Editar colaborador';
  document.getElementById('mc-nombre').value = c.nombre;
  document.getElementById('mc-cargo').value  = c.cargo  || '';
  document.getElementById('mc-area').value   = c.area   || '';
  const emails = c.bib_colaboradores_correos || [];
  document.getElementById('mc-emails-list').innerHTML =
    (emails.length ? emails : [{ email: '' }]).map(e => _emailRow(e.email)).join('');
  document.getElementById('modal-colab').classList.add('open');
}

function _emailRow(val) {
  return `<div class="mc-email-row">
    <input type="email" class="fc mc-email-inp" value="${escHtml(val)}" placeholder="correo@colegiogoyavier.edu.co" style="flex:1;margin:0">
    <button class="btn btn-danger-sm" style="flex-shrink:0" onclick="this.closest('.mc-email-row').remove()" title="Quitar correo"><i class="fa fa-xmark fa-sm"></i></button>
  </div>`;
}

function agregarEmailInput() {
  document.getElementById('mc-emails-list').insertAdjacentHTML('beforeend', _emailRow(''));
  document.querySelector('#mc-emails-list .mc-email-inp:last-of-type')?.focus();
}

async function guardarColaborador() {
  const nombre = document.getElementById('mc-nombre').value.trim();
  const cargo  = document.getElementById('mc-cargo').value.trim();
  const area   = document.getElementById('mc-area').value.trim();
  if (!nombre) { toast('El nombre es obligatorio', 'error'); document.getElementById('mc-nombre').focus(); return; }

  const emails = [...document.querySelectorAll('#mc-emails-list .mc-email-inp')]
    .map(i => i.value.trim().toLowerCase())
    .filter((e, i, arr) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && arr.indexOf(e) === i);

  const btn = document.getElementById('btn-guardar-colab');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    let colabId = _editColabId;
    if (colabId) {
      const { error } = await _sb.from('bib_colaboradores').update({ nombre, cargo, area }).eq('id', colabId);
      if (error) throw error;
    } else {
      const { data, error } = await _sb.from('bib_colaboradores')
        .insert({ nombre, cargo, area }).select('id').single();
      if (error) throw error;
      colabId = data.id;
    }
    // Reemplazar correos: borrar todos y reinsertar
    await _sb.from('bib_colaboradores_correos').delete().eq('colaborador_id', colabId);
    if (emails.length) {
      const { error: eE } = await _sb.from('bib_colaboradores_correos')
        .insert(emails.map((e, i) => ({ colaborador_id: colabId, email: e, principal: i === 0 })));
      if (eE) throw eE;
    }
    toast(_editColabId ? 'Colaborador actualizado' : 'Colaborador creado', 'success');
    cerrarModal('modal-colab');
    _pickerColabs = []; // invalidar caché picker
    await cargarColaboradores();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── PICKER DE DESTINATARIOS ────────────────────────────────────
// Uso: abrirPickerDestinatarios(onConfirm, onCancel, preSelected)
//   onConfirm(destinatarios) → array de {nombre, email}
//   onCancel()               → usuario cerró sin confirmar
//   preSelected              → array de {email} ya marcados (pre-selección automática)
async function abrirPickerDestinatarios(onConfirm, onCancel, preSelected = [], showTipoPicker = false) {
  _pickerConfirm   = onConfirm;
  _pickerCancel    = onCancel;
  _pickerExtraOpen = false;
  _pickerShowTipo  = showTipoPicker;
  _pickerTipoCopia = 'General';

  document.getElementById('picker-list').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  document.getElementById('modal-destinatarios').classList.add('open');
  document.getElementById('picker-sel-section').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';

  // Ocultar sección de tipo hasta que se seleccione al menos un colaborador
  const tipoWrap = document.getElementById('picker-tipo-wrap');
  if (tipoWrap) tipoWrap.style.display = 'none';

  if (showTipoPicker) {
    if (!_pickerTiposList.length) {
      const { data } = await _sb.from('bib_tipos_copia').select('nombre').eq('activo', true).order('orden');
      _pickerTiposList = (data || []).map(t => t.nombre);
      if (!_pickerTiposList.length) _pickerTiposList = ['General', 'Institucional', 'Curso de inglés'];
    }
    _renderTipoSelect();
  }

  if (!_pickerColabs.length) {
    const { data, error } = await _sb
      .from('bib_colaboradores')
      .select('id,nombre,cargo,area,bib_colaboradores_correos(email,principal)')
      .eq('activo', true)
      .order('area').order('nombre');
    if (!error) _pickerColabs = data || [];
  }

  // Inicializar selección: resolver emails desde pre-selección
  _pickerSel = new Set();
  preSelected.forEach(p => {
    const email = typeof p === 'string' ? p : p.email;
    // buscar en colabs para seleccionar su email exacto
    const found = _pickerColabs.find(c =>
      (c.bib_colaboradores_correos || []).some(ce => ce.email === email)
    );
    if (found) {
      _pickerSel.add(email);
    }
    // si no está en colabs (email externo) igual pre-seleccionar
    else if (email) _pickerSel.add(email);
  });

  // Si no hay pre-selección, abrir directo la lista de búsqueda
  if (_pickerSel.size === 0) _pickerExtraOpen = true;

  document.getElementById('picker-search').value = '';
  _renderPickerSelSection();
  _applyPickerExtraState();
  _renderPickerList('');
  if (_pickerExtraOpen) setTimeout(() => document.getElementById('picker-search')?.focus(), 80);
}

function cerrarPickerModal() {
  cerrarModal('modal-destinatarios');
  if (_pickerCancel) { _pickerCancel(); _pickerCancel = null; }
  _pickerConfirm = null;
}

// ── SECCIÓN SELECCIONADOS PROMINENTE ──────────────────────────
function _renderPickerSelSection() {
  const sec     = document.getElementById('picker-sel-section');
  const countEl = document.getElementById('picker-count');
  if (countEl) countEl.textContent = _pickerSel.size > 0 ? `(${_pickerSel.size})` : '';
  if (!sec) return;

  if (_pickerSel.size === 0) {
    sec.innerHTML = '<div class="picker-empty-msg" style="margin-bottom:8px">Sin destinatarios — el correo no se enviará</div>';
    const wrap = document.getElementById('picker-tipo-wrap');
    if (wrap) wrap.style.display = 'none';
    return;
  }

  const cards = [];
  _pickerColabs.forEach(c => {
    const emails    = (c.bib_colaboradores_correos || []).map(e => e.email);
    const selEmails = emails.filter(e => _pickerSel.has(e));
    if (!selEmails.length) return;
    cards.push(`<div class="picker-sel-card">
      <div class="picker-sel-avatar"><i class="fa fa-user"></i></div>
      <div class="picker-sel-info">
        <div class="picker-nombre">${escHtml(c.nombre)}</div>
        <div class="picker-cargo">${escHtml([c.cargo, c.area].filter(Boolean).join(' · '))}</div>
        ${selEmails.map(e => `<span class="picker-sel-email">${escHtml(e)}</span>`).join('')}
      </div>
      <button class="btn-cls" onclick="toggleColabPicker(${c.id})" title="Quitar"><i class="fa fa-xmark fa-xs"></i></button>
    </div>`);
  });
  sec.innerHTML = cards.length ? cards.join('') : '<div class="picker-empty-msg" style="margin-bottom:8px">Sin destinatarios seleccionados</div>';
  _renderTipoSelect();
}

// ── TOGGLE SECCIÓN EXTRA ───────────────────────────────────────
function togglePickerExtra() {
  _pickerExtraOpen = !_pickerExtraOpen;
  _applyPickerExtraState();
  if (_pickerExtraOpen) setTimeout(() => document.getElementById('picker-search')?.focus(), 80);
}

function _applyPickerExtraState() {
  const content = document.getElementById('picker-extra-content');
  const ico     = document.getElementById('picker-agregar-ico');
  if (content) content.style.display = _pickerExtraOpen ? '' : 'none';
  if (ico)     ico.className = _pickerExtraOpen ? 'fa fa-minus fa-xs' : 'fa fa-plus fa-xs';
}

function _renderPickerList(q) {
  const list = document.getElementById('picker-list');
  if (!list) return;
  const low = q.toLowerCase();
  const fil = q ? _pickerColabs.filter(c =>
    c.nombre.toLowerCase().includes(low) ||
    (c.cargo||'').toLowerCase().includes(low) ||
    (c.area||'').toLowerCase().includes(low) ||
    (c.bib_colaboradores_correos||[]).some(e => e.email.toLowerCase().includes(low))
  ) : _pickerColabs;

  if (!fil.length) { list.innerHTML = '<div class="ss-empty">Sin resultados</div>'; return; }

  const areas = {};
  fil.forEach(c => { const a = c.area||'Sin área'; if (!areas[a]) areas[a]=[]; areas[a].push(c); });

  list.innerHTML = Object.entries(areas).map(([area, cs]) => `
    <div class="picker-area-lbl">${escHtml(area)}</div>
    ${cs.map(c => {
      const emails = (c.bib_colaboradores_correos||[]).map(e => e.email);
      const checked = emails.filter(e => _pickerSel.has(e)).length;
      const all     = emails.length > 0 && checked === emails.length;
      const some    = checked > 0 && !all;
      const ico     = all  ? '<i class="fa fa-square-check" style="color:var(--blue)"></i>'
                    : some ? '<i class="fa fa-square-minus" style="color:var(--blue)"></i>'
                    :        '<i class="fa fa-square" style="color:var(--dim)"></i>';
      return `<div class="picker-row${checked>0?' on':''}">
        <div class="picker-row-top" onclick="toggleColabPicker(${c.id})">
          <span class="picker-chk-ico">${ico}</span>
          <div style="flex:1;min-width:0">
            <div class="picker-nombre">${escHtml(c.nombre)}</div>
            <div class="picker-cargo">${escHtml([c.cargo,c.area].filter(Boolean).join(' · '))}</div>
          </div>
        </div>
        ${emails.length > 1 ? `<div class="picker-emails-sub">
          ${emails.map(e => `<label class="picker-email-row" onclick="event.stopPropagation()">
            <input type="checkbox" ${_pickerSel.has(e)?'checked':''} onchange="toggleEmailPicker('${e.replace(/'/g,"\\'")}',this.checked)">
            <span class="picker-email-txt">${escHtml(e)}</span>
          </label>`).join('')}
        </div>` : `<div style="font-size:11px;color:var(--muted);padding:2px 0 4px 36px">${emails[0]||'Sin correo'}</div>`}
      </div>`;
    }).join('')}
  `).join('');
}

function toggleColabPicker(colabId) {
  const c = _pickerColabs.find(x => x.id === colabId);
  if (!c) return;
  const emails = (c.bib_colaboradores_correos||[]).map(e => e.email);
  const all = emails.length > 0 && emails.every(e => _pickerSel.has(e));
  emails.forEach(e => { all ? _pickerSel.delete(e) : _pickerSel.add(e); });
  _renderPickerSelSection();
  _renderPickerList(document.getElementById('picker-search')?.value || '');
}

function toggleEmailPicker(email, on) {
  on ? _pickerSel.add(email) : _pickerSel.delete(email);
  _renderPickerSelSection();
  _renderPickerList(document.getElementById('picker-search')?.value || '');
}

function pickerSearchDebounce() {
  clearTimeout(window._pickerTimer);
  window._pickerTimer = setTimeout(() => _renderPickerList(document.getElementById('picker-search')?.value || ''), 250);
}

function _renderTipoSelect() {
  const sel  = document.getElementById('picker-tipo-select');
  const wrap = document.getElementById('picker-tipo-wrap');
  if (!sel || !wrap) return;
  sel.innerHTML = _pickerTiposList.map(t =>
    `<option value="${escHtml(t)}"${t === _pickerTipoCopia ? ' selected' : ''}>${escHtml(t)}</option>`
  ).join('');
  // Mostrar solo si hay tipo picker activo y al menos un colaborador seleccionado
  wrap.style.display = (_pickerShowTipo && _pickerSel.size > 0) ? '' : 'none';
}

function confirmarPicker() {
  const destinatarios = [];
  _pickerColabs.forEach(c => {
    (c.bib_colaboradores_correos||[]).forEach(ce => {
      if (_pickerSel.has(ce.email)) destinatarios.push({ nombre: c.nombre, email: ce.email });
    });
  });
  const tipo = _pickerShowTipo ? _pickerTipoCopia : null;
  cerrarModal('modal-destinatarios');
  _pickerCancel = null;
  if (_pickerConfirm) { _pickerConfirm(destinatarios, tipo); _pickerConfirm = null; }
}
