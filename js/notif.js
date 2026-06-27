// ── TIPOS DE COPIA ────────────────────────────────────────────
async function cargarTiposCopia() {
  const el = document.getElementById('tipos-copia-list');
  if (!el) return;
  const { data, error } = await _sb.from('bib_tipos_copia').select('*').order('orden');
  if (error) { el.innerHTML = `<p style="color:var(--red);font-size:13px">${error.message}</p>`; return; }
  const tipos = data || [];
  el.innerHTML = tipos.map(t => `
    <div class="notif-row" style="gap:10px">
      <div class="notif-info">
        <div class="notif-email">${escHtml(t.nombre)}</div>
      </div>
      <label class="toggle" title="${t.activo?'Desactivar':'Activar'}">
        <input type="checkbox" ${t.activo?'checked':''} onchange="toggleTipoCopia(${t.id},this.checked)">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </label>
    </div>`).join('') || '<p style="font-size:13px;color:var(--muted)">Sin tipos registrados</p>';
}

async function toggleTipoCopia(id, activo) {
  const { error } = await _sb.from('bib_tipos_copia').update({ activo }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  _pickerTiposList = []; // invalidar caché del picker
  await cargarTiposCopia();
  toast(activo ? 'Tipo activado' : 'Tipo desactivado', 'success');
}

async function agregarTipoCopia() {
  const inp = document.getElementById('nuevo-tipo-inp');
  const nombre = inp?.value?.trim();
  if (!nombre) { toast('Ingresa un nombre', 'error'); inp?.focus(); return; }
  const { data: maxOrden } = await _sb.from('bib_tipos_copia').select('orden').order('orden', { ascending: false }).limit(1).single();
  const orden = (maxOrden?.orden ?? -1) + 1;
  const { error } = await _sb.from('bib_tipos_copia').insert({ nombre, orden });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  _pickerTiposList = []; // invalidar caché del picker
  inp.value = '';
  await cargarTiposCopia();
  toast('Tipo agregado', 'success');
}

// ── NOTIFICACIONES ────────────────────────────────────────────
async function cargarNotificaciones() {
  const el = document.getElementById('notif-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const [nRes, rRes, sRes] = await Promise.all([
      _sb.from('bib_notif_config').select('email,activas'),
      _sb.from('bib_remitentes_autorizados').select('email,tipo').eq('activo', true),
      _sb.from('bib_solicitudes').select('remitente_email,tipo_remitente').limit(500)
    ]);
    const configs = {};
    (nRes.data||[]).forEach(n => configs[n.email] = n.activas);
    const emails = {};
    (rRes.data||[]).forEach(r => { emails[r.email] = { email:r.email, tipo:r.tipo||'institucional' }; });
    (sRes.data||[]).forEach(s => { if (s.remitente_email && !emails[s.remitente_email]) emails[s.remitente_email] = { email:s.remitente_email, tipo:s.tipo_remitente||'personal' }; });
    const lista = Object.values(emails).sort((a,b)=>a.email.localeCompare(b.email));
    if (!lista.length) { el.innerHTML='<div class="empty"><div class="eico"><i class="fa fa-inbox"></i></div><p>Sin remitentes registrados</p></div>'; return; }
    const tipoLabel = { institucional:'Institucional', general:'General', personal:'Personal / Externo' };
    el.innerHTML = `
      <div class="sec-hdr"><div class="sec-title">Configurar notificaciones por correo</div><div class="sec-hdr-line"></div></div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">Controla a quién se envían correos automáticos al cambiar el estado de sus solicitudes.</p>
      ${lista.map(r => {
        const activa = configs[r.email] !== false;
        const rid    = 'notif_' + r.email.replace(/[^a-z0-9]/gi,'_');
        return `<div class="notif-row" id="${rid}">
          <div class="notif-info">
            <div class="notif-email">${r.email}</div>
            <div class="notif-tipo">${tipoLabel[r.tipo]||r.tipo}</div>
          </div>
          <label class="toggle">
            <input type="checkbox" ${activa?'checked':''} onchange="toggleNotif('${r.email}',this.checked,'${rid}')">
            <div class="toggle-track"><div class="toggle-thumb"></div></div>
            <span style="font-size:12px;color:var(--muted);min-width:50px" id="${rid}_lbl">${activa?'Activas':'Inactivas'}</span>
          </label>
        </div>`;
      }).join('')}`;
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p>${e.message}</p></div>`;
  }
}

async function toggleNotif(email, activa, rowId) {
  try {
    await _sb.from('bib_notif_config').upsert({ email, activas: activa, updated_at: new Date().toISOString() }, { onConflict: 'email' });
    const lbl = document.getElementById(rowId + '_lbl');
    if (lbl) lbl.textContent = activa ? 'Activas' : 'Inactivas';
    toast(activa ? 'Notificaciones activadas' : 'Notificaciones desactivadas', 'success');
  } catch(e) { toast('Error al guardar: ' + e.message, 'error'); }
}
