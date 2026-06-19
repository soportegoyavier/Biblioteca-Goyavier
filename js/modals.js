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
    // Obtener gmail_message_id, remitente y asunto antes de borrar
    const { data: sol, error: eGet } = await _sb.from('bib_solicitudes')
      .select('gmail_message_id,remitente_email,asunto')
      .eq('id', _eliminarId).single();
    if (eGet) throw eGet;

    // Registrar en lista de ignorados para que no se reimporte
    if (sol.gmail_message_id) {
      await _sb.from('bib_mensajes_ignorados').upsert({
        gmail_message_id: sol.gmail_message_id,
        remitente_email:  sol.remitente_email || null,
        asunto:           sol.asunto          || null,
        motivo:           motivo              || null
      }, { onConflict: 'gmail_message_id' });
    }

    // bib_pagos.solicitud_id no tiene ON DELETE CASCADE — borrar pagos explícitamente primero
    await _sb.from('bib_pagos').delete().eq('solicitud_id', _eliminarId);

    // Eliminar solicitud (cascade borra documentos, trabajos_personal e historial)
    const { error: eDel } = await _sb.from('bib_solicitudes').delete().eq('id', _eliminarId);
    if (eDel) throw eDel;

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
