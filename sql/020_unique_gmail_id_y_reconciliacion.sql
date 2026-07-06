-- 020: Cierra dos huecos criticos de la auditoria de arquitectura.
--
-- 1) UNIQUE real sobre gmail_message_id: hasta ahora la deduplicacion de
--    sincronizarCorreos() era solo a nivel de aplicacion (leer IDs
--    existentes antes de insertar). Sin este constraint, dos ejecuciones
--    concurrentes (o un reintento mal coordinado) pueden crear solicitudes
--    duplicadas para el mismo correo.
--
-- 2) Funcion de reconciliacion Storage <-> bib_documentos: detecta archivos
--    huerfanos en el bucket biblioteca-adjuntos sin fila que los referencie,
--    y filas de bib_documentos cuyo archivo ya no existe en Storage.

-- Si esto falla con "duplicate key", significa que YA existen duplicados
-- reales en bib_solicitudes. Diagnostica primero con:
--   SELECT gmail_message_id, COUNT(*) FROM bib_solicitudes
--   WHERE gmail_message_id IS NOT NULL
--   GROUP BY gmail_message_id HAVING COUNT(*) > 1;
-- y decide manualmente cual copia conservar antes de reintentar este archivo.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT gmail_message_id FROM bib_solicitudes
    WHERE gmail_message_id IS NOT NULL
    GROUP BY gmail_message_id HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Hay % gmail_message_id duplicados en bib_solicitudes. Resuelvelos manualmente antes de aplicar este UNIQUE (ver comentario de este archivo).', dup_count;
  END IF;
END $$;

ALTER TABLE bib_solicitudes
  ADD CONSTRAINT bib_solicitudes_gmail_message_id_unique UNIQUE (gmail_message_id);

-- Reconciliacion Storage <-> bib_documentos
CREATE OR REPLACE FUNCTION bib_fn_reconciliar_storage()
RETURNS TABLE (tipo text, ruta text, detalle text) AS $$
BEGIN
  RETURN QUERY
  SELECT 'huerfano_storage'::text, o.name::text,
         'Existe en Storage pero ninguna fila de bib_documentos lo referencia'::text
    FROM storage.objects o
   WHERE o.bucket_id = 'biblioteca-adjuntos'
     AND NOT EXISTS (SELECT 1 FROM bib_documentos d WHERE d.storage_path = o.name)
  UNION ALL
  SELECT 'huerfano_bd'::text, d.storage_path::text,
         ('bib_documentos.id=' || d.id || ' apunta a un archivo que ya no existe en Storage')::text
    FROM bib_documentos d
   WHERE d.storage_path IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'biblioteca-adjuntos' AND o.name = d.storage_path
     );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION bib_fn_reconciliar_storage() SET search_path = public, storage;

-- 3) Vistas de deudas: dashboard.js y caja.js duplicaban la misma
--    agregacion (saldo = precio_total - valor_pagado) trayendo la tabla
--    bib_trabajos_personal completa sin filtro de fecha para calcularla
--    en el cliente. Se mueve la agregacion a la base de datos: cada
--    consulta ahora solo trae filas que realmente tienen saldo pendiente,
--    en vez de todo el historico.
CREATE OR REPLACE VIEW bib_vista_deudas_detalle AS
SELECT t.id, t.nombre, t.precio_total, t.valor_pagado, t.solicitud_id,
       (t.precio_total - t.valor_pagado) AS saldo,
       s.remitente_email
  FROM bib_trabajos_personal t
  JOIN bib_solicitudes s ON s.id = t.solicitud_id
 WHERE t.precio_total > 0
   AND (t.precio_total - t.valor_pagado) > 0.01;

CREATE OR REPLACE VIEW bib_vista_deudas AS
SELECT COALESCE(remitente_email, '—') AS remitente_email,
       SUM(saldo)   AS saldo_pendiente,
       COUNT(*)     AS trabajos_pendientes
  FROM bib_vista_deudas_detalle
 GROUP BY COALESCE(remitente_email, '—')
 ORDER BY SUM(saldo) DESC;

GRANT SELECT ON bib_vista_deudas_detalle TO authenticated;
GRANT SELECT ON bib_vista_deudas         TO authenticated;

-- 4) Notificaciones: la pantalla de configuracion traia bib_solicitudes con
--    .limit(500) SIN order — un corte arbitrario segun el orden fisico de
--    la tabla, no "los ultimos 500". Con el tiempo, remitentes reales
--    podian quedar fuera de la lista sin ningun aviso. Esta vista devuelve
--    un remitente por email (el mas reciente), sin limite artificial.
CREATE OR REPLACE VIEW bib_vista_remitentes_historicos AS
SELECT DISTINCT ON (remitente_email) remitente_email, tipo_remitente
  FROM bib_solicitudes
 WHERE remitente_email IS NOT NULL
 ORDER BY remitente_email, fecha_recepcion DESC;

GRANT SELECT ON bib_vista_remitentes_historicos TO authenticated;

