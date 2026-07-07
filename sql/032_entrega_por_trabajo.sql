-- 032: entregas independientes por destinatario. Hoy "Entregar" marca la
-- solicitud completa de una vez aunque tenga trabajos para varias personas
-- distintas (bib_trabajos_impresion ya tiene un registro por destinatario,
-- ver js/copias.js confirmarImpreso). Esta migracion mueve el estado de
-- entrega/confirmacion de bib_solicitudes hacia bib_trabajos_impresion, y
-- deja bib_solicitudes como espejo agregado (lo siguen leyendo tal cual
-- dashboard.js y reportes.js, sin cambios de codigo ahi).

ALTER TABLE bib_trabajos_impresion
  ADD COLUMN destinatario_email      text,
  ADD COLUMN estado                  text NOT NULL DEFAULT 'pendiente'
                                        CHECK (estado IN ('pendiente','entregado')),
  ADD COLUMN nombre_recibe           text,
  ADD COLUMN fecha_entrega           timestamptz,
  ADD COLUMN recepcion_confirmada    boolean NOT NULL DEFAULT false,
  ADD COLUMN recepcion_confirmada_en timestamptz,
  ADD COLUMN recordatorio_enviado_en timestamptz;

-- Backfill: trabajos de solicitudes ya entregadas antes de esta migracion.
-- destinatario_email queda NULL aqui (no hay forma confiable de recuperarlo
-- retroactivo) -- no importa, ya fueron entregados, no les toca recordatorio.
UPDATE bib_trabajos_impresion t
SET estado = 'entregado', nombre_recibe = s.nombre_recibe, fecha_entrega = s.fecha_entrega,
    recepcion_confirmada = s.recepcion_confirmada, recepcion_confirmada_en = s.recepcion_confirmada_en
FROM bib_solicitudes s
WHERE s.id = t.solicitud_id AND s.estado = 'entregado';

-- bib_solicitudes.estado necesita el valor intermedio 'entregado_parcial'.
-- El nombre real del CHECK no esta en el repo (schema base no versionado en
-- sql/) -- se busca y reemplaza en vivo en vez de asumir un nombre.
DO $$
DECLARE c text;
BEGIN
  SELECT con.conname INTO c FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'bib_solicitudes' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%estado%';
  IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE bib_solicitudes DROP CONSTRAINT ' || quote_ident(c); END IF;
END $$;
ALTER TABLE bib_solicitudes ADD CONSTRAINT bib_solicitudes_estado_check
  CHECK (estado IN ('pendiente','recibido','impreso','entregado_parcial','entregado','cancelado'));

-- Trigger: recalcula el agregado en bib_solicitudes cada vez que un trabajo
-- cambia de estado o de confirmacion. SECURITY INVOKER (default): authenticated
-- ya tiene UPDATE permisivo sobre ambas tablas, no hace falta elevar privilegios.
CREATE OR REPLACE FUNCTION bib_fn_sync_solicitud_entrega() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE total int; entregados int; confirmados int; ultima timestamptz;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE estado='entregado'),
         count(*) FILTER (WHERE recepcion_confirmada), max(fecha_entrega)
    INTO total, entregados, confirmados, ultima
  FROM bib_trabajos_impresion WHERE solicitud_id = NEW.solicitud_id;

  UPDATE bib_solicitudes SET
    estado = CASE WHEN entregados = 0 THEN estado
                  WHEN entregados = total THEN 'entregado' ELSE 'entregado_parcial' END,
    fecha_entrega = COALESCE(ultima, fecha_entrega),
    nombre_recibe = CASE WHEN entregados = total THEN NEW.nombre_recibe ELSE nombre_recibe END,
    recepcion_confirmada = (confirmados = total AND total > 0),
    recepcion_confirmada_en = CASE WHEN confirmados = total AND recepcion_confirmada_en IS NULL
                                    THEN now() ELSE recepcion_confirmada_en END
  WHERE id = NEW.solicitud_id;
  RETURN NEW;
END $$;
ALTER FUNCTION bib_fn_sync_solicitud_entrega() SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_solicitud_entrega ON bib_trabajos_impresion;
CREATE TRIGGER trg_sync_solicitud_entrega
AFTER UPDATE OF estado, recepcion_confirmada ON bib_trabajos_impresion
FOR EACH ROW EXECUTE FUNCTION bib_fn_sync_solicitud_entrega();

-- Auditoria de recordatorios (modelo: bib_correos_fallidos, sql/024)
CREATE TABLE bib_recordatorios_entrega (
  id                 bigserial PRIMARY KEY,
  enviado_en         timestamptz NOT NULL DEFAULT now(),
  destinatario_email text NOT NULL,
  trabajo_ids        jsonb NOT NULL,
  cantidad_entregas  int NOT NULL,
  estado_envio       text NOT NULL,
  error              text
);
ALTER TABLE bib_recordatorios_entrega ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_select ON bib_recordatorios_entrega FOR SELECT TO authenticated USING (true);

-- Vista de candidatos a recordatorio: 7 dias sin confirmar y nunca recordados antes
CREATE VIEW bib_vista_recordatorios_pendientes AS
SELECT t.id AS trabajo_id, t.destinatario_email, t.profesor, t.fecha_entrega,
       t.archivos, t.total_hojas, s.id_solicitud, s.asunto
FROM bib_trabajos_impresion t JOIN bib_solicitudes s ON s.id = t.solicitud_id
WHERE t.estado = 'entregado' AND t.recepcion_confirmada = false
  AND t.recordatorio_enviado_en IS NULL AND t.destinatario_email IS NOT NULL
  AND t.fecha_entrega <= now() - interval '7 days';
ALTER VIEW bib_vista_recordatorios_pendientes SET (security_invoker = on);
GRANT SELECT ON bib_vista_recordatorios_pendientes TO authenticated;
