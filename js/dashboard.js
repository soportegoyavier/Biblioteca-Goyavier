// ── DASHBOARD ────────────────────────────────────────────────
async function cargarDashboard() {
  const el = document.getElementById('dash-recientes');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const p1 = new Date(_hoy.getFullYear(), _hoy.getMonth(), 1).toISOString();
    const p2 = new Date(_hoy.getFullYear(), _hoy.getMonth() + 1, 1).toISOString();

    // Queries separados — con timeout de 12s por si la red está lenta
    const [r1, r2, r3, r4] = await withTimeout(Promise.all([
      _sb.from('bib_solicitudes').select('id,estado').gte('fecha_recepcion', p1).lt('fecha_recepcion', p2),
      _sb.from('bib_solicitudes').select('id,estado'),
      _sb.from('bib_solicitudes').select('id,id_solicitud,fecha_recepcion,asunto,remitente_email,profesor,estado')
        .order('fecha_recepcion', { ascending: false }).limit(8),
      _sb.from('bib_documentos').select('solicitud_id,num_hojas')
    ]), 12000, 'Sin respuesta de la base de datos (12s). Verifica tu conexión a internet.');

    if (r1.error) throw new Error('solicitudes-mes: ' + r1.error.message);
    if (r2.error) throw new Error('solicitudes-total: ' + r2.error.message);
    if (r3.error) throw new Error('recientes: ' + r3.error.message);

    const cnt = { pendiente:0, recibido:0, impreso:0, entregado:0 };
    (r2.data||[]).forEach(s => { if (cnt[s.estado] !== undefined) cnt[s.estado]++; });

    const mesSolIds = new Set((r1.data||[]).filter(s => s.estado==='entregado').map(s => s.id));
    const mesEnt    = mesSolIds.size;

    // Hojas del mes: solo docs de solicitudes del mes
    const mesSolAllIds = new Set((r1.data||[]).map(s => s.id));
    const mesHojas = (r4.data||[])
      .filter(d => mesSolAllIds.has(d.solicitud_id))
      .reduce((a,d) => a+(d.num_hojas||0), 0);

    document.getElementById('st-imprimir').textContent = cnt.recibido;
    document.getElementById('st-entregar').textContent = cnt.impreso;
    document.getElementById('st-ent-mes').textContent  = mesEnt;
    document.getElementById('st-hojas').textContent    = mesHojas;
    document.getElementById('p-pendiente').textContent = cnt.pendiente;
    document.getElementById('p-recibido').textContent  = cnt.recibido;
    document.getElementById('p-impreso').textContent   = cnt.impreso;
    document.getElementById('p-entregado').textContent = cnt.entregado;
    _actualizarBadgeUI(cnt.recibido + cnt.impreso);
    renderRecientes(r3.data || []);
  } catch(e) {
    console.error('cargarDashboard:', e);
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

function renderRecientes(rows) {
  const el = document.getElementById('dash-recientes');
  if (!rows.length) {
    el.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-inbox"></i></div><p>Sin solicitudes aún</p></div>';
    return;
  }
  el.innerHTML = `<div class="tw"><table>
    <thead><tr><th>ID</th><th>Fecha</th><th>Asunto</th><th>Estado</th></tr></thead>
    <tbody>${rows.map(r => `<tr onclick="verDetalle(${r.id})" style="cursor:pointer">
      <td class="td-id">${r.id_solicitud || '—'}</td>
      <td class="td-m">${fmtFecha(r.fecha_recepcion)}</td>
      <td class="td-trunc" style="max-width:240px">${r.asunto || r.remitente_email || '—'}</td>
      <td>${badge(r.estado)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}
