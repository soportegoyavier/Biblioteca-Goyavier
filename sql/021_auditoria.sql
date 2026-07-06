-- 021: Fundacion del sistema de auditoria. Todo lo demas (Centro de Salud,
-- Alertas, Visor de Logs, Diagnostico) se construye encima de esta tabla.
--
-- Dos tipos de fila conviven aqui:
--   1) Cambios de datos, capturados AUTOMATICAMENTE por trigger en las
--      tablas donde perder informacion o editarla sin dejar rastro es
--      inaceptable (solicitudes, documentos, pagos, trabajos, movimientos,
--      prestamos de libros, colaboradores, configuracion de notificaciones
--      y remitentes autorizados).
--   2) Eventos de proceso (sincronizacion, envio de correo, reporte
--      mensual, reconciliacion) que un trigger no puede ver porque no son
--      cambios de fila — estos se insertan explicitamente desde
--      WebApp_Backend.gs.

CREATE TABLE IF NOT EXISTS bib_auditoria (
  id            bigserial PRIMARY KEY,
  ocurrido_en   timestamptz NOT NULL DEFAULT now(),
  usuario       text,
  origen        text NOT NULL CHECK (origen IN ('frontend','gas','trigger')),
  modulo        text NOT NULL,
  accion        text NOT NULL,
  tabla         text,
  registro_id   text,
  antes         jsonb,
  despues       jsonb,
  resultado     text NOT NULL DEFAULT 'ok' CHECK (resultado IN ('ok','error')),
  gravedad      text NOT NULL DEFAULT 'info' CHECK (gravedad IN ('info','advertencia','error','critico')),
  detalle       text
);

CREATE INDEX IF NOT EXISTS idx_bib_auditoria_ocurrido_en ON bib_auditoria(ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS idx_bib_auditoria_modulo       ON bib_auditoria(modulo);
CREATE INDEX IF NOT EXISTS idx_bib_auditoria_resultado     ON bib_auditoria(resultado) WHERE resultado = 'error';
CREATE INDEX IF NOT EXISTS idx_bib_auditoria_gravedad      ON bib_auditoria(gravedad) WHERE gravedad IN ('error','critico');
CREATE INDEX IF NOT EXISTS idx_bib_auditoria_usuario       ON bib_auditoria(usuario);

-- Registro de solo lectura desde el frontend: nadie edita ni borra su
-- propio rastro de auditoria. Los inserts de "cambios de datos" los hace
-- el trigger (SECURITY DEFINER, corre con permisos del dueno); los
-- inserts de "eventos de proceso" los hace WebApp_Backend.gs con la
-- service_role key, que siempre ignora RLS.
ALTER TABLE bib_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_select ON bib_auditoria FOR SELECT TO authenticated USING (true);

-- ── Trigger generico de auditoria ──────────────────────────────
-- Ramifica por TG_OP ANTES de tocar NEW/OLD (el patron estandar de
-- Postgres para triggers de auditoria) — evita cualquier ambiguedad
-- sobre si es seguro referenciar un NEW/OLD no asignado para la
-- operacion en curso. Un trigger de auditoria nunca debe poder romper
-- la escritura original que se supone que solo esta observando.
CREATE OR REPLACE FUNCTION bib_fn_auditar()
RETURNS trigger AS $$
DECLARE
  v_usuario     text;
  v_origen      text;
  v_accion      text;
  v_registro_id text;
  v_antes       jsonb;
  v_despues     jsonb;
BEGIN
  BEGIN
    -- auth.jwt()->>'email' en vez de auth.email(): esta ultima no esta
    -- garantizada en todas las versiones de Supabase, leer el claim
    -- directo del JWT si.
    v_usuario := COALESCE(auth.jwt() ->> 'email', 'sistema (GAS)');
    v_origen  := CASE WHEN auth.role() = 'service_role' THEN 'gas' ELSE 'frontend' END;
  EXCEPTION WHEN OTHERS THEN
    -- Fuera del contexto de PostgREST (ej. una migracion corriendo como
    -- postgres) auth.jwt()/auth.role() no existen: no debe romper la
    -- escritura original por un problema de auditoria.
    v_usuario := 'sistema';
    v_origen  := 'trigger';
  END;

  IF TG_OP = 'INSERT' THEN
    v_accion      := 'crear';
    v_despues     := to_jsonb(NEW);
    v_registro_id := v_despues ->> 'id';
  ELSIF TG_OP = 'UPDATE' THEN
    v_accion      := 'editar';
    v_antes       := to_jsonb(OLD);
    v_despues     := to_jsonb(NEW);
    v_registro_id := v_despues ->> 'id';
  ELSE -- DELETE
    v_accion      := 'eliminar';
    v_antes       := to_jsonb(OLD);
    v_registro_id := v_antes ->> 'id';
  END IF;

  INSERT INTO bib_auditoria(usuario, origen, modulo, accion, tabla, registro_id, antes, despues)
  VALUES (v_usuario, v_origen, TG_TABLE_NAME, v_accion, TG_TABLE_NAME, v_registro_id, v_antes, v_despues);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION bib_fn_auditar() SET search_path = public;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bib_solicitudes','bib_documentos','bib_pagos','bib_trabajos_personal',
    'bib_movimientos','bib_prestamos_libros','bib_colaboradores',
    'bib_notif_config','bib_remitentes_autorizados'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditar ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_auditar AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bib_fn_auditar()',
      t
    );
  END LOOP;
END $$;
