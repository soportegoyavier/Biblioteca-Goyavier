-- Activa RLS en las tablas nuevas de Materiales y Prestamos, con el mismo
-- patron de policies que ya usa bib_solicitudes (una policy por operacion,
-- nombradas auth_select/auth_insert/auth_update/auth_delete, aplicadas al
-- rol authenticated). El backend GAS sigue funcionando igual porque usa
-- la service_role key, que siempre ignora RLS.

ALTER TABLE bib_materiales             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bib_movimientos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bib_movimiento_materiales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bib_materiales_retornos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bib_movimientos_historial  ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_select ON bib_materiales FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_materiales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON bib_materiales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON bib_materiales FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_select ON bib_movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_movimientos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON bib_movimientos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON bib_movimientos FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_select ON bib_movimiento_materiales FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_movimiento_materiales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON bib_movimiento_materiales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON bib_movimiento_materiales FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_select ON bib_materiales_retornos FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_materiales_retornos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_delete ON bib_materiales_retornos FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_select ON bib_movimientos_historial FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_movimientos_historial FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_delete ON bib_movimientos_historial FOR DELETE TO authenticated USING (true);

-- Fija el search_path de las funciones nuevas (aviso comun del linter de seguridad de Supabase)
ALTER FUNCTION bib_fn_sumar_retorno_material() SET search_path = public;
ALTER FUNCTION generar_id_movimiento()         SET search_path = public;
