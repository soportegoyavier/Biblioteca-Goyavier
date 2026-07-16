-- 034: recordatorios automaticos para lo que hoy solo se ve "vencido"
-- dentro de la app (dashboard.js cargarAlertasPrestamos) sin que nadie
-- reciba un correo. Tres cosas nuevas:
--   1. Materiales vencidos (bib_movimientos) -- recordatorio repetido
--      cada 3 dias al colaborador, hasta que se registre la devolucion.
--   2. Libros vencidos (bib_prestamos_libros) -- igual, al prestatario.
--   3. Solicitudes de copias estancadas en 'pendiente' 2+ dias -- digest
--      diario al equipo de Biblioteca (REPORTE_EMAIL), no al profesor.
-- Ademas corrige bib_vista_recordatorios_pendientes (032): mandaba UN
-- solo recordatorio por trabajo para siempre (recordatorio_enviado_en
-- IS NULL); ahora reinsiste cada 3 dias mientras siga sin confirmarse.

ALTER TABLE bib_movimientos
  ADD COLUMN IF NOT EXISTS ultimo_recordatorio_vencido_en timestamptz;
ALTER TABLE bib_prestamos_libros
  ADD COLUMN IF NOT EXISTS ultimo_recordatorio_vencido_en timestamptz;

-- ── Materiales vencidos (prestamo/asignacion, sin devolver) ──────────
-- materiales via subconsulta jsonb: bib_movimiento_materiales es 1-a-N
-- con bib_movimientos, y el correo necesita el detalle por linea (igual
-- que ya hace movimiento_entregado en WebApp_Backend.gs).
CREATE OR REPLACE VIEW bib_vista_recordatorios_materiales_vencidos AS
SELECT m.id, m.id_movimiento, m.colaborador_email, m.colaborador_nombre,
       m.tipo, m.fecha_limite_devolucion,
       (CURRENT_DATE - m.fecha_limite_devolucion) AS dias_vencido,
       (SELECT jsonb_agg(jsonb_build_object(
                 'nombre', mm.nombre,
                 'cantidad', mm.cantidad_entregada - mm.cantidad_devuelta,
                 'unidad', mm.unidad_medida))
          FROM bib_movimiento_materiales mm
         WHERE mm.movimiento_id = m.id) AS materiales
FROM bib_movimientos m
WHERE m.tipo IN ('prestamo','asignacion')
  AND m.fecha_devolucion_real IS NULL
  AND m.fecha_limite_devolucion IS NOT NULL
  AND m.fecha_limite_devolucion < CURRENT_DATE
  AND m.colaborador_email IS NOT NULL
  AND (m.ultimo_recordatorio_vencido_en IS NULL
       OR m.ultimo_recordatorio_vencido_en < now() - interval '3 days');
ALTER VIEW bib_vista_recordatorios_materiales_vencidos SET (security_invoker = on);
GRANT SELECT ON bib_vista_recordatorios_materiales_vencidos TO authenticated;

-- ── Libros vencidos (prestamo personal, no institucional) ────────────
CREATE OR REPLACE VIEW bib_vista_recordatorios_libros_vencidos AS
SELECT l.id, l.id_prestamo, l.prestatario_email, l.prestatario_nombre,
       l.libro_titulo, l.fecha_limite_devolucion,
       (CURRENT_DATE - l.fecha_limite_devolucion) AS dias_vencido
FROM bib_prestamos_libros l
WHERE l.es_institucional = false
  AND l.fecha_devolucion_real IS NULL
  AND l.fecha_limite_devolucion IS NOT NULL
  AND l.fecha_limite_devolucion < CURRENT_DATE
  AND l.prestatario_email IS NOT NULL
  AND (l.ultimo_recordatorio_vencido_en IS NULL
       OR l.ultimo_recordatorio_vencido_en < now() - interval '3 days');
ALTER VIEW bib_vista_recordatorios_libros_vencidos SET (security_invoker = on);
GRANT SELECT ON bib_vista_recordatorios_libros_vencidos TO authenticated;

-- ── Solicitudes de copias estancadas en 'pendiente' ──────────────────
-- Digest diario al staff -- no tiene columna de dedup propia porque el
-- trigger ya corre una sola vez al dia (verificarFechasMes); se reenvia
-- todos los dias mientras la lista no este vacia, como un monitor, no
-- como un recordatorio de una sola vez.
CREATE OR REPLACE VIEW bib_vista_solicitudes_estancadas AS
SELECT id, id_solicitud, asunto, remitente_email, profesor, fecha_recepcion,
       (CURRENT_DATE - fecha_recepcion::date) AS dias_estancada
FROM bib_solicitudes
WHERE estado = 'pendiente'
  AND fecha_recepcion < now() - interval '2 days'
