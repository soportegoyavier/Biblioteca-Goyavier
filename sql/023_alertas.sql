-- 023: Alertas (Fase 3a). Una alerta es un modulo cuyos errores de HOY
-- superan su umbral -- no es un objeto nuevo que haya que crear/guardar/
-- resolver, es una lectura con umbral sobre bib_auditoria. Se calcula
-- en vivo (vista), no se inserta como fila propia: asi nunca puede
-- quedar "pegada" mostrando un problema que ya se resolvio, y no hace
-- falta un flujo de "marcar como leida/resuelta" que nadie pidio.
--
-- gravedad='critico' siempre alerta (umbral 1) sin importar el modulo:
-- ya es la marca que _auditar() usa para "algo salio mal de forma
-- inesperada" (ver 021/WebApp_Backend.gs). El resto de modulos tiene
-- su propio umbral de conteo diario.
CREATE OR REPLACE VIEW bib_vista_alertas AS
WITH umbrales(modulo, umbral) AS (
  VALUES
    ('sincronizacion',  1),  -- cualquier timeout/error de sincronizacion es notable
    ('correo',          3),  -- unos pocos fallos de envio sueltos son normales (correo invalido, etc.)
    ('reconciliacion',  1),
    ('reporte_mensual', 1)
),
conteo_hoy AS (
  SELECT
    modulo,
    count(*)                       AS cantidad,
    max(ocurrido_en)               AS ultimo,
    bool_or(gravedad = 'critico')  AS hay_critico
  FROM bib_auditoria
  WHERE resultado = 'error' AND ocurrido_en > now() - interval '1 day'
  GROUP BY modulo
)
SELECT
  c.modulo,
  c.cantidad,
  coalesce(u.umbral, 5) AS umbral,  -- modulo no listado arriba: umbral generico
  c.ultimo,
  CASE WHEN c.hay_critico THEN 'critico' ELSE 'advertencia' END AS gravedad
FROM conteo_hoy c
LEFT JOIN umbrales u ON u.modulo = c.modulo
WHERE c.hay_critico OR c.cantidad >= coalesce(u.umbral, 5)
ORDER BY c.cantidad DESC;

GRANT SELECT ON bib_vista_alertas TO authenticated;
