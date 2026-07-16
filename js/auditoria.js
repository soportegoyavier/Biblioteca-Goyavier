// ── AUDITORÍA — Centro de Salud del Sistema (Fase 2) ───────────
// Todo lo que se ve aquí sale de bib_vista_salud (agregación sobre
// bib_auditoria, alimentada por triggers + los eventos de proceso que
// ya registra WebApp_Backend.gs desde la Fase 1) + dos chequeos en
// vivo (ping a la base de datos y a Storage) + el estado de los
// triggers de Apps Script, que solo Apps Script puede ver de sí mismo.
// Cuota real del plan FREE de Supabase (confirmada en el dashboard del
// proyecto: Settings → Billing → Usage, 1 GB de Storage). Si algún día
// cambian de plan, este es el único número que hay que actualizar.
const STORAGE_LIMITE_BYTES = 1024 * 1024 * 1024;

async function cargarAuditoria() {
  document.getElementById('aud-tab-sel').value = _audTab;
  if (_audTab === 'salud')                await renderSalud();
  else if (_audTab === 'alertas')         await renderAlertas();
  else if (_audTab === 'logs')            await renderLogs();
  else if (_audTab === 'diagnostico')     await renderDiagnostico();
  else if (_audTab === 'mantenimiento')   await renderMantenimiento();
}

function cambiarTabAuditoria(tab) {
  _audTab = tab;
  cargarAuditoria();
}

// Botón "Actualizar" del encabezado: en Logs refresca solo la tabla
// respetando los filtros puestos, en vez de reconstruir el filtro-bar
// completo (que los reiniciaría a todos vacíos otra vez).
function actualizarAuditoria() {
  if (_audTab === 'logs') _cargarTablaLogs();
  else cargarAuditoria();
}

