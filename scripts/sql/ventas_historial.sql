-- ==============================================================
-- HISTORIAL DE VENTAS (carga de 2026.csv)  ·  ejecutar UNA vez en Supabase > SQL Editor
-- Es seguro re-ejecutarlo: usa IF NOT EXISTS / CREATE OR REPLACE.
-- No toca ninguna tabla existente (solo LEE activacion_clientes).
-- ==============================================================

-- 1. TABLA BASE: una fila por (mes, cliente, vendedor, artículo) con valores NETOS
--    (facturas FA suman, devoluciones DV restan).
CREATE TABLE IF NOT EXISTS public.ventas_historial (
    ano         SMALLINT      NOT NULL,
    mes         SMALLINT      NOT NULL CHECK (mes BETWEEN 1 AND 12),
    id_cliente  TEXT          NOT NULL,
    cliente     TEXT          NOT NULL,
    id_vendedor TEXT          NOT NULL,
    vendedor    TEXT          NOT NULL,
    id_articulo TEXT          NOT NULL,
    articulo    TEXT          NOT NULL,
    rubro       TEXT          NOT NULL DEFAULT 'OTROS',
    cajas       NUMERIC(14,2) NOT NULL DEFAULT 0,
    unidades    NUMERIC(14,2) NOT NULL DEFAULT 0,
    kgs         NUMERIC(14,2) NOT NULL DEFAULT 0,
    monto       NUMERIC(16,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (ano, mes, id_cliente, id_vendedor, id_articulo)
);

CREATE INDEX IF NOT EXISTS idx_vh_vendedor      ON public.ventas_historial (vendedor, ano, mes);
CREATE INDEX IF NOT EXISTS idx_vh_cliente       ON public.ventas_historial (id_cliente, ano, mes);
CREATE INDEX IF NOT EXISTS idx_vh_periodo_rubro ON public.ventas_historial (ano, mes, rubro);

-- Seguridad: datos comerciales sensibles. Solo el servidor (service_role) puede leerlos;
-- la clave anónima del navegador NO tiene acceso.
ALTER TABLE public.ventas_historial ENABLE ROW LEVEL SECURITY;

-- 2. VISTAS DE CONSULTA (security_invoker = respetan el RLS de la tabla base)

CREATE OR REPLACE VIEW public.hist_periodos WITH (security_invoker = true) AS
SELECT DISTINCT ano, mes FROM public.ventas_historial;

-- Nombres de vendedor tal como aparecen en ventas Y en la cartera actual (el servidor los usa para filtrar por ruta)
CREATE OR REPLACE VIEW public.hist_vendedores WITH (security_invoker = true) AS
SELECT DISTINCT vendedor FROM public.ventas_historial
UNION
SELECT DISTINCT vendedor_nombre FROM public.activacion_clientes WHERE vendedor_nombre IS NOT NULL;

-- 2a. Volumen por artículo / mes / vendedor (quién vendió)
CREATE OR REPLACE VIEW public.hist_volumen_mes WITH (security_invoker = true) AS
SELECT ano, mes, vendedor, id_articulo, articulo, rubro,
       SUM(cajas)    AS cajas,
       SUM(unidades) AS unidades,
       SUM(kgs)      AS kgs,
       SUM(monto)    AS monto,
       COUNT(*) FILTER (WHERE cajas > 0) AS clientes
FROM public.ventas_historial
GROUP BY ano, mes, vendedor, id_articulo, articulo, rubro;

-- 2b. Igual pero consolidado de TODA la empresa (cuenta cada cliente una sola vez por artículo)
CREATE OR REPLACE VIEW public.hist_volumen_total_mes WITH (security_invoker = true) AS
SELECT ano, mes, id_articulo, articulo, rubro,
       SUM(cajas_c)    AS cajas,
       SUM(unidades_c) AS unidades,
       SUM(kgs_c)      AS kgs,
       SUM(monto_c)    AS monto,
       COUNT(*) FILTER (WHERE cajas_c > 0) AS clientes
FROM (
    SELECT ano, mes, id_cliente, id_articulo, articulo, rubro,
           SUM(cajas)    AS cajas_c,
           SUM(unidades) AS unidades_c,
           SUM(kgs)      AS kgs_c,
           SUM(monto)    AS monto_c
    FROM public.ventas_historial
    GROUP BY ano, mes, id_cliente, id_articulo, articulo, rubro
) t
GROUP BY ano, mes, id_articulo, articulo, rubro;

-- 2c. Activación por CLIENTE / mes. El vendedor es el de la CARTERA ACTUAL
--     (activacion_clientes); si el cliente no está en cartera, el que más le vendió.
--     Un rubro cuenta como "comprado" si algún artículo del rubro tuvo cajas netas > 0 en el mes
--     (una devolución de otro mes no anula una compra de este mes).
CREATE OR REPLACE VIEW public.hist_activacion_cliente_mes WITH (security_invoker = true) AS
WITH ventas AS (
    SELECT ano, mes, id_cliente,
           MAX(cliente) AS cliente,
           SUM(CASE WHEN rubro = 'ACEITE'             THEN GREATEST(cajas, 0) ELSE 0 END) AS cajas_aceite,
           SUM(CASE WHEN rubro = 'AZUCAR'             THEN GREATEST(cajas, 0) ELSE 0 END) AS cajas_azucar,
           SUM(CASE WHEN rubro = 'POLLO'              THEN GREATEST(cajas, 0) ELSE 0 END) AS cajas_pollo,
           SUM(CASE WHEN rubro = 'ESTANDAR_ASTURIAS'  THEN GREATEST(cajas, 0) ELSE 0 END) AS cajas_estandar_asturias,
           SUM(CASE WHEN rubro = 'MORTADELA_SALPICAO' THEN GREATEST(cajas, 0) ELSE 0 END) AS cajas_mortadela_salpicao,
           SUM(kgs)   AS kgs,
           SUM(monto) AS monto,
           (ARRAY_AGG(vendedor ORDER BY monto DESC))[1] AS vendedor_venta
    FROM public.ventas_historial
    GROUP BY ano, mes, id_cliente
),
cartera AS (
    SELECT DISTINCT ON (LTRIM(cliente_codigo, '0'))
           LTRIM(cliente_codigo, '0') AS k, cliente_nombre, vendedor_nombre
    FROM public.activacion_clientes
    ORDER BY LTRIM(cliente_codigo, '0'), id DESC
)
SELECT v.ano, v.mes, v.id_cliente,
       COALESCE(c.cliente_nombre, v.cliente)    AS cliente,
       COALESCE(c.vendedor_nombre, v.vendedor_venta) AS vendedor,
       (c.k IS NOT NULL)                        AS en_cartera,
       v.cajas_aceite, v.cajas_azucar, v.cajas_pollo,
       v.cajas_estandar_asturias, v.cajas_mortadela_salpicao,
       v.kgs, v.monto
FROM ventas v
LEFT JOIN cartera c ON c.k = LTRIM(v.id_cliente, '0');

-- 2d. Resumen de activación por vendedor / mes (solo clientes de cartera, para que % <= 100)
CREATE OR REPLACE VIEW public.hist_activacion_resumen_mes WITH (security_invoker = true) AS
SELECT ano, mes, vendedor,
       COUNT(*) FILTER (WHERE en_cartera AND cajas_aceite > 0)             AS act_aceite,
       COUNT(*) FILTER (WHERE en_cartera AND cajas_azucar > 0)             AS act_azucar,
       COUNT(*) FILTER (WHERE en_cartera AND cajas_pollo > 0)              AS act_pollo,
       COUNT(*) FILTER (WHERE en_cartera AND cajas_estandar_asturias > 0)  AS act_estandar_asturias,
       COUNT(*) FILTER (WHERE en_cartera AND cajas_mortadela_salpicao > 0) AS act_mortadela_salpicao,
       COUNT(*) FILTER (WHERE en_cartera AND
           (cajas_aceite + cajas_azucar + cajas_pollo + cajas_estandar_asturias + cajas_mortadela_salpicao) > 0) AS act_total,
       COUNT(*) FILTER (WHERE en_cartera)     AS clientes_con_movimiento,
       COUNT(*) FILTER (WHERE NOT en_cartera) AS clientes_fuera_cartera
FROM public.hist_activacion_cliente_mes
GROUP BY ano, mes, vendedor;

-- 3. Cerrar el acceso público a todo lo nuevo (solo service_role)
REVOKE ALL ON public.ventas_historial            FROM anon, authenticated;
REVOKE ALL ON public.hist_periodos               FROM anon, authenticated;
REVOKE ALL ON public.hist_vendedores             FROM anon, authenticated;
REVOKE ALL ON public.hist_volumen_mes            FROM anon, authenticated;
REVOKE ALL ON public.hist_volumen_total_mes      FROM anon, authenticated;
REVOKE ALL ON public.hist_activacion_cliente_mes FROM anon, authenticated;
REVOKE ALL ON public.hist_activacion_resumen_mes FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