ORDER BY fecha_recepcion ASC;
ALTER VIEW bib_vista_solicitudes_estancadas SET (security_invoker = on);
GRANT SELECT ON bib_vista_solicitudes_estancadas TO authenticated;

-- ── Fix: recordatorio de copias sin confirmar, que insista cada 3 dias
-- en vez de mandar uno solo para siempre.
CREATE OR REPLACE VIEW bib_vista_recordatorios_pendientes AS
SELECT t.id AS trabajo_id, t.destinatario_email, t.profesor, t.fecha_entrega,
       t.archivos, t.total_hojas, s.id_solicitud, s.asunto
FROM bib_trabajos_impresion t JOIN bib_solicitudes s ON s.id = t.solicitud_id
WHERE t.estado = 'entregado' AND t.recepcion_confirmada = false
  AND t.destinatario_email IS NOT NULL
  AND t.fecha_entrega <= now() - interval '7 days'
  AND (t.recordatorio_enviado_en IS NULL
       OR t.recordatorio_enviado_en < now() - interval '3 days');
ALTER VIEW bib_vista_recordatorios_pendientes SET (security_invoker = on);
GRANT SELECT ON bib_vista_recordatorios_pendientes TO authenticated;

-- ── Visibilidad en Auditoria -> Salud: ultima corrida de cada recordatorio.
-- Mismo patron que 022_centro_salud.sql (subconsultas escalares por modulo).
CREATE OR REPLACE VIEW bib_vista_salud AS
SELECT
  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'sincronizacion') AS ultima_sincronizacion,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'sincronizacion' ORDER BY ocurrido_en DESC LIMIT 1) AS ultima_sincronizacion_resultado,
  (SELECT avg(duracion_ms) FROM bib_auditoria WHERE modulo = 'sincronizacion' AND ocurrido_en > now() - interval '7 days' AND duracion_ms IS NOT NULL) AS duracion_prom_sincronizacion_ms,
  (SELECT count(*) FROM bib_auditoria WHERE modulo = 'sincronizacion' AND resultado = 'error' AND ocurrido_en > now() - interval '7 days') AS sincronizaciones_error_7d,

  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'correo') AS ultimo_envio_correo,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'correo' ORDER BY ocurrido_en DESC LIMIT 1) AS ultimo_envio_correo_resultado,
  (SELECT count(*) FROM bib_auditoria WHERE modulo = 'correo' AND resultado = 'error' AND ocurrido_en > now() - interval '7 days') AS correos_error_7d,

  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'reporte_mensual') AS ultimo_reporte_mensual,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'reporte_mensual' ORDER BY ocurrido_en DESC LIMIT 1) AS ultimo_reporte_mensual_resultado,

  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'reconciliacion') AS ultima_reconciliacion,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'reconciliacion' ORDER BY ocurrido_en DESC LIMIT 1) AS ultima_reconciliacion_resultado,

  (SELECT count(*) FROM bib_auditoria WHERE resultado = 'error' AND ocurrido_en > now() - interval '1 day')  AS errores_24h,
  (SELECT count(*) FROM bib_auditoria WHERE resultado = 'error' AND ocurrido_en > now() - interval '7 days') AS errores_7d,
  (SELECT count(*) FROM bib_auditoria WHERE gravedad = 'critico' AND ocurrido_en > now() - interval '7 days') AS criticos_7d,

  (SELECT archivos FROM bib_fn_storage_stats()) AS storage_archivos,
  (SELECT bytes     FROM bib_fn_storage_stats()) AS storage_bytes,

  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'recordar_confirmaciones') AS ultimo_recordatorio_copias,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'recordar_confirmaciones' ORDER BY ocurrido_en DESC LIMIT 1) AS ultimo_recordatorio_copias_resultado,

  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'materiales_vencidos') AS ultimo_recordatorio_materiales,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'materiales_vencidos' ORDER BY ocurrido_en DESC LIMIT 1) AS ultimo_recordatorio_materiales_resultado,

  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'libros_vencidos') AS ultimo_recordatorio_libros,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'libros_vencidos' ORDER BY ocurrido_en DESC LIMIT 1) AS ultimo_recordatorio_libros_resultado,

  (SELECT max(ocurrido_en) FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'solicitudes_estancadas') AS ultimo_recordatorio_estancadas,
  (SELECT resultado FROM bib_auditoria WHERE modulo = 'recordatorios' AND accion = 'solicitudes_estancadas' ORDER BY ocurrido_en DESC LIMIT 1) AS ultimo_recordatorio_estancadas_resultado;

-- CREATE OR REPLACE VIEW no reinicia opciones de vista de forma confiable
-- entre versiones de Postgres -- se reafirma explicitamente (mismo valor
-- que ya dejo 030_fix_security_advisor_errores.sql, solo por seguridad).
ALTER VIEW bib_vista_salud SET (security_invoker = on);
GRANT SELECT ON bib_vista_salud TO authenticated;
