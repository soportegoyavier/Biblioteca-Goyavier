-- Modulo Materiales y Prestamos - Fase 1 (capa 1: esquema base)
-- No es un inventario, solo registra movimientos. El inventario oficial
-- del colegio es Zaiko (proyecto Supabase distinto, sin relacion de FK
-- posible). external_id queda preparado para una futura integracion.
--
-- IMPORTANTE antes de correr esto en el dashboard de Supabase:
--   1. Revisar el formato real de generar_id_solicitud() y ajustar
--      generar_id_movimiento() mas abajo si hace falta.
--   2. Revisar las RLS policies existentes en las tablas bib_* y
--      replicar el mismo nivel de permisividad en las tablas nuevas.

-- Catalogo reutilizable de materiales (NO representa existencias)
CREATE TABLE IF NOT EXISTS bib_materiales (
  id                     serial PRIMARY KEY,
  nombre                 text NOT NULL UNIQUE,
  unidad_medida_default  text,
  marca                  text,
  color                  text,
  tamano                 text,
  presentacion           text,
  referencia             text,
  external_id            text,
  activo                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Movimiento principal
CREATE TABLE IF NOT EXISTS bib_movimientos (
  id                         serial PRIMARY KEY,
  id_movimiento              text UNIQUE,
  tipo                       text NOT NULL CHECK (tipo IN ('prestamo','asignacion','consumo')),
  colaborador_id             bigint REFERENCES bib_colaboradores(id),
  colaborador_nombre         text,
  colaborador_email          text,
  area                       text,
  usuario_registro           text,
  observaciones              text,
  estado                     text NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente','recibido','preparado','entregado','cancelado')),
  fecha_limite_devolucion    date,
  hora_estimada              time,
  fecha_devolucion_real      timestamptz,
  usuario_recibio_devolucion text,
  notas_devolucion           text,
  origen                     text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','correo')),
  solicitud_id               bigint REFERENCES bib_solicitudes(id),
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bib_movimientos_tipo_estado   ON bib_movimientos(tipo, estado);
CREATE INDEX IF NOT EXISTS idx_bib_movimientos_fecha_limite  ON bib_movimientos(fecha_limite_devolucion) WHERE tipo = 'prestamo';

-- Lineas de material dentro de un movimiento
CREATE TABLE IF NOT EXISTS bib_movimiento_materiales (
  id                  serial PRIMARY KEY,
  movimiento_id       bigint NOT NULL REFERENCES bib_movimientos(id) ON DELETE CASCADE,
  material_id         bigint REFERENCES bib_materiales(id),
  nombre              text NOT NULL,          -- snapshot del nombre al momento del movimiento
  cantidad_entregada  numeric NOT NULL,
  unidad_medida       text NOT NULL,
  cantidad_devuelta   numeric NOT NULL DEFAULT 0,
  marca               text,
  color               text,
  tamano              text,
  presentacion        text,
  referencia          text,
  observaciones       text
);

-- Auditoria de retornos parciales de material no consumido
CREATE TABLE IF NOT EXISTS bib_materiales_retornos (
  id                     serial PRIMARY KEY,
  movimiento_material_id bigint NOT NULL REFERENCES bib_movimiento_materiales(id) ON DELETE CASCADE,
  cantidad               numeric NOT NULL,
  fecha                  timestamptz NOT NULL DEFAULT now(),
  usuario                text,
  observaciones          text
);

-- Cada retorno registrado suma automaticamente a cantidad_devuelta de la linea
CREATE OR REPLACE FUNCTION bib_fn_sumar_retorno_material()
RETURNS trigger AS $$
BEGIN
  UPDATE bib_movimiento_materiales
     SET cantidad_devuelta = cantidad_devuelta + NEW.cantidad
   WHERE id = NEW.movimiento_material_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sumar_retorno_material ON bib_materiales_retornos;
CREATE TRIGGER trg_sumar_retorno_material
  AFTER INSERT ON bib_materiales_retornos
  FOR EACH ROW EXECUTE FUNCTION bib_fn_sumar_retorno_material();

-- Historial de estados de movimientos (espejo de bib_historial_estados)
CREATE TABLE IF NOT EXISTS bib_movimientos_historial (
  id               serial PRIMARY KEY,
  movimiento_id    bigint NOT NULL REFERENCES bib_movimientos(id) ON DELETE CASCADE,
  estado_anterior  text,
  estado_nuevo     text,
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ID legible de movimiento (verificar formato real de generar_id_solicitud)
CREATE OR REPLACE FUNCTION generar_id_movimiento()
RETURNS text AS $$
DECLARE
  nuevo_id text;
BEGIN
  SELECT 'MOV-' || to_char(now(), 'YYYY') || '-' || lpad((COUNT(*) + 1)::text, 5, '0')
    INTO nuevo_id
    FROM bib_movimientos
   WHERE created_at >= date_trunc('year', now());
  RETURN nuevo_id;
END;
$$ LANGUAGE plpgsql;
