-- Agrega campos de confirmación de recepción a bib_solicitudes
ALTER TABLE bib_solicitudes
  ADD COLUMN IF NOT EXISTS recepcion_confirmada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recepcion_confirmada_en timestamptz;
