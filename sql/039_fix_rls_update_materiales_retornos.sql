-- ============================================================
-- 039: agrega la politica RLS de UPDATE que faltaba en
-- bib_materiales_retornos. La migracion original (016) definio
-- SELECT/INSERT/DELETE para el rol authenticated pero no UPDATE --
-- con RLS habilitado y sin esa politica, el UPDATE de
-- confirmarRetornoMaterial() (js/materiales.js) que marca
-- zaiko_sync_estado='SINCRONIZADO'/'ERROR' tras sincronizar con
-- Zaiko se ejecutaba sin error pero afectaba 0 filas -- el registro
-- quedaba para siempre en 'PENDIENTE', sin importar si la
-- sincronizacion con Zaiko realmente funciono o no.
--
-- Encontrado al simular el ciclo completo consumo -> retorno parcial
-- -> eliminar movimiento: eliminarMovimiento() filtra los retornos
-- por zaiko_sync_estado='SINCRONIZADO' para no restaurar en Zaiko lo
-- que ya se habia devuelto -- con el campo atascado en 'PENDIENTE',
-- ese filtro nunca encontraba nada, y el borrado restauraba la
-- cantidad ENTREGADA completa en vez de solo lo pendiente,
-- duplicando el credito en Zaiko (comprobado con datos reales:
-- NYLON quedo en 5 en vez de 4 tras devolver 1 de 2 y luego
-- eliminar el movimiento).
-- ============================================================

CREATE POLICY auth_update ON bib_materiales_retornos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
