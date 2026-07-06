CREATE OR REPLACE FUNCTION bib_fn_listar_huerfanos_sin_dueno()
RETURNS TABLE(storage_path text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT o.name
    FROM storage.objects o
   WHERE o.bucket_id = 'biblioteca-adjuntos'
     AND NOT EXISTS (SELECT 1 FROM bib_documentos d WHERE d.storage_path = o.name)
     AND NOT EXISTS (
       SELECT 1 FROM bib_solicitudes s
        WHERE s.gmail_message_id = split_part(o.name, '/', 1)
     );
$$;
