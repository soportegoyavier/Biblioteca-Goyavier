ALTER TABLE bib_documentos
  ADD COLUMN IF NOT EXISTS tipo_papel text DEFAULT 'Bond';
