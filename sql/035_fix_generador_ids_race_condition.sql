-- 035: generar_id_movimiento() y generar_id_prestamo_libro() calculaban
-- el siguiente numero con COUNT(*)+1 sobre bib_movimientos/bib_prestamos_libros.
-- Eso no es atomico: si dos personas guardan casi al mismo tiempo (o hay un
-- reintento de red), ambas transacciones pueden contar las mismas filas
-- ANTES de que la primera termine de insertar, y las dos calculan el mismo
-- ID -> "duplicate key value violates unique constraint
-- bib_movimientos_id_movimiento_key" (visto en produccion, Julio 2026).
--
-- Fix: un contador real en tabla, incrementado con INSERT ... ON CONFLICT
-- DO UPDATE. Postgres toma un lock de fila en el UPSERT, asi que llamadas
-- concurrentes se serializan solas y nunca devuelven el mismo numero --
-- a diferencia de un SELECT COUNT(*) suelto, que no bloquea nada.
--
-- generar_id_solicitud() tiene pinta del mismo problema pero no vive en
-- este repo (schema base pre-migraciones, ver nota en 015) -- no se toca
-- aqui porque no se puede versionar un CREATE OR REPLACE de algo que no
-- se puede leer primero.

CREATE TABLE IF NOT EXISTS bib_contadores_id (
  prefijo  text NOT NULL,
  ano      int  NOT NULL,
  contador int  NOT NULL DEFAULT 0,
  PRIMARY KEY (prefijo, ano)
);
ALTER TABLE bib_contadores_id ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_select ON bib_contadores_id FOR SELECT TO authenticated USING (true);

-- Semilla: arrancar cada contador donde va cada serie hoy, para no repetir
-- IDs ya usados en el año actual.
INSERT INTO bib_contadores_id (prefijo, ano, contador)
SELECT 'MOV', extract(year from now())::int, count(*)
  FROM bib_movimientos WHERE created_at >= date_trunc('year', now())
ON CONFLICT (prefijo, ano) DO NOTHING;

INSERT INTO bib_contadores_id (prefijo, ano, contador)
SELECT 'LIB', extract(year from now())::int, count(*)
  FROM bib_prestamos_libros WHERE created_at >= date_trunc('year', now())
ON CONFLICT (prefijo, ano) DO NOTHING;

CREATE OR REPLACE FUNCTION generar_id_movimiento()
RETURNS text AS $$
DECLARE
  ano_actual int := extract(year from now())::int;
  n int;
BEGIN
  INSERT INTO bib_contadores_id (prefijo, ano, contador)
  VALUES ('MOV', ano_actual, 1)
  ON CONFLICT (prefijo, ano) DO UPDATE SET contador = bib_contadores_id.contador + 1
  RETURNING contador INTO n;
  RETURN 'MOV-' || ano_actual || '-' || lpad(n::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
ALTER FUNCTION generar_id_movimiento() SET search_path = public;

CREATE OR REPLACE FUNCTION generar_id_prestamo_libro()
RETURNS text AS $$
DECLARE
  ano_actual int := extract(year from now())::int;
  n int;
BEGIN
  INSERT INTO bib_contadores_id (prefijo, ano, contador)
  VALUES ('LIB', ano_actual, 1)
  ON CONFLICT (prefijo, ano) DO UPDATE SET contador = bib_contadores_id.contador + 1
  RETURNING contador INTO n;
  RETURN 'LIB-' || ano_actual || '-' || lpad(n::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
ALTER FUNCTION generar_id_prestamo_libro() SET search_path = public;
