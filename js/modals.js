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
function abrirModalEliminar(id) {
  _eliminarId = id;
  const motEl  = document.getElementById('melim-motivo');
  const infoEl = document.getElementById('melim-info');
  if (motEl)  motEl.value = '';
  if (infoEl) infoEl.textContent = 'Correo #' + id;
  document.getElementById('modal-eliminar').classList.add('open');
}

async function confirmarEliminar() {
  if (!_eliminarId) return;
  const motivo = document.getElementById('melim-motivo')?.value || '';
  const btn    = document.getElementById('btn-conf-eliminar');
  btn.classList.add('loading'); btn.disabled = true;
  try {
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
