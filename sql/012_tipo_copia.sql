-- Catálogo extensible de tipos de copia
CREATE TABLE IF NOT EXISTS bib_tipos_copia (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  activo boolean DEFAULT true,
  orden  int DEFAULT 0
);

INSERT INTO bib_tipos_copia (nombre, orden) VALUES
  ('General', 0),
  ('Institucional', 1),
  ('Curso de inglés', 2)
ON CONFLICT (nombre) DO NOTHING;

-- Columna en solicitudes
ALTER TABLE bib_solicitudes
  ADD COLUMN IF NOT EXISTS tipo_copia text DEFAULT 'General';
