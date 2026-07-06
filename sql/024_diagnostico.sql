-- 024: Diagnostico (Fase 4). Tres piezas independientes:
--   1) bib_correos_fallidos: antes, un correo que fallaba se descartaba
--      en silencio (solo quedaba el log de bib_auditoria). Ahora se
--      guarda el payload completo para poder reintentarlo desde el
--      panel sin tener que reconstruir nada a mano.
--   2) bib_vista_huerfanos: relaciones que deberian apuntar a una fila
--      que ya no existe (ej. un pago cuya solicitud fue borrada).
--   3) bib_fn_verificar_constraints: confirma en vivo que los UNIQUE
--      que ya previenen duplicados (gmail_message_id, bib_materiales.nombre)
--      siguen existiendo -- no los crea, solo los verifica.

CREATE TABLE IF NOT EXISTS bib_correos_fallidos (
  id                bigserial PRIMARY KEY,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  params            jsonb NOT NULL,
  error             text,
  intentos          int NOT NULL DEFAULT 0,
  ultimo_intento_en timestamptz,
  resuelto          boolean NOT NULL DEFAULT false,
  resuelto_en       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_bib_correos_fallidos_pendientes ON bib_correos_fallidos(creado_en DESC) WHERE resuelto = false;

-- Solo lectura desde el frontend: el insert (al fallar) y el update (al
-- reintentar) los hace WebApp_Backend.gs con la service_role key, que
-- ignora RLS. No se audita esta tabla con trigger propio: cada intento
-- de envio, exitoso o no, ya queda en bib_auditoria (modulo='correo')
-- porque _reintentarCorreoFallido llama a la misma enviarCorreo().
ALTER TABLE bib_correos_fallidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_select ON bib_correos_fallidos FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW bib_vista_huerfanos AS
SELECT 'bib_trabajos_personal.solicitud_id' AS relacion, count(*) AS cantidad
  FROM bib_trabajos_personal t
  WHERE t.solicitud_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM bib_solicitudes s WHERE s.id = t.solicitud_id)
UNION ALL
SELECT 'bib_pagos.solicitud_id', count(*)
  FROM bib_pagos p
  WHERE p.solicitud_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM bib_solicitudes s WHERE s.id = p.solicitud_id)
UNION ALL
SELECT 'bib_pagos.trabajo_id', count(*)
  FROM bib_pagos p
  WHERE p.trabajo_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM bib_trabajos_personal t WHERE t.id = p.trabajo_id)
UNION ALL
SELECT 'bib_movimiento_materiales.movimiento_id', count(*)
  FROM bib_movimiento_materiales mm
  WHERE mm.movimiento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM bib_movimientos m WHERE m.id = mm.movimiento_id);

GRANT SELECT ON bib_vista_huerfanos TO authenticated;

-- SECURITY DEFINER: information_schema no esta expuesto via PostgREST,
-- asi que esta funcion vive en public (si expuesto) y consulta el
-- catalogo del sistema por dentro.
CREATE OR REPLACE FUNCTION bib_fn_verificar_constraints()
RETURNS TABLE(campo text, protegido boolean)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT 'bib_solicitudes.gmail_message_id'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_name = 'bib_solicitudes' AND ccu.column_name = 'gmail_message_id'
        AND tc.constraint_type = 'UNIQUE'
    )
  UNION ALL
  SELECT 'bib_materiales.nombre'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_name = 'bib_materiales' AND ccu.column_name = 'nombre'
        AND tc.constraint_type = 'UNIQUE'
    );
$$;

GRANT EXECUTE ON FUNCTION bib_fn_verificar_constraints() TO authenticated;
