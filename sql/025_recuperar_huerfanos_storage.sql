CREATE OR REPLACE FUNCTION bib_fn_recuperar_huerfanos()
RETURNS TABLE(storage_path text, solicitud_id bigint, resultado text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r record;
  v_msg_id text;
  v_nombre text;
  v_sol_id bigint;
BEGIN
  FOR r IN
    SELECT o.name, o.metadata
      FROM storage.objects o
     WHERE o.bucket_id = 'biblioteca-adjuntos'
       AND NOT EXISTS (SELECT 1 FROM bib_documentos d WHERE d.storage_path = o.name)
  LOOP
    v_msg_id := split_part(r.name, '/', 1);
    v_nombre := substring(r.name FROM position('/' IN r.name) + 1);
    v_sol_id := NULL;
    SELECT id INTO v_sol_id FROM bib_solicitudes WHERE gmail_message_id = v_msg_id LIMIT 1;

    IF v_sol_id IS NULL THEN
      storage_path := r.name; solicitud_id := NULL; resultado := 'sin_solicitud_coincidente';
      RETURN NEXT;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO bib_documentos (solicitud_id, nombre_archivo, storage_path, tipo_mime, tamano_bytes)
      VALUES (
        v_sol_id, v_nombre, r.name,
        COALESCE(r.metadata->>'mimetype', 'application/octet-stream'),
        COALESCE((r.metadata->>'size')::bigint, 0)
      );
      storage_path := r.name; solicitud_id := v_sol_id; resultado := 'recuperado';
    EXCEPTION WHEN OTHERS THEN
      storage_path := r.name; solicitud_id := v_sol_id; resultado := 'error: ' || SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;
