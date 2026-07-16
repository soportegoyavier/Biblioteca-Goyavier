-- 036: 035 dejo bib_contadores_id con RLS activado pero solo politica de
-- SELECT. generar_id_movimiento()/generar_id_prestamo_libro() corren como
-- SECURITY INVOKER (default), asi que el INSERT ... ON CONFLICT DO UPDATE
-- que hacen adentro queda sujeto a RLS -- sin politica de escritura, Postgres
-- lo rechaza ("new row violates row-level security policy"). Ese error si
-- ocurre, pero js/materiales.js nunca revisa el .error del rpc() (ver
-- guardarMovimiento/guardarPrestamoLibro), asi que queda silencioso y el
-- movimiento se guarda con id_movimiento = null. Mismo patron
-- auth_insert/auth_update que el resto de tablas bib_* (ver 018, 032).

CREATE POLICY auth_insert ON bib_contadores_id FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON bib_contadores_id FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
