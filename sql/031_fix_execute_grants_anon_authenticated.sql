-- 031: 029 revoco EXECUTE solo de PUBLIC, pero Supabase le da a "anon" y
-- "authenticated" su propio grant directo sobre cada funcion nueva del
-- schema public (via ALTER DEFAULT PRIVILEGES del proyecto) -- separado
-- del de PUBLIC. Por eso el Advisor seguia mostrando las 7 funciones
-- igual despues de 029: revocarle a PUBLIC no les toca su grant propio.
-- Aqui se revoca de los tres roles explicitamente.

-- Sin acceso desde el frontend (solo GAS/service_role, que ignora esto):
REVOKE EXECUTE ON FUNCTION bib_fn_auditar()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION bib_fn_reconciliar_storage()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION bib_fn_recuperar_huerfanos()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION bib_fn_listar_huerfanos_sin_dueno() FROM PUBLIC, anon, authenticated;

-- Si las llama el frontend (Salud/Diagnostico/Mantenimiento): sin anon, con authenticated.
REVOKE EXECUTE ON FUNCTION bib_fn_storage_stats()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION bib_fn_verificar_constraints()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION bib_fn_limpiar_mensajes_ignorados(integer)   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION bib_fn_storage_stats()                     TO authenticated;
GRANT EXECUTE ON FUNCTION bib_fn_verificar_constraints()             TO authenticated;
GRANT EXECUTE ON FUNCTION bib_fn_limpiar_mensajes_ignorados(integer) TO authenticated;
