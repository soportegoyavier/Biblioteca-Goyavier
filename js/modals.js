// ── CANCELAR SOLICITUD ────────────────────────────────────────
function toggleMotivoOtro() {
  const sel = document.getElementById('mcan-motivo-sel');
  const txt = document.getElementById('mcan-motivo-txt');
  if (txt) txt.style.display = sel.value === 'Otro' ? '' : 'none';
}

function abrirModalCancelar(id, tipo) {
  _cancelarId   = id;
  _cancelarTipo = tipo || 'copias';
  const selEl = document.getElementById('mcan-motivo-sel');
  const txtEl = document.getElementById('mcan-motivo-txt');
  if (selEl) selEl.value = '';
  if (txtEl) { txtEl.value = ''; txtEl.style.display = 'none'; }
  const infoEl = document.getElementById('mcan-info');
  if (infoEl) infoEl.textContent = 'Solicitud #' + id;
  document.getElementById('modal-cancelar').classList.add('open');
}

async function confirmarCancelacion() {
  const sel    = document.getElementById('mcan-motivo-sel');
  const txt    = document.getElementById('mcan-motivo-txt');
  const motivo = sel.value === 'Otro' ? txt.value.trim() : sel.value;
  if (!motivo) { toast('Indica el motivo de cancelación', 'error'); return; }
  const btn = document.getElementById('btn-conf-cancelar');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const { data: { user } } = await _sb.auth.getUser();
    const nota = `Cancelado por: ${user?.email || 'sistema'}. Motivo: ${motivo}`;
    const { data: solAntes, error: eAnt } = await _sb.from('bib_solicitudes')
      .select('estado').eq('id', _cancelarId).single();
    if (eAnt) throw eAnt;
    const { error } = await _sb.from('bib_solicitudes')
      .update({ estado: 'cancelado' }).eq('id', _cancelarId);
    if (error) throw error;
    await _sb.from('bib_historial_estados').insert({
      solicitud_id: _cancelarId,
      estado_anterior: solAntes?.estado || null,
      estado_nuevo: 'cancelado',
      notas: nota
    });
    toast('Solicitud cancelada', 'success');
    cerrarModal('modal-cancelar');
    if (_cancelarTipo === 'ventas') {
      await cargarVentas();
    } else {
      await cargarSolicitudes();
      await actualizarBadges();
    }
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── ELIMINAR CORREO ───────────────────────────────────────────
let _eliminarCorreo = '';   // remitente del correo que se está eliminando (para la opción "Es spam")

async function abrirModalEliminar(id) {
  _eliminarId = id;
  _eliminarCorreo = '';
  const motEl  = document.getElementById('melim-motivo');
  const infoEl = document.getElementById('melim-info');
  if (motEl)  motEl.value = '';
  if (infoEl) infoEl.textContent = 'Correo #' + id;
  // Opción "Es spam": solo para remitentes "personales" (los de Ventas) con dirección válida.
  const box = document.getElementById('melim-spam-box');
  document.getElementById('melim-spam').checked = false;
  document.getElementById('melim-spam-todos').checked = false;
  document.getElementById('melim-spam-todos-wrap').style.display = 'none';
  box.style.display = 'none';
  document.getElementById('modal-eliminar').classList.add('open');
  try {
    const { data: s } = await _sb.from('bib_solicitudes')
      .select('remitente_email,tipo_remitente').eq('id', id).single();
    const correo = (s?.remitente_email || '').trim().toLowerCase();
    if (_eliminarId !== id || !correo || s?.tipo_remitente !== 'personal') return;
    _eliminarCorreo = correo;
    document.getElementById('melim-spam-correo').textContent = correo;
    const { count } = await _sb.from('bib_solicitudes')
      .select('id', { count: 'exact', head: true })
      .eq('remitente_email', correo).eq('tipo_remitente', 'personal').eq('estado', 'pendiente').neq('id', id);
    document.getElementById('melim-spam-n').textContent = count || 0;
    document.getElementById('melim-spam-todos-wrap').dataset.hayOtros = (count || 0) > 0 ? '1' : '';
    box.style.display = 'block';
  } catch (e) { /* sin la opción de spam: el Eliminar normal sigue funcionando */ }
}

function toggleSpamEliminar() {
  const esSpam = document.getElementById('melim-spam').checked;
  const wrap = document.getElementById('melim-spam-todos-wrap');
  wrap.style.display = (esSpam && wrap.dataset.hayOtros) ? 'flex' : 'none';
  if (!esSpam) document.getElementById('melim-spam-todos').checked = false;
}

async function confirmarEliminar() {
  if (!_eliminarId) return;
  const motivo = document.getElementById('melim-motivo')?.value || '';
  const esSpam = !!document.getElementById('melim-spam')?.checked && !!_eliminarCorreo;
  const btn    = document.getElementById('btn-conf-eliminar');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    if (esSpam) {
      const borrarTodos = !!document.getElementById('melim-spam-todos')?.checked;
      let res = await gasCall('bloquearRemitente', { id: _eliminarId, motivo: motivo || 'Spam', borrarTodos });
      if (!res.ok) throw new Error(res.error || 'Error desconocido');
      let total = res.eliminados || 0;
      // Si había muchos correos del mismo remitente, el servidor los borra por tandas: se repite hasta terminar.
      let vueltas = 0;
      while (res.restantes > 0 && vueltas++ < 60) {
        toast('Eliminando spam… ' + total + ' correos', 'info', 2500);
        res = await gasCall('bloquearRemitente', { correo: _eliminarCorreo, motivo: motivo || 'Spam', borrarTodos: true });
        if (!res.ok) throw new Error(res.error || 'Error desconocido');
        total += res.eliminados || 0;
      }
      toast('Remitente bloqueado (' + _eliminarCorreo + '). ' + total + ' correo(s) eliminado(s)', 'success');
      cerrarModal('modal-eliminar');
      if (_pagina === 'ventas') { await cargarVentas(); } else { await cargarSolicitudes(); await actualizarBadges(); }
      return;
    }
    // Todo el borrado (Storage + pagos + solicitud + registrar en
    // ignorados) se hace en el servidor con la service_role key — el
    // navegador intentaba borrar los archivos de Storage directo y no
    // funcionaba de verdad (sin error visible, pero el archivo se
    // quedaba huérfano). Ver _eliminarSolicitud() en WebApp_Backend.gs.
    const res = await gasCall('eliminarSolicitud', { id: _eliminarId, motivo });
    if (!res.ok) throw new Error(res.error || 'Error desconocido');

    toast('Correo eliminado y bloqueado', 'success');
    cerrarModal('modal-eliminar');
    if (_pagina === 'ventas') {
      await cargarVentas();
    } else {
      await cargarSolicitudes();
      await actualizarBadges();
    }
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── REMITENTES BLOQUEADOS (spam) ──────────────────────────────
// Se llenan desde "Eliminar correo > Es spam". Desbloquear solo quita la dirección de la lista:
// los correos ya eliminados no vuelven, pero los nuevos que lleguen se guardan de nuevo.
async function abrirModalBloqueados() {
  const el = document.getElementById('bloqueados-list');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  document.getElementById('modal-bloqueados').classList.add('open');
  try {
    const { data, error } = await _sb.from('bib_remitentes_bloqueados')
      .select('email,motivo,asunto_ejemplo,bloqueado_por,created_at').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data?.length) {
      el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px 8px">No hay remitentes bloqueados.<br>Usa «Eliminar» en un correo de Ventas y marca «Es spam».</p>';
      return;
    }
    el.innerHTML = data.map(b => `
      <div style="display:flex;gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;word-break:break-all">${escHtml(b.email)}</div>
          <div style="font-size:12px;color:var(--muted)">${escHtml(b.asunto_ejemplo || '')}${b.asunto_ejemplo ? ' · ' : ''}${new Date(b.created_at).toLocaleDateString('es-CO')}${b.bloqueado_por ? ' · ' + escHtml(b.bloqueado_por) : ''}</div>
        </div>
        <button class="btn btn-ghost" data-email="${escHtml(b.email)}" onclick="desbloquearRemitente(this.dataset.email)">Desbloquear</button>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = '<p style="color:var(--red);padding:16px">Error: ' + escHtml(e.message) + '</p>';
  }
}

async function desbloquearRemitente(email) {
  if (!email) return;
  try {
    const { error } = await _sb.from('bib_remitentes_bloqueados').delete().eq('email', email);
    if (error) throw error;
    toast('Desbloqueado: ' + email, 'success');
    await abrirModalBloqueados();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── RESPONDER CORREO ──────────────────────────────────────────
// Respuesta manual, no automática: el usuario decide qué escribir y
// cuándo. Se envía como reply real de Gmail (mismo hilo) en vez de un
// correo nuevo, para que el remitente lo vea como una respuesta normal.
function abrirModalResponder() {
  if (!_detalleActual) return;
  document.getElementById('mresp-destinatario').textContent = _detalleActual.remitente_email || '—';
  document.getElementById('mresp-asunto').textContent = 'Re: ' + (_detalleActual.asunto || '(sin asunto)');
  document.getElementById('mresp-mensaje').value = '';
  document.body.appendChild(document.getElementById('modal-responder'));
  document.getElementById('modal-responder').classList.add('open');
}

async function confirmarResponder() {
  if (!_detalleActual) return;
  const mensaje = document.getElementById('mresp-mensaje').value.trim();
  if (!mensaje) { toast('Escribe un mensaje', 'error'); return; }
  const btn = document.getElementById('btn-conf-responder');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const res = await gasCall('responderCorreo', { gmailMessageId: _detalleActual.gmail_message_id, mensaje });
    if (!res.ok) throw new Error(res.error || 'Error desconocido');
    toast('Respuesta enviada', 'success');
    cerrarModal('modal-responder');
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}
