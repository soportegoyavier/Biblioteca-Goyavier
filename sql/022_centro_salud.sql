-- 022: Centro de Salud del Sistema (Fase 2 de observabilidad).
-- Se apoya por completo en bib_auditoria (021): agrega una columna
-- estructurada de duracion (en vez de tener que parsear el texto libre
-- de "detalle" para calcular promedios) y una vista de una sola fila
-- que resume el estado actual, para no repetir 7-8 consultas de
-- agregacion sueltas desde el frontend cada vez que se abre la pagina.

ALTER TABLE bib_auditoria ADD COLUMN IF NOT EXISTS duracion_ms integer;

-- SELECT sin FROM: siempre produce exactamente una fila, cada columna
-- es una subconsulta escalar independiente. bib_vista_salud no filtra
-- nada por si misma, asi que el frontend puede pedir "select *, single()"
-- con la certeza de que nunca va a fallar por "0 o mas de 1 filas".
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

  (SELECT count(*) FROM bib_documentos) AS storage_archivos,
  (SELECT coalesce(sum(tamano_bytes), 0) FROM bib_documentos) AS storage_bytes;

GRANT SELECT ON bib_vista_salud TO authenticated;
