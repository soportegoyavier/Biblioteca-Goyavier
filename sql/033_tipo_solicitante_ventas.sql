-- 033: Ventas necesita distinguir estudiante/colaborador/externo al crear
-- una solicitud manual (antes solo pedia nombre+email libres). "area" ya
-- existia en bib_solicitudes (usada hoy por Gestion de Copias para el area
-- del colaborador institucional) -- se reusa con el mismo sentido cuando el
-- solicitante de Ventas es colaborador. "grado" es nuevo, solo aplica a
-- estudiante/externo (curso o referencia libre, puede quedar vacio).
ALTER TABLE bib_solicitudes
  ADD COLUMN IF NOT EXISTS tipo_solicitante text
    CHECK (tipo_solicitante IN ('estudiante','colaborador','externo')),
  ADD COLUMN IF NOT EXISTS grado text;
