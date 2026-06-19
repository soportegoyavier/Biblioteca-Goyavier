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
