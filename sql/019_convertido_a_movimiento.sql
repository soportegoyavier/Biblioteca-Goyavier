-- Permite marcar una solicitud de correo como ya enviada al modulo de
-- Materiales, para no poder convertirla dos veces desde "Enviar a Materiales".
ALTER TABLE bib_solicitudes
  ADD COLUMN IF NOT EXISTS convertido_a_movimiento boolean NOT NULL DEFAULT false;
