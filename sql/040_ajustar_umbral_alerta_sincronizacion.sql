-- 040: sube el umbral de alerta de 'sincronizacion' de 1 a 2 errores/dia.
--
-- Contexto: sincronizarCorreos() ahora reintenta (WebApp_Backend.gs,
-- _sincronizarCorreosConReintento) los errores transitorios conocidos de
-- Gmail (limite de tasa/cuota momentaneo) y, si persisten tras los
-- reintentos, los registra como gravedad='advertencia' en vez de
-- 'critico'. Pero bib_vista_alertas (023_alertas.sql) disparaba la
-- alerta diaria con cantidad >= umbral SIN mirar la gravedad -- con
-- umbral=1, un solo error transitorio ya degradado igual seguia
-- disparando el correo todos los dias que Gmail tuviera un hipo,
-- exactamente el ruido que se queria evitar.
--
-- Con umbral=2, un unico transitorio aislado ya no alerta solo, pero
-- cualquier excepcion no reconocida como transitoria sigue quedando
-- gravedad='critico' -- y esa siempre dispara la alerta sin importar el
-- umbral (bool_or(gravedad = 'critico'), ver WHERE de la vista), asi que
-- un bug real no pasa desapercibido.
CREATE OR REPLACE VIEW bib_vista_alertas AS
WITH umbrales(modulo, umbral) AS (
  VALUES
    ('sincronizacion',  2),  -- un transitorio aislado (ya en advertencia) no alerta solo; 2+ si
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
