-- Submodulo de Libros dentro de Materiales y Prestamos. Tampoco es un
-- inventario: solo registra movimientos de prestamo de libros.

CREATE TABLE IF NOT EXISTS bib_libros (
  id          serial PRIMARY KEY,
  titulo      text NOT NULL,
  editorial   text,
  area        text,
  codigo      text,
  external_id text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bib_prestamos_libros (
  id                         serial PRIMARY KEY,
  id_prestamo                text UNIQUE,
  libro_id                   bigint REFERENCES bib_libros(id),
  libro_titulo               text NOT NULL,
  tipo_prestatario           text NOT NULL CHECK (tipo_prestatario IN ('estudiante','colaborador','institucional')),
  prestatario_nombre         text NOT NULL,
  prestatario_email          text,
  prestatario_curso          text,
  es_institucional           boolean NOT NULL DEFAULT false,
  usuario_registro           text,
  observaciones              text,
  recepcion_confirmada       boolean DEFAULT false,
  recepcion_confirmada_en    timestamptz,
  fecha_prestamo             timestamptz NOT NULL DEFAULT now(),
  fecha_limite_devolucion    date,
  fecha_devolucion_real      timestamptz,
  usuario_recibio_devolucion text,
  notas_devolucion           text,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bib_prestamos_libros_fecha_limite
  ON bib_prestamos_libros(fecha_limite_devolucion) WHERE es_institucional = false;

CREATE OR REPLACE FUNCTION generar_id_prestamo_libro()
RETURNS text AS $$
DECLARE
  nuevo_id text;
BEGIN
  SELECT 'LIB-' || to_char(now(), 'YYYY') || '-' || lpad((COUNT(*) + 1)::text, 5, '0')
    INTO nuevo_id
    FROM bib_prestamos_libros
   WHERE created_at >= date_trunc('year', now());
  RETURN nuevo_id;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION generar_id_prestamo_libro() SET search_path = public;

ALTER TABLE bib_libros            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bib_prestamos_libros  ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_select ON bib_libros FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_libros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON bib_libros FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON bib_libros FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_select ON bib_prestamos_libros FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON bib_prestamos_libros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON bib_prestamos_libros FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON bib_prestamos_libros FOR DELETE TO authenticated USING (true);
