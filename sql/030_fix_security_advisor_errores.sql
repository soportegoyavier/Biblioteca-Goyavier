-- 030: los dos hallazgos ERROR del Security Advisor que 029 no cubria.
--
-- 1) "Security Definer View": toda vista de Postgres, por defecto, resuelve
--    los permisos de sus tablas contra el DUENO de la vista, no contra quien
--    la consulta -- eso es lo que el linter llama "security definer" para
--    vistas (no tiene relacion con las funciones SECURITY DEFINER de 029).
--    security_invoker=on invierte eso: la vista pasa a chequear RLS contra
--    el usuario real que hace la consulta. Seguro aqui porque cada tabla
--    detras de estas vistas ya tiene policy permisiva para authenticated
--    (bib_auditoria, bib_solicitudes, bib_trabajos_personal, etc. -- son las
--    mismas tablas que ya se leen directo desde el frontend hoy). La unica
--    que llama a una funcion (bib_fn_storage_stats, dentro de bib_vista_salud)
--    no se ve afectada: esa funcion sigue siendo SECURITY DEFINER por su
--    cuenta, independiente de este cambio.
ALTER VIEW bib_vista_salud                 SET (security_invoker = on);
ALTER VIEW bib_vista_alertas               SET (security_invoker = on);
ALTER VIEW bib_vista_huerfanos              SET (security_invoker = on);
ALTER VIEW bib_vista_deudas_detalle        SET (security_invoker = on);
ALTER VIEW bib_vista_deudas                SET (security_invoker = on);
ALTER VIEW bib_vista_remitentes_historicos SET (security_invoker = on);

-- 2) bib_tipos_copia (012) se creo sin RLS -- unica tabla bib_* sin ella.
--    Mismo patron permisivo-para-authenticated que el resto del proyecto.
--    Sin policy de DELETE: js/notif.js nunca borra, solo hace soft-delete
--    via UPDATE activo=false (toggleTipoCopia).
ALTER TABLE bib_tipos_copia ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_select ON bib_tipos_copia FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_tipos_copia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON bib_tipos_copia FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
