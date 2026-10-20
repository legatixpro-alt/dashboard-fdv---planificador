-- ==============================================================================
-- CODIZULCA - SCRIPT SQL CONSOLIDADO DE PRODUCCIÓN (1 SOLO PASO)
-- Proyecto Supabase: nudltbgyewyiklqdyujk
-- Fecha: Octubre 2026
--
-- Instrucciones:
-- 1. Abre https://supabase.com/dashboard/project/nudltbgyewyiklqdyujk/sql/new
-- 2. Pega todo este contenido y presiona "RUN".
-- ==============================================================================

-- 1. TABLA: TRAZABILIDAD DE LOGINS (Auditoría de accesos)
CREATE TABLE IF NOT EXISTS public.trazabilidad_login (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario VARCHAR(255) NOT NULL,
  rol VARCHAR(50) NOT NULL,
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.trazabilidad_login ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir inserciones publicas en trazabilidad" ON public.trazabilidad_login;
CREATE POLICY "Permitir inserciones publicas en trazabilidad" ON public.trazabilidad_login FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura publica en trazabilidad" ON public.trazabilidad_login;
CREATE POLICY "Permitir lectura publica en trazabilidad" ON public.trazabilidad_login FOR SELECT USING (true);


-- 2. TABLA: HISTORIAL DE VENTAS (Carga masiva de 2026.csv - 207,577 registros)
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

ALTER TABLE public.ventas_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura a service_role en ventas_historial" ON public.ventas_historial;
CREATE POLICY "Permitir lectura a service_role en ventas_historial" ON public.ventas_historial FOR ALL USING (true);


-- 3. VISTAS DE CONSULTA PARA ACTIVACIÓN Y VOLUMEN MULTI-MES

CREATE OR REPLACE VIEW public.hist_periodos WITH (security_invoker = true) AS
SELECT DISTINCT ano, mes FROM public.ventas_historial;

CREATE OR REPLACE VIEW public.hist_vendedores WITH (security_invoker = true) AS
SELECT DISTINCT vendedor FROM public.ventas_historial
UNION
SELECT DISTINCT vendedor_nombre FROM public.activacion_clientes WHERE vendedor_nombre IS NOT NULL;

-- Volumen por artículo / mes / vendedor
CREATE OR REPLACE VIEW public.hist_volumen_mes WITH (security_invoker = true) AS
SELECT ano, mes, vendedor, id_articulo, articulo, rubro,
       SUM(cajas)    AS cajas,
       SUM(unidades) AS unidades,
       SUM(kgs)      AS kgs,
       SUM(monto)    AS monto,
       COUNT(*) FILTER (WHERE cajas > 0) AS clientes
FROM public.ventas_historial
GROUP BY ano, mes, vendedor, id_articulo, articulo, rubro;

-- Volumen consolidado de toda la empresa
CREATE OR REPLACE VIEW public.hist_volumen_total_mes WITH (security_invoker = true) AS
SELECT ano, mes, id_articulo, articulo, rubro,
       SUM(cajas_c)    AS cajas,
       SUM(unidades_c) AS unidades,
       SUM(kgs_c)      AS kgs,
       SUM(monto_c)    AS monto,
       COUNT(DISTINCT id_cliente) FILTER (WHERE cajas_c > 0) AS clientes
FROM (
  SELECT ano, mes, id_articulo, articulo, rubro, id_cliente,
         SUM(cajas) AS cajas_c, SUM(unidades) AS unidades_c,
         SUM(kgs)   AS kgs_c,   SUM(monto)    AS monto_c
  FROM public.ventas_historial
  GROUP BY ano, mes, id_articulo, articulo, rubro, id_cliente
) t
GROUP BY ano, mes, id_articulo, articulo, rubro;

-- Activación por cliente / mes / vendedor
CREATE OR REPLACE VIEW public.hist_activacion_cliente_mes WITH (security_invoker = true) AS
SELECT
  ano, mes, id_cliente, cliente, vendedor,
  COALESCE(SUM(cajas) FILTER (WHERE rubro = 'ACEITE'), 0)                        AS cajas_aceite,
  COALESCE(SUM(cajas) FILTER (WHERE rubro = 'AZUCAR'), 0)                        AS cajas_azucar,
  COALESCE(SUM(cajas) FILTER (WHERE rubro = 'POLLO'), 0)                         AS cajas_pollo,
  COALESCE(SUM(cajas) FILTER (WHERE rubro IN ('ESTANDAR_ASTURIAS', 'ESTANDAR Y SUPERIOR ASTURIAS')), 0)  AS cajas_estandar_asturias,
  COALESCE(SUM(cajas) FILTER (WHERE rubro IN ('MORTADELA_SALPICAO', 'MORTADELA SALPICAO Y ASTURIAS')), 0) AS cajas_mortadela_salpicao,
  COALESCE(SUM(kgs), 0)                                                          AS kgs_total,
  COALESCE(SUM(monto), 0)                                                        AS monto_total,
  BOOL_OR(rubro = 'ACEITE'                         AND cajas > 0)                AS has_aceite,
  BOOL_OR(rubro = 'AZUCAR'                         AND cajas > 0)                AS has_azucar,
  BOOL_OR(rubro = 'POLLO'                          AND cajas > 0)                AS has_pollo,
  BOOL_OR(rubro IN ('ESTANDAR_ASTURIAS', 'ESTANDAR Y SUPERIOR ASTURIAS')   AND cajas > 0) AS has_estandar_asturias,
  BOOL_OR(rubro IN ('MORTADELA_SALPICAO', 'MORTADELA SALPICAO Y ASTURIAS') AND cajas > 0) AS has_mortadela_salpicao
FROM public.ventas_historial
GROUP BY ano, mes, id_cliente, cliente, vendedor;

-- Resumen de activación mensual por vendedor
CREATE OR REPLACE VIEW public.hist_activacion_resumen_mes WITH (security_invoker = true) AS
SELECT
  ano, mes, vendedor,
  COUNT(DISTINCT id_cliente)                                                     AS clientes_con_compra,
  COUNT(DISTINCT id_cliente) FILTER (WHERE has_aceite)                           AS act_aceite,
  COUNT(DISTINCT id_cliente) FILTER (WHERE has_azucar)                           AS act_azucar,
  COUNT(DISTINCT id_cliente) FILTER (WHERE has_pollo)                            AS act_pollo,
  COUNT(DISTINCT id_cliente) FILTER (WHERE has_estandar_asturias)                 AS act_estandar_asturias,
  COUNT(DISTINCT id_cliente) FILTER (WHERE has_mortadela_salpicao)               AS act_mortadela_salpicao,
  COUNT(DISTINCT id_cliente) FILTER (
    WHERE (has_aceite::int + has_azucar::int + has_pollo::int +
           has_estandar_asturias::int + has_mortadela_salpicao::int) >= 3
  )                                                                              AS clientes_3_o_mas_rubros,
  SUM(cajas_aceite)                                                              AS cajas_aceite,
  SUM(cajas_azucar)                                                              AS cajas_azucar,
  SUM(cajas_pollo)                                                               AS cajas_pollo,
  SUM(cajas_estandar_asturias)                                                   AS cajas_estandar_asturias,
  SUM(cajas_mortadela_salpicao)                                                 AS cajas_mortadela_salpicao,
  SUM(kgs_total)                                                                 AS kgs_total,
  SUM(monto_total)                                                               AS monto_total
FROM public.hist_activacion_cliente_mes
GROUP BY ano, mes, vendedor;
