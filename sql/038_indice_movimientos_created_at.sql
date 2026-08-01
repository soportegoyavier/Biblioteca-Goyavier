-- ============================================================
-- 038: indice para el orden que ya usa renderMovimientos() en
-- materiales.js -- ORDER BY created_at DESC LIMIT 200, sin filtro.
-- Sin este indice, cada carga de la pestana "Movimientos" obliga a
-- ordenar toda la tabla desde cero. Correr manualmente en Supabase
-- (proyecto Biblioteca), igual que el resto de sql/*.sql.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bib_movimientos_created_at
  ON bib_movimientos(created_at DESC);
