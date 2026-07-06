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
      _sb.from('bib_solicitudes').select('estado').in('estado', ['recibido','impreso']),
      _sb.from('bib_solicitudes').select('id,id_solicitud,fecha_recepcion,asunto,remitente_email,profesor,estado')
        .order('fecha_recepcion', { ascending: false }).limit(8),
      _sb.from('bib_documentos').select('solicitud_id,num_hojas,bib_solicitudes!inner(fecha_recepcion)')
        .gte('bib_solicitudes.fecha_recepcion', p1).lt('bib_solicitudes.fecha_recepcion', p2)
    ]), 12000, 'Sin respuesta de la base de datos (12s). Verifica tu conexión a internet.');

    if (r1.error) throw new Error('solicitudes-mes: ' + r1.error.message);
    if (r2.error) throw new Error('solicitudes-estado: ' + r2.error.message);
    if (r3.error) throw new Error('recientes: ' + r3.error.message);

    const cnt = { recibido:0, impreso:0 };
    (r2.data||[]).forEach(s => { if (cnt[s.estado] !== undefined) cnt[s.estado]++; });

    const mesEnt = (r1.data||[]).filter(s => s.estado==='entregado').length;

    // Hojas del mes: r4 ya viene filtrado por fecha_recepcion vía el join
    const mesHojas = (r4.data||[]).reduce((a,d) => a+(d.num_hojas||0), 0);

    document.getElementById('st-imprimir').textContent = cnt.recibido;
    document.getElementById('st-entregar').textContent = cnt.impreso;
    document.getElementById('st-ent-mes').textContent  = mesEnt;
    document.getElementById('st-hojas').textContent    = mesHojas;
    _actualizarBadgeUI(cnt.recibido + cnt.impreso);
    renderRecientes(r3.data || []);
  } catch(e) {
    console.error('cargarDashboard:', e);
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
  cargarAlertasPrestamos(); // independiente del bloque anterior, no bloquea el resto del dashboard
  cargarDeudores();         // idem
}

// ── DEUDORES (Ventas) — misma vista agregada que usa Caja → Deudas ──
async function cargarDeudores() {
  const el = document.getElementById('dash-deudores');
  if (!el) return;
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    // bib_vista_deudas ya agrega en la base de datos (saldo > 0 por remitente),
    // en vez de traer todo bib_trabajos_personal y sumar en el cliente.
    const { data: lista, error } = await _sb.from('bib_vista_deudas').select('*');
    if (error) throw error;

    if (!lista.length) {
      el.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-circle-check"></i></div><p>Sin deudas pendientes</p></div>';
      return;
    }
    const totDeuda = lista.reduce((a,d) => a + d.saldo_pendiente, 0);
    el.innerHTML = `<div class="tw"><table>
      <thead><tr><th>Remitente</th><th>Saldo pendiente</th></tr></thead>
      <tbody>${lista.slice(0, 8).map(d => `<tr onclick="irACajaDeudas()" style="cursor:pointer">
        <td>${escHtml(d.remitente_email)}</td>
        <td style="color:var(--red);font-weight:700">${fmtPesos(d.saldo_pendiente)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div style="text-align:right;font-size:12px;color:var(--muted);margin-top:6px">
      Total pendiente: <strong style="color:var(--red)">${fmtPesos(totDeuda)}</strong> · ${lista.length} persona${lista.length!==1?'s':''} ·
      <a href="#" onclick="event.preventDefault();irACajaDeudas()" style="color:var(--accent)">ver todo en Caja</a>
    </div>`;
  } catch(e) {
    console.error('cargarDeudores:', e);
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${e.message}</p></div>`;
  }
}

function irACajaDeudas() {
  const navEl = document.querySelector('.ni[data-page="caja"]');
  navTo('caja', navEl);
  setCajaTab('deudas', document.getElementById('cajatab-deudas'));
}

// ── ALERTAS DE PRÉSTAMOS (materiales y libros) ─────────────────
async function cargarAlertasPrestamos() {
  const el = document.getElementById('dash-alertas-prestamos');
  if (!el) return;
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const [rMov, rLib] = await Promise.all([
      _sb.from('bib_movimientos')
        .select('id,id_movimiento,colaborador_nombre,fecha_limite_devolucion')
        .in('tipo', ['prestamo','asignacion'])
        .is('fecha_devolucion_real', null)
        .not('fecha_limite_devolucion', 'is', null),
      _sb.from('bib_prestamos_libros')
        .select('id,id_prestamo,libro_titulo,prestatario_nombre,fecha_limite_devolucion')
        .eq('es_institucional', false)
        .is('fecha_devolucion_real', null)
        .not('fecha_limite_devolucion', 'is', null),
    ]);
    if (rMov.error) throw rMov.error;
    if (rLib.error) throw rLib.error;

    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const clasificar = (fechaStr) => {
      const lim = new Date(fechaStr + 'T00:00:00');
      const dias = Math.round((lim - hoy) / 86400000);
      if (dias < 0)   return { estado:'vencido', texto:`Vencido hace ${-dias} día${-dias===1?'':'s'}` };
      if (dias === 0) return { estado:'hoy',     texto:'Vence hoy' };
      if (dias === 1) return { estado:'manana',  texto:'Vence mañana' };
      return null;
    };

    const items = [];
    (rMov.data||[]).forEach(m => {
      const c = clasificar(m.fecha_limite_devolucion);
      if (c) items.push({ ...c, tipo:'movimiento', id:m.id, ref:m.id_movimiento, nombre:m.colaborador_nombre });
    });
    (rLib.data||[]).forEach(l => {
      const c = clasificar(l.fecha_limite_devolucion);
      if (c) items.push({ ...c, tipo:'libro', id:l.id, ref:l.id_prestamo, nombre:`${l.libro_titulo} — ${l.prestatario_nombre}` });
    });

    const orden = { vencido:0, hoy:1, manana:2 };
    items.sort((a,b) => orden[a.estado] - orden[b.estado]);

    if (!items.length) {
      el.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-circle-check"></i></div><p>Sin préstamos por vencer</p></div>';
      return;
    }
    const colorEstado = { vencido:'var(--red)', hoy:'var(--amber)', manana:'var(--blue)' };
    el.innerHTML = `<div class="tw"><table>
      <thead><tr><th>Referencia</th><th>Detalle</th><th>Estado</th></tr></thead>
      <tbody>${items.map(it => `<tr onclick="irADetalleDesdeAlerta('${it.tipo}',${it.id})" style="cursor:pointer">
        <td class="td-id">${escHtml(it.ref || '—')}</td>
        <td>${escHtml(it.nombre || '—')}</td>
        <td style="color:${colorEstado[it.estado]};font-weight:600">${it.texto}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch(e) {
    console.error('cargarAlertasPrestamos:', e);
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
