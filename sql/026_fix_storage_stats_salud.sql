CREATE OR REPLACE FUNCTION bib_fn_storage_stats()
RETURNS TABLE(archivos bigint, bytes bigint)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT count(*), coalesce(sum((metadata->>'size')::bigint), 0)
    FROM storage.objects
   WHERE bucket_id = 'biblioteca-adjuntos';
$$;

GRANT EXECUTE ON FUNCTION bib_fn_storage_stats() TO authenticated;

DROP VIEW IF EXISTS bib_vista_salud;

CREATE VIEW bib_vista_salud AS
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
  (SELECT bytes     FROM bib_fn_storage_stats()) AS storage_bytes;

GRANT SELECT ON bib_vista_salud TO authenticated;