async function renderSalud() {
  const el = document.getElementById('aud-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';

  const [{ data: salud }, { count: pendientes }, ping, pingStorage, autom] = await Promise.all([
    _sb.from('bib_vista_salud').select('*').single(),
    _sb.from('bib_solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    _pingSupabase(),
    _pingStorage(),
    gasCall('estadoAutomatizacion').catch(e => ({ ok: false, error: e.message }))
  ]);
  const s = salud || {};

  el.innerHTML = `
    <div class="rep-grid">
      <div class="rep-card">
        <div class="rep-card-title">Sincronización de correos</div>
        <div class="rep-stat"><span>Última ejecución</span>${_saludFecha(s.ultima_sincronizacion, s.ultima_sincronizacion_resultado)}</div>
        <div class="rep-stat"><span>Duración promedio (7d)</span><span class="rep-stat-val">${s.duracion_prom_sincronizacion_ms ? (Math.round(s.duracion_prom_sincronizacion_ms/100)/10) + ' s' : '—'}</span></div>
        <div class="rep-stat"><span>Errores (7d)</span><span class="rep-stat-val" style="color:${_saludColor(s.sincronizaciones_error_7d,1,3)}">${s.sincronizaciones_error_7d||0}</span></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Correos</div>
        <div class="rep-stat"><span>Pendientes por gestionar</span><span class="rep-stat-val" style="color:${_saludColor(pendientes,10,25)}">${pendientes||0}</span></div>
        <div class="rep-stat"><span>Último envío</span>${_saludFecha(s.ultimo_envio_correo, s.ultimo_envio_correo_resultado)}</div>
        <div class="rep-stat"><span>Errores de envío (7d)</span><span class="rep-stat-val" style="color:${_saludColor(s.correos_error_7d,1,5)}">${s.correos_error_7d||0}</span></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Reporte mensual</div>
        <div class="rep-stat"><span>Última generación</span>${_saludFecha(s.ultimo_reporte_mensual, s.ultimo_reporte_mensual_resultado)}</div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Reconciliación de Storage</div>
        <div class="rep-stat"><span>Última ejecución</span>${_saludFecha(s.ultima_reconciliacion, s.ultima_reconciliacion_resultado)}</div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Errores del sistema</div>
        <div class="rep-stat"><span>Últimas 24 horas</span><span class="rep-stat-val" style="color:${_saludColor(s.errores_24h,1,5)}">${s.errores_24h||0}</span></div>
        <div class="rep-stat"><span>Últimos 7 días</span><span class="rep-stat-val" style="color:${_saludColor(s.errores_7d,3,15)}">${s.errores_7d||0}</span></div>
        <div class="rep-stat"><span>Críticos (7d)</span><span class="rep-stat-val" style="color:${(s.criticos_7d||0)>0?'var(--red)':'var(--green)'}">${s.criticos_7d||0}</span></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Almacenamiento</div>
        <div class="rep-stat"><span>Archivos</span><span class="rep-stat-val">${s.storage_archivos||0}</span></div>
        <div class="rep-stat"><span>Espacio usado</span><span class="rep-stat-val">${_fmtBytes(s.storage_bytes)}</span></div>
        <div class="rep-stat"><span>% del plan FREE (1 GB)</span><span class="rep-stat-val" style="color:${_saludColorPct(s.storage_bytes)}">${_pctStorage(s.storage_bytes)}%</span></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Conexión en vivo</div>
        <div class="rep-stat"><span>Base de datos</span>${_saludPing(ping)}</div>
        <div class="rep-stat"><span>Almacenamiento de archivos</span>${_saludPing(pingStorage)}</div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Recordatorios de vencimiento</div>
        <div class="rep-stat"><span>Copias sin confirmar</span>${_saludFecha(s.ultimo_recordatorio_copias, s.ultimo_recordatorio_copias_resultado)}</div>
        <div class="rep-stat"><span>Materiales vencidos</span>${_saludFecha(s.ultimo_recordatorio_materiales, s.ultimo_recordatorio_materiales_resultado)}</div>
        <div class="rep-stat"><span>Libros vencidos</span>${_saludFecha(s.ultimo_recordatorio_libros, s.ultimo_recordatorio_libros_resultado)}</div>
        <div class="rep-stat"><span>Solicitudes estancadas</span>${_saludFecha(s.ultimo_recordatorio_estancadas, s.ultimo_recordatorio_estancadas_resultado)}</div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Automatizaciones (Apps Script)</div>
        ${(autom && autom.ok) ? `
          <div class="rep-stat"><span>Cuenta que ejecuta</span><span class="rep-stat-val" style="font-size:12px">${escHtml(autom.cuentaGAS||'—')}</span></div>
          <div class="rep-stat"><span>Triggers activos</span><span class="rep-stat-val" style="color:${autom.triggers && autom.triggers.length ? 'var(--green)' : 'var(--red)'}">${(autom.triggers||[]).length}</span></div>
        ` : `<div class="rep-stat"><span>Estado</span><span class="rep-stat-val" style="color:var(--red)">No se pudo consultar</span></div>`}
      </div>
    </div>
  `;
}

function _saludFecha(fecha, resultado) {
  if (!fecha) return '<span class="rep-stat-val" style="color:var(--dim);font-size:12.5px">Sin registros</span>';
  const color = resultado === 'error' ? 'var(--red)' : 'var(--green)';
  return `<span class="rep-stat-val" style="color:${color};font-size:12.5px;font-weight:600">${fmtFecha(fecha)}</span>`;
}
function _saludPing(p) {
  if (!p) return '<span class="rep-stat-val" style="color:var(--dim)">—</span>';
  const color = !p.ok ? 'var(--red)' : p.ms > 1500 ? 'var(--amber)' : 'var(--green)';
  return `<span class="rep-stat-val" style="color:${color}">${p.ok ? p.ms + ' ms' : 'Error'}</span>`;
}
function _saludColor(n, umbralAdvertencia, umbralCritico) {
  n = n || 0;
  if (n >= umbralCritico) return 'var(--red)';
  if (n >= umbralAdvertencia) return 'var(--amber)';
  return 'var(--green)';
}
function _pctStorage(bytes) {
  return Math.round(((bytes || 0) / STORAGE_LIMITE_BYTES) * 100);
}
function _saludColorPct(bytes) {
  const pct = _pctStorage(bytes);
  if (pct >= 90) return 'var(--red)';
  if (pct >= 70) return 'var(--amber)';
  return 'var(--green)';
}
function _fmtBytes(n) {
  n = n || 0;
  if (n < 1024*1024) return (n/1024).toFixed(0) + ' KB';
  if (n < 1024*1024*1024) return (n/1024/1024).toFixed(1) + ' MB';
  return (n/1024/1024/1024).toFixed(2) + ' GB';
}

// Ping liviano: una fila indexada, no un count — no debe volverse mas
// pesado a medida que las tablas crecen (misma leccion de la revision
// de arquitectura anterior sobre consultas sin acotar).
async function _pingSupabase() {
  const t0 = performance.now();
  try {
    const { error } = await _sb.from('bib_solicitudes').select('id').limit(1);
    return { ok: !error, ms: Math.round(performance.now() - t0) };
  } catch(e) {
    return { ok: false, ms: Math.round(performance.now() - t0) };
  }
}
async function _pingStorage() {
  const t0 = performance.now();
  try {
    const { error } = await _sb.storage.from('biblioteca-adjuntos').list('', { limit: 1 });
    return { ok: !error, ms: Math.round(performance.now() - t0) };
  } catch(e) {
    return { ok: false, ms: Math.round(performance.now() - t0) };
  }
}

// ── ALERTAS (Fase 3) ────────────────────────────────────────────
// bib_vista_alertas ya aplica el umbral por módulo — si una fila
// aparece aquí, está en alerta ahora mismo. No hay estado "resuelto"
// que marcar: en cuanto los errores del día bajan del umbral, la fila
// deja de aparecer sola.
const _AUD_NOMBRE_MODULO = {
  sincronizacion: 'Sincronización de correos',
  correo: 'Envío de correos',
  reconciliacion: 'Reconciliación de Storage',
  reporte_mensual: 'Reporte mensual',
};

async function renderAlertas() {
  const el = document.getElementById('aud-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  const [{ data, error }, { data: saludStorage }] = await Promise.all([
    _sb.from('bib_vista_alertas').select('*').order('cantidad', { ascending: false }),
    _sb.from('bib_vista_salud').select('storage_bytes').single(),
  ]);
  if (error) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p style="color:var(--red)">${escHtml(error.message)}</p></div>`;
    return;
  }
  const filas = data || [];
  // El espacio de Storage no sale de bib_vista_alertas (esa vista es
  // sobre bib_auditoria; la cuota es un dato de la cuenta de Supabase,
  // no algo que la base de datos pueda saber por sí sola) — se agrega
  // aquí como una tarjeta más si cruza el 70%.
  const pctStorage = _pctStorage(saludStorage?.storage_bytes);
  const hayAlertaStorage = pctStorage >= 70;

  if (!filas.length && !hayAlertaStorage) {
    el.innerHTML = '<div class="empty"><div class="eico" style="color:var(--green)"><i class="fa fa-circle-check"></i></div><p>Sin alertas activas — todo dentro de los umbrales esperados.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="rep-grid">
      ${hayAlertaStorage ? `
        <div class="rep-card" style="border-color:${_saludColorPct(saludStorage.storage_bytes)}">
          <div class="rep-card-title" style="color:${_saludColorPct(saludStorage.storage_bytes)}"><i class="fa fa-triangle-exclamation"></i> Espacio de Storage</div>
          <div class="rep-stat"><span>Uso del plan FREE (1 GB)</span><span class="rep-stat-val" style="color:${_saludColorPct(saludStorage.storage_bytes)}">${pctStorage}%</span></div>
          <p style="margin:6px 0 0;font-size:12px;color:var(--muted)">Ve a Mantenimiento → "Archivar adjuntos antiguos a Drive" para liberar espacio.</p>
        </div>
      ` : ''}
      ${filas.map(f => {
        const critico = f.gravedad === 'critico';
        const color = critico ? 'var(--red)' : 'var(--amber)';
        return `
        <div class="rep-card" style="border-color:${color}">
          <div class="rep-card-title" style="color:${color}"><i class="fa fa-triangle-exclamation"></i> ${escHtml(_AUD_NOMBRE_MODULO[f.modulo] || f.modulo)}</div>
          <div class="rep-stat"><span>Errores últimas 24h</span><span class="rep-stat-val" style="color:${color}">${f.cantidad}</span></div>
          <div class="rep-stat"><span>Umbral</span><span class="rep-stat-val">${f.umbral}</span></div>
          <div class="rep-stat"><span>Última ocurrencia</span><span class="rep-stat-val" style="font-size:12px">${fmtFecha(f.ultimo)}</span></div>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ── VISOR DE LOGS (Fase 3) ──────────────────────────────────────
const _AUD_MODULOS_CONOCIDOS = [
  ['sincronizacion','Sincronización'], ['correo','Correo'], ['reconciliacion','Reconciliación'],
  ['reporte_mensual','Reporte mensual'], ['alertas','Alertas'], ['recordatorios','Recordatorios'],
  ['bib_solicitudes','bib_solicitudes'], ['bib_documentos','bib_documentos'], ['bib_pagos','bib_pagos'],
  ['bib_trabajos_personal','bib_trabajos_personal'], ['bib_movimientos','bib_movimientos'],
  ['bib_prestamos_libros','bib_prestamos_libros'], ['bib_colaboradores','bib_colaboradores'],
  ['bib_notif_config','bib_notif_config'], ['bib_remitentes_autorizados','bib_remitentes_autorizados'],
];

async function renderLogs() {
  const el = document.getElementById('aud-content');
  el.innerHTML = `
    <div class="filter-bar" style="margin-bottom:14px;flex-wrap:wrap">
      <input type="date" class="fc" id="log-desde" style="width:auto" onchange="_cargarTablaLogs()" title="Desde">
      <input type="date" class="fc" id="log-hasta" style="width:auto" onchange="_cargarTablaLogs()" title="Hasta">
      <select class="fc" id="log-modulo" style="width:auto" onchange="_cargarTablaLogs()">
        <option value="">Todos los módulos</option>
        ${_AUD_MODULOS_CONOCIDOS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <select class="fc" id="log-gravedad" style="width:auto" onchange="_cargarTablaLogs()">
        <option value="">Toda gravedad</option>
        <option value="info">Info</option>
        <option value="advertencia">Advertencia</option>
        <option value="error">Error</option>
        <option value="critico">Crítico</option>
      </select>
      <div class="search-wrap">
        <i class="fa fa-magnifying-glass" style="color:var(--dim);font-size:12px"></i>
        <input type="text" id="log-usuario" placeholder="Usuario..." oninput="_logFiltrarDebounce()">
      </div>
      <button class="btn btn-ghost" onclick="exportarExcelAuditoria()"><i class="fa fa-file-excel fa-sm" style="color:#217346"></i> Excel</button>
    </div>
    <div id="log-tabla-wrap"></div>
  `;
  await _cargarTablaLogs();
}

function _logFiltrarDebounce() {
  clearTimeout(_logBuscarTimer);
  _logBuscarTimer = setTimeout(_cargarTablaLogs, 300);
}

async function _obtenerFilasLogs(limite) {
  const desde    = document.getElementById('log-desde')?.value;
  const hasta    = document.getElementById('log-hasta')?.value;
  const modulo   = document.getElementById('log-modulo')?.value;
  const gravedad = document.getElementById('log-gravedad')?.value;
  const usuario  = document.getElementById('log-usuario')?.value?.trim() || '';

  let q = _sb.from('bib_auditoria').select('*').order('ocurrido_en', { ascending: false }).limit(limite || 500);
  if (desde)    q = q.gte('ocurrido_en', desde + 'T00:00:00');
  if (hasta)    q = q.lte('ocurrido_en', hasta + 'T23:59:59');
  if (modulo)   q = q.eq('modulo', modulo);
  if (gravedad) q = q.eq('gravedad', gravedad);
  if (usuario)  q = q.ilike('usuario', `%${usuario}%`);

  const { data, error } = await q;
  if (error) { toast('Error al cargar auditoría: ' + error.message, 'error'); return []; }
  return data || [];
}

function _logBadgeResultado(r) {
  return r === 'error' ? '<span class="badge b-cancelado">Error</span>' : '<span class="badge b-entregado">OK</span>';
}
function _logBadgeGravedad(g) {
  const m = { info: ['b-pendiente','Info'], advertencia: ['b-recibido','Advertencia'], error: ['b-cancelado','Error'], critico: ['b-cancelado','Crítico'] };
  const [cls, txt] = m[g] || ['b-pendiente', g];
  return `<span class="badge ${cls}">${txt}</span>`;
}

async function _cargarTablaLogs() {
  const wrap = document.getElementById('log-tabla-wrap');
  wrap.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  const filas = await _obtenerFilasLogs();
  if (!filas.length) {
    wrap.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-magnifying-glass"></i></div><p>Sin resultados para estos filtros.</p></div>';
    return;
  }
  wrap.innerHTML = `
    <div class="tw"><table>
      <thead><tr>
        <th>Fecha</th><th>Usuario</th><th>Origen</th><th>Módulo</th><th>Acción</th><th>Resultado</th><th>Gravedad</th><th>Detalle</th>
      </tr></thead>
      <tbody>
        ${filas.map(f => `
          <tr>
            <td class="td-m">${fmtFecha(f.ocurrido_en)}</td>
            <td>${escHtml(f.usuario || '—')}</td>
            <td>${escHtml(f.origen)}</td>
            <td>${escHtml(f.modulo)}</td>
            <td>${escHtml(f.accion)}</td>
            <td>${_logBadgeResultado(f.resultado)}</td>
            <td>${_logBadgeGravedad(f.gravedad)}</td>
            <td style="max-width:360px">${escHtml(f.detalle || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
    ${filas.length === 500 ? '<div style="padding:10px 4px;color:var(--dim);font-size:12px">Mostrando los 500 registros más recientes según el filtro — acota el rango de fechas para ver más allá.</div>' : ''}
  `;
}

// ── DIAGNÓSTICO (Fase 4) ─────────────────────────────────────────
// La reconciliación de Storage y los reprocesos de Gmail ya existían
// (construidos en la revisión de arquitectura anterior) — esto solo
// los expone como botones. Lo único nuevo de verdad es la persistencia
// de correos fallidos (antes se descartaban en silencio) y el chequeo
// de relaciones huérfanas.
async function renderDiagnostico() {
  const el = document.getElementById('aud-content');
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';

  const [{ data: huerfanos }, constraintsRes, { data: fallidos }] = await Promise.all([
    _sb.from('bib_vista_huerfanos').select('*'),
    _sb.rpc('bib_fn_verificar_constraints'),
    _sb.from('bib_correos_fallidos').select('*').eq('resuelto', false).order('creado_en', { ascending: false }).limit(50),
  ]);
  const constraints = constraintsRes?.data;

  el.innerHTML = `
    <div class="rep-grid" style="margin-bottom:20px">
      <div class="rep-card">
        <div class="rep-card-title">Reconciliación de Storage</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">Compara los archivos guardados contra lo que hay en la base de datos y detecta huérfanos en cualquiera de los dos lados.</p>
        <button class="btn btn-ghost" id="diag-btn-reconciliar" onclick="_diagEjecutarReconciliacion()"><i class="fa fa-play fa-sm"></i> Ejecutar ahora</button>
        <div id="diag-reconciliacion-resultado" style="margin-top:10px"></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Reprocesar un correo</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">Vuelve a leer un mensaje de Gmail por su ID y crea o actualiza la solicitud correspondiente.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" id="diag-gmail-id" class="fc" placeholder="Gmail message ID" style="flex:1;min-width:160px">
          <button class="btn btn-ghost" id="diag-btn-reprocesar" onclick="_diagReprocesarCorreo()">Reprocesar</button>
        </div>
        <div id="diag-reprocesar-resultado" style="margin-top:10px"></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Reprocesar desde una fecha</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">Revisa Gmail completo desde esa fecha y reprocesa los correos de remitentes autorizados. Solo para rangos cortos (2-3 días) — para más, usa el editor de Apps Script directamente.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="date" id="diag-fecha-desde" class="fc" style="flex:1;min-width:150px">
          <button class="btn btn-ghost" id="diag-btn-reprocesar-desde" onclick="_diagReprocesarDesde()">Reprocesar</button>
        </div>
        <div id="diag-reprocesar-desde-resultado" style="margin-top:10px"></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Duplicados prevenidos</div>
        ${constraints ? constraints.map(c => `
          <div class="rep-stat"><span>${escHtml(c.campo)}</span><span class="rep-stat-val" style="color:${c.protegido ? 'var(--green)' : 'var(--red)'}">${c.protegido ? 'Protegido' : 'Sin protección'}</span></div>
        `).join('') : `<p style="color:var(--red);font-size:12.5px;margin:0">No se pudo verificar.</p>`}
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Relaciones huérfanas</div>
        ${(huerfanos && huerfanos.length) ? huerfanos.map(h => `
          <div class="rep-stat"><span>${escHtml(h.relacion)}</span><span class="rep-stat-val" style="color:${h.cantidad > 0 ? 'var(--red)' : 'var(--green)'}">${h.cantidad}</span></div>
        `).join('') : '<p style="color:var(--muted);font-size:12.5px;margin:0">Sin datos.</p>'}
      </div>
    </div>

    <div class="rep-card-title" style="margin-bottom:10px">Correos fallidos pendientes de reintentar</div>
    <div id="diag-fallidos-wrap">${_diagRenderFallidos(fallidos || [])}</div>
  `;
}

async function _diagEjecutarReconciliacion() {
  const btn = document.getElementById('diag-btn-reconciliar');
  const out = document.getElementById('diag-reconciliacion-resultado');
  btn.disabled = true; btn.classList.add('loading');
  out.innerHTML = '';
  try {
    const res = await gasCall('ejecutarReconciliacion');
    if (!res.ok) { out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(res.error || 'Error')}</p>`; return; }
    out.innerHTML = res.filas.length
      ? `<p style="color:var(--amber);font-size:12.5px;margin:0 0 6px">${res.filas.length} inconsistencia(s):</p>` +
        res.filas.map(f => `<p style="font-size:11.5px;color:var(--muted);margin:0 0 4px">[${escHtml(f.tipo)}] ${escHtml(f.ruta)} — ${escHtml(f.detalle)}</p>`).join('')
      : '<p style="color:var(--green);font-size:12.5px;margin:0">Sin inconsistencias.</p>';
  } catch(e) {
    out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

async function _diagReprocesarCorreo() {
  const input = document.getElementById('diag-gmail-id');
  const id = input.value.trim();
  if (!id) { toast('Ingresa un Gmail message ID', 'error'); return; }
  const btn = document.getElementById('diag-btn-reprocesar');
  const out = document.getElementById('diag-reprocesar-resultado');
  btn.disabled = true; btn.classList.add('loading');
  out.innerHTML = '';
  try {
    const res = await gasCall('reprocesarCorreoManual', { gmailMsgId: id });
    out.innerHTML = `<p style="color:var(--green);font-size:12.5px;margin:0">${escHtml(res.accion || 'Reprocesado')}${res.solId ? ' (id=' + escHtml(String(res.solId)) + ')' : ''}</p>`;
    toast('Correo reprocesado', 'success');
  } catch(e) {
    out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

async function _diagReprocesarDesde() {
  const fecha = document.getElementById('diag-fecha-desde').value;
  if (!fecha) { toast('Elige una fecha', 'error'); return; }
  if (!confirm('Esto revisa todo el correo de Gmail desde ' + fecha + ' y puede tardar. ¿Continuar?')) return;
  const btn = document.getElementById('diag-btn-reprocesar-desde');
  const out = document.getElementById('diag-reprocesar-desde-resultado');
  btn.disabled = true; btn.classList.add('loading');
  out.innerHTML = '';
  try {
    const res = await gasCall('reprocesarDesdeManual', { fecha: fecha.replace(/-/g, '/') });
    out.innerHTML = `<p style="color:${res.errores > 0 ? 'var(--amber)' : 'var(--green)'};font-size:12.5px;margin:0">${res.procesados} procesados, ${res.errores} error(es)</p>`;
    toast('Reproceso completado', 'success');
  } catch(e) {
    out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

function _diagRenderFallidos(fallidos) {
  if (!fallidos.length) {
    return '<div class="empty"><div class="eico" style="color:var(--green)"><i class="fa fa-circle-check"></i></div><p>Sin correos fallidos pendientes.</p></div>';
  }
  return `
    <div class="tw"><table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Destinatario</th><th>Error</th><th>Intentos</th><th></th></tr></thead>
      <tbody>
        ${fallidos.map(f => `
          <tr>
            <td class="td-m">${fmtFecha(f.creado_en)}</td>
            <td>${escHtml(f.params?.tipo || '—')}</td>
            <td>${escHtml(f.params?.destinatario || '—')}</td>
            <td style="max-width:280px;color:var(--red);font-size:12px">${escHtml(f.error || '')}</td>
            <td>${f.intentos || 0}</td>
            <td><button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="_diagReintentarCorreo(${f.id}, this)">Reintentar</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

async function _diagReintentarCorreo(id, btn) {
  btn.disabled = true; btn.classList.add('loading');
  try {
    const res = await gasCall('reintentarCorreoFallido', { id });
    if (res.ok) toast('Correo reenviado', 'success');
    else toast('Sigue fallando: ' + (res.error || ''), 'error');
    const { data } = await _sb.from('bib_correos_fallidos').select('*').eq('resuelto', false).order('creado_en', { ascending: false }).limit(50);
    document.getElementById('diag-fallidos-wrap').innerHTML = _diagRenderFallidos(data || []);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// ── MANTENIMIENTO (Fase 5) ───────────────────────────────────────
// "Recalcular estadísticas" no aplica: las deudas ya se calculan al
// vuelo en vistas SQL (bib_vista_deudas), no hay nada cacheado que
// pueda quedar desactualizado. "Reindexar" tampoco: Postgres no se
// degrada con el uso como un motor de búsqueda, no hay botón útil que
// construir ahí. Lo que sí tiene sentido son estas tres cosas.
async function renderMantenimiento() {
  const el = document.getElementById('aud-content');
  el.innerHTML = `
    <div class="rep-grid">
      <div class="rep-card">
        <div class="rep-card-title">Archivar adjuntos antiguos a Drive</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">Mueve a Google Drive los archivos de solicitudes ya resueltas (entregado/cancelado) de meses anteriores, y los borra de Supabase Storage — el plan gratis de Supabase solo trae 1 GB de Storage, así que esto es lo que evita quedarse sin espacio. Corre solo una vez al día automáticamente; este botón la fuerza ahora.</p>
        <button class="btn btn-ghost" id="mant-btn-archivar" onclick="_mantArchivarAdjuntos()">Archivar ahora</button>
        <div id="mant-archivar-resultado" style="margin-top:10px"></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Regenerar reporte mensual</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">Genera de nuevo el Excel de un mes puntual y lo reenvía por correo — para reemplazar un reporte con datos corregidos, o generar uno que no salió automáticamente.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select class="fc" id="mant-mes" style="width:auto">
            ${MESES.map((m, i) => `<option value="${i}" ${i === _hoy.getMonth() ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <input type="number" class="fc" id="mant-ano" style="width:90px" value="${_hoy.getFullYear()}">
          <button class="btn btn-ghost" id="mant-btn-reporte" onclick="_mantGenerarReporte()">Generar y enviar</button>
        </div>
        <div id="mant-reporte-resultado" style="margin-top:10px"></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Limpiar remitentes bloqueados antiguos</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 10px"><code>bib_mensajes_ignorados</code> crece para siempre y nunca se depura. Borra los bloqueos más antiguos que el umbral elegido — la sincronización normal solo mira el mes actual, así que borrar bloqueos viejos no reabre nada en el día a día; el umbral por defecto es alto a propósito por si alguna vez se reprocesa manualmente ese rango exacto.</p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12.5px;color:var(--muted)">Borrar de más de</span>
          <input type="number" class="fc" id="mant-meses-antiguedad" style="width:70px" value="12" min="1">
          <span style="font-size:12.5px;color:var(--muted)">meses</span>
          <button class="btn btn-ghost" id="mant-btn-limpiar" onclick="_mantLimpiarIgnorados()">Limpiar</button>
        </div>
        <div id="mant-limpiar-resultado" style="margin-top:10px"></div>
      </div>
      <div class="rep-card">
        <div class="rep-card-title">Validar todo</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">Corre junta la reconciliación de Storage y el chequeo de relaciones huérfanas (los mismos motores de Diagnóstico) y resume el resultado en un solo lugar.</p>
        <button class="btn btn-ghost" id="mant-btn-validar" onclick="_mantValidarTodo()">Validar todo</button>
        <div id="mant-validar-resultado" style="margin-top:10px"></div>
      </div>
    </div>
  `;
}

// El presupuesto interno de archivarAdjuntosAntiguos() (35s) queda por
// debajo del timeout de gasCall (50s) a propósito, pero un backlog
// grande puede necesitar varias vueltas -- se repite sola mientras
// queden "restantes", igual que sincronizar() en nav.js con sus lotes.
async function _mantArchivarAdjuntos() {
  const btn = document.getElementById('mant-btn-archivar');
  const out = document.getElementById('mant-archivar-resultado');
  btn.disabled = true; btn.classList.add('loading');
  out.innerHTML = '';
  let totalArchivados = 0, totalErrores = 0, vuelta = 0;
  const MAX_VUELTAS = 20;
  try {
    while (vuelta < MAX_VUELTAS) {
      vuelta++;
      out.innerHTML = `<p style="color:var(--muted);font-size:12.5px;margin:0">Procesando${vuelta > 1 ? ' (vuelta ' + vuelta + ')' : ''}... ${totalArchivados} archivado(s) hasta ahora</p>`;
      const res = await gasCall('archivarAdjuntosAntiguos');
      if (!res.ok) { out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(res.error || 'Error')}</p>`; return; }
      totalArchivados += res.archivados || 0;
      totalErrores += res.errores || 0;
      if (!res.restantes) break;
    }
    const color = totalErrores > 0 ? 'var(--amber)' : 'var(--green)';
    out.innerHTML = `<p style="color:${color};font-size:12.5px;margin:0">${totalArchivados} archivado(s), ${totalErrores} error(es)${vuelta >= MAX_VUELTAS ? ' — quedó backlog, correrá de nuevo mañana' : ''}</p>`;
    toast('Archivado completado', 'success');
  } catch(e) {
    out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(e.message)} (${totalArchivados} ya archivado(s) antes del error)</p>`;
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

async function _mantGenerarReporte() {
  const mes = parseInt(document.getElementById('mant-mes').value);
  const ano = parseInt(document.getElementById('mant-ano').value);
  if (!ano || ano < 2020 || ano > 2100) { toast('Año inválido', 'error'); return; }
  if (!confirm(`Esto genera y envía por correo el reporte de ${MESES[mes]} ${ano}. ¿Continuar?`)) return;

  const btn = document.getElementById('mant-btn-reporte');
  const out = document.getElementById('mant-reporte-resultado');
  btn.disabled = true; btn.classList.add('loading');
  out.innerHTML = '';
  try {
    const res = await gasCall('generarReporteManual', { ano, mes });
    out.innerHTML = `<p style="color:var(--green);font-size:12.5px;margin:0">Generado: ${escHtml(res.nombre || '')}.xlsx — revisa tu correo.</p>`;
    toast('Reporte generado y enviado', 'success');
  } catch(e) {
    out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

async function _mantLimpiarIgnorados() {
  const meses = parseInt(document.getElementById('mant-meses-antiguedad').value) || 12;
  const btn = document.getElementById('mant-btn-limpiar');
  const out = document.getElementById('mant-limpiar-resultado');
  btn.disabled = true; btn.classList.add('loading');
  out.innerHTML = '';
  try {
    const { data, error } = await _sb.rpc('bib_fn_limpiar_mensajes_ignorados', { meses_antiguedad: meses });
    if (error) throw error;
    out.innerHTML = `<p style="color:var(--green);font-size:12.5px;margin:0">${data} registro(s) borrado(s).</p>`;
    toast('Limpieza completada', 'success');
  } catch(e) {
    out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

async function _mantValidarTodo() {
  const btn = document.getElementById('mant-btn-validar');
  const out = document.getElementById('mant-validar-resultado');
  btn.disabled = true; btn.classList.add('loading');
  out.innerHTML = '';
  try {
    const [reconRes, { data: huerfanos }] = await Promise.all([
      gasCall('ejecutarReconciliacion'),
      _sb.from('bib_vista_huerfanos').select('*'),
    ]);
    const problemasStorage = reconRes.ok ? (reconRes.filas || []).length : null;
    const totalHuerfanas = (huerfanos || []).reduce((a, h) => a + (h.cantidad || 0), 0);
    const hayProblemas = (problemasStorage || 0) > 0 || totalHuerfanas > 0;
    out.innerHTML = `
      <div class="rep-stat"><span>Inconsistencias de Storage</span><span class="rep-stat-val" style="color:${(problemasStorage||0) > 0 ? 'var(--amber)' : 'var(--green)'}">${problemasStorage === null ? 'Error' : problemasStorage}</span></div>
      <div class="rep-stat"><span>Relaciones huérfanas</span><span class="rep-stat-val" style="color:${totalHuerfanas > 0 ? 'var(--red)' : 'var(--green)'}">${totalHuerfanas}</span></div>
      <p style="margin:8px 0 0;font-size:12.5px;color:${hayProblemas ? 'var(--amber)' : 'var(--green)'}">${hayProblemas ? 'Hay algo para revisar en Diagnóstico.' : 'Todo en orden.'}</p>
    `;
  } catch(e) {
    out.innerHTML = `<p style="color:var(--red);font-size:12.5px;margin:0">${escHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}
