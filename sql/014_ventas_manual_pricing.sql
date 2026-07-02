-- 014: Ventas — solicitudes manuales y columnas de precio automático

-- Feature 1: marcar solicitudes creadas manualmente (sin correo Gmail)
ALTER TABLE bib_solicitudes
  ADD COLUMN IF NOT EXISTS es_manual BOOLEAN NOT NULL DEFAULT false;

-- Feature 3: auditoría del precio calculado en trabajos personales
ALTER TABLE bib_trabajos_personal
  ADD COLUMN IF NOT EXISTS precio_unitario  INTEGER,
  ADD COLUMN IF NOT EXISTS porcentaje_color SMALLINT,  -- 25 / 50 / 75 / 100 (null si B&N)
  ADD COLUMN IF NOT EXISTS modo_toner       TEXT;      -- 'ahorro' | 'full' (null si B&N)
