-- Permite confirmar recepcion de materiales entregados (igual que ya existe
-- en bib_solicitudes para Gestion de Copias), via el boton del correo.

ALTER TABLE bib_movimientos
  ADD COLUMN IF NOT EXISTS recepcion_confirmada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recepcion_confirmada_en timestamptz;
