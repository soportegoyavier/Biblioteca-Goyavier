CREATE OR REPLACE FUNCTION bib_fn_limpiar_mensajes_ignorados(meses_antiguedad int DEFAULT 12)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_borrados bigint;
BEGIN
  DELETE FROM bib_mensajes_ignorados
   WHERE created_at < now() - (meses_antiguedad || ' months')::interval;
  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END;
$$;

GRANT EXECUTE ON FUNCTION bib_fn_limpiar_mensajes_ignorados(int) TO authenticated;
