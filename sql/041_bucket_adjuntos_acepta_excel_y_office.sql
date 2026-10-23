-- 041: el bucket biblioteca-adjuntos solo aceptaba PDF, Word (.doc/.docx), JPG y PNG.
-- Cualquier otro adjunto (Excel, PowerPoint, OpenDocument, CSV, TXT) se rechazaba con 400 en la
-- subida: la solicitud se guardaba pero el documento quedaba "Sin archivo" (12 Excel desde 2026-06-17).
-- Aplicado en produccion el 2026-10-23. Despues de aplicarlo, correr recuperarAdjuntosFaltantes('2026-06-01')
-- desde el editor de Apps Script para recuperar los historicos.
-- Los archivos nativos de Google (Docs/Forms/Sheets) no son adjuntos descargables y no se cubren aqui.
update storage.buckets set allowed_mime_types = array[
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation',
  'text/csv','text/plain','image/jpeg','image/png','image/webp','image/gif'
] where id = 'biblioteca-adjuntos';
