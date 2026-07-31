-- ============================================================
-- 037: puente Zaiko para movimientos de materiales (prestamo/
-- asignacion/consumo) — espejo best-effort igual que el de libros
-- (036_zaiko_bridge_prestamos_libros.sql), pero con tres puntos de
-- sincronizacion en vez de uno, porque el modelo de materiales es
-- distinto al de libros:
--   1. bib_movimiento_materiales: sync de la ENTREGA (salida parcial
--      en Zaiko, una vez por linea, al crear el movimiento).
--   2. bib_materiales_retornos: sync de cada DEVOLUCION PARCIAL por
--      linea (solo aplica a movimientos tipo consumo, que permiten
--      devolver de a poco).
--   3. bib_movimientos: sync de la DEVOLUCION COMPLETA del movimiento
--      (prestamo/asignacion, que se devuelven de una sola vez) — es
--      un resumen en texto porque un movimiento puede tener varias
--      lineas con distinto resultado de sincronizacion.
-- 'SIN_MATCH' (a diferencia de libros) porque muchos materiales reales
-- de Biblioteca todavia no tienen su contraparte creada en Zaiko.
-- ============================================================

ALTER TABLE bib_movimiento_materiales
  ADD COLUMN IF NOT EXISTS zaiko_activo_id text,
  ADD COLUMN IF NOT EXISTS zaiko_sync_estado text DEFAULT 'PENDIENTE'
    CHECK (zaiko_sync_estado = ANY (ARRAY['PENDIENTE','SINCRONIZADO','SIN_MATCH','ERROR'])),
  ADD COLUMN IF NOT EXISTS zaiko_sync_detalle text;

ALTER TABLE bib_materiales_retornos
  ADD COLUMN IF NOT EXISTS zaiko_sync_estado text DEFAULT 'PENDIENTE'
    CHECK (zaiko_sync_estado = ANY (ARRAY['PENDIENTE','SINCRONIZADO','SIN_MATCH','ERROR'])),
  ADD COLUMN IF NOT EXISTS zaiko_sync_detalle text;

ALTER TABLE bib_movimientos
  ADD COLUMN IF NOT EXISTS zaiko_sync_detalle text;

CREATE INDEX IF NOT EXISTS idx_bib_mov_mat_zaiko_activo ON bib_movimiento_materiales(zaiko_activo_id);
