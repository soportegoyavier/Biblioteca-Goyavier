ALTER FUNCTION bib_fn_verificar_constraints() SET search_path = public;
ALTER FUNCTION bib_fn_listar_huerfanos_sin_dueno() SET search_path = public;
ALTER FUNCTION bib_fn_storage_stats() SET search_path = public;
ALTER FUNCTION bib_fn_limpiar_mensajes_ignorados(integer) SET search_path = public;
ALTER FUNCTION bib_fn_recuperar_huerfanos() SET search_path = public;

REVOKE EXECUTE ON FUNCTION bib_fn_auditar() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bib_fn_reconciliar_storage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bib_fn_recuperar_huerfanos() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bib_fn_listar_huerfanos_sin_dueno() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bib_fn_storage_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bib_fn_verificar_constraints() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bib_fn_limpiar_mensajes_ignorados(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION bib_fn_storage_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION bib_fn_verificar_constraints() TO authenticated;
GRANT EXECUTE ON FUNCTION bib_fn_limpiar_mensajes_ignorados(integer) TO authenticated;
