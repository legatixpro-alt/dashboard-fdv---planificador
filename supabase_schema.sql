-- ==============================================================
-- CODIZULCA - ESQUEMA INTEGRAL UNIFICADO EN SUPABASE (POSTGRESQL)
-- Proyecto: nudltbgyewyiklqdyujk
-- ==============================================================

-- 1. EXTENSIÓN PARA UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================
-- 2. TABLA: USUARIOS (Autenticación y Roles)
-- ==============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'VENDEDOR' CHECK (role IN ('ADMIN', 'VENDEDOR')),
    vendor_id TEXT NOT NULL,
    nombre_completo TEXT,
    email TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_username ON public.usuarios(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_vendor_id ON public.usuarios(vendor_id);

-- ==============================================================
-- 3. TABLA: DEGUSTACIONES (Trade Marketing)
-- ==============================================================
CREATE TABLE IF NOT EXISTS public.degustaciones (
    id TEXT PRIMARY KEY,
    cliente_codigo TEXT DEFAULT 'PDV',
    cliente_nombre TEXT NOT NULL,
    vendedor_nombre TEXT NOT NULL,
    vendedor_id TEXT NOT NULL,
    vendedor_email TEXT,
    ruta TEXT,
    fecha DATE NOT NULL,
    turno TEXT NOT NULL CHECK (turno IN ('MAÑANA', 'TARDE', 'COMPLETO')),
    hora TEXT,
    productos TEXT[] DEFAULT '{}',
    kilos_estimados NUMERIC(10, 2) DEFAULT 0,
    personas_estimadas INTEGER DEFAULT 0,
    requiere_promotora BOOLEAN DEFAULT false,
    promotora_asignada TEXT DEFAULT '',
    material_pop BOOLEAN DEFAULT false,
    contacto_punto TEXT,
    telefono_contacto TEXT,
    observaciones TEXT,
    estado TEXT DEFAULT 'SOLICITADA' CHECK (estado IN ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'REALIZADA', 'CANCELADA')),
    notas_trade_marketing TEXT,
    resultado JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_degustaciones_fecha ON public.degustaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_degustaciones_vendedor ON public.degustaciones(vendedor_nombre);
CREATE INDEX IF NOT EXISTS idx_degustaciones_estado ON public.degustaciones(estado);

-- ==============================================================
-- 4. TABLA: PEDIDOS ALKOSTO (Cuentas Clave 2 - Sairú Valles)
-- ==============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_alkosto (
    id TEXT PRIMARY KEY,
    numero_pedido TEXT,
    correlativo TEXT,
    orden_compra_alkosto TEXT,
    sucursal_codigo TEXT,
    sucursal_nombre TEXT NOT NULL,
    vendedora TEXT DEFAULT 'SAIRU VALLES',
    ruta TEXT DEFAULT 'CUENTAS CLAVE 2',
    fecha_pedido DATE,
    fecha_entrega DATE,
    total_bultos NUMERIC(10, 2) DEFAULT 0,
    total_kilos NUMERIC(10, 2) DEFAULT 0,
    total_usd NUMERIC(10, 2) DEFAULT 0,
    condicion_pago TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    observaciones TEXT,
    status TEXT DEFAULT 'PENDIENTE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alkosto_fecha ON public.pedidos_alkosto(fecha_pedido);
CREATE INDEX IF NOT EXISTS idx_alkosto_sucursal ON public.pedidos_alkosto(sucursal_codigo);

-- ==============================================================
-- 5. TABLA: VENTAS Y VOLUMEN POR SKU (Sustituye 'Volumen por SKU')
-- ==============================================================
CREATE TABLE IF NOT EXISTS public.ventas_volumen (
    id BIGSERIAL PRIMARY KEY,
    periodo TEXT NOT NULL, -- Ej: '2026-10'
    vendedor_id TEXT NOT NULL,
    vendedor_nombre TEXT NOT NULL,
    sku TEXT NOT NULL,
    articulo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    meta_kg NUMERIC(12, 2) DEFAULT 0,
    ejecutado_kg NUMERIC(12, 2) DEFAULT 0,
    zona TEXT DEFAULT 'General',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_volumen_vendedor ON public.ventas_volumen(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_volumen_periodo ON public.ventas_volumen(periodo);
CREATE INDEX IF NOT EXISTS idx_volumen_sku ON public.ventas_volumen(sku);

-- ==============================================================
-- 6. TABLA: ACTIVACIÓN POR CLIENTE (Sustituye 'Activación por Cliente')
-- ==============================================================
CREATE TABLE IF NOT EXISTS public.activacion_clientes (
    id BIGSERIAL PRIMARY KEY,
    periodo TEXT NOT NULL, -- Ej: '2026-10'
    cliente_codigo TEXT NOT NULL,
    cliente_nombre TEXT NOT NULL,
    vendedor_id TEXT NOT NULL,
    vendedor_nombre TEXT,
    status TEXT DEFAULT 'INACTIVO' CHECK (status IN ('ACTIVO', 'INACTIVO')),
    cajas_aceite NUMERIC(10, 2) DEFAULT 0,
    cajas_azucar NUMERIC(10, 2) DEFAULT 0,
    cajas_pollo NUMERIC(10, 2) DEFAULT 0,
    cajas_estandar_asturias NUMERIC(10, 2) DEFAULT 0,
    cajas_mortadela_salpicao NUMERIC(10, 2) DEFAULT 0,
    has_aceite BOOLEAN DEFAULT false,
    has_azucar BOOLEAN DEFAULT false,
    has_pollo BOOLEAN DEFAULT false,
    has_estandar_asturias BOOLEAN DEFAULT false,
    has_mortadela_salpicao BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activacion_cliente ON public.activacion_clientes(cliente_codigo);
CREATE INDEX IF NOT EXISTS idx_activacion_vendedor ON public.activacion_clientes(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_activacion_periodo ON public.activacion_clientes(periodo);

-- ==============================================================
-- 7. TABLA: METAS DE ACTIVACIÓN (Sustituye 'Grid de Activación')
-- ==============================================================
CREATE TABLE IF NOT EXISTS public.metas_activacion (
    id BIGSERIAL PRIMARY KEY,
    periodo TEXT NOT NULL, -- Ej: '2026-10'
    vendedor_id TEXT NOT NULL,
    categoria TEXT NOT NULL,
    meta INTEGER DEFAULT 0,
    activados INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metas_vendedor ON public.metas_activacion(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_metas_periodo ON public.metas_activacion(periodo);

-- ==============================================================
-- 8. TABLA: SURVEYS (Para compatibilidad con Dashboard de Gerencia)
-- ==============================================================
CREATE TABLE IF NOT EXISTS public.surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL DEFAULT 'Degustacion',
    date DATE NOT NULL,
    store TEXT NOT NULL,
    promoter TEXT NOT NULL,
    product TEXT,
    rating INTEGER,
    intent TEXT,
    purchase TEXT,
    email TEXT,
    competitor TEXT,
    comments TEXT,
    creator_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveys_type ON public.surveys(type);
CREATE INDEX IF NOT EXISTS idx_surveys_date ON public.surveys(date);

-- ==============================================================
-- 9. PERMISOS Y SEGURIDAD RLS (Row Level Security)
-- ==============================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.degustaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_alkosto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_volumen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activacion_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_activacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para backend y servicio autenticado
DROP POLICY IF EXISTS "Permitir acceso completo a service_role" ON public.usuarios;
CREATE POLICY "Permitir acceso completo a service_role" ON public.usuarios FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir acceso completo a degustaciones" ON public.degustaciones;
CREATE POLICY "Permitir acceso completo a degustaciones" ON public.degustaciones FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir acceso completo a pedidos_alkosto" ON public.pedidos_alkosto;
CREATE POLICY "Permitir acceso completo a pedidos_alkosto" ON public.pedidos_alkosto FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir acceso completo a ventas_volumen" ON public.ventas_volumen;
CREATE POLICY "Permitir acceso completo a ventas_volumen" ON public.ventas_volumen FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir acceso completo a activacion_clientes" ON public.activacion_clientes;
CREATE POLICY "Permitir acceso completo a activacion_clientes" ON public.activacion_clientes FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir acceso completo a metas_activacion" ON public.metas_activacion;
CREATE POLICY "Permitir acceso completo a metas_activacion" ON public.metas_activacion FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir acceso completo a surveys" ON public.surveys;
CREATE POLICY "Permitir acceso completo a surveys" ON public.surveys FOR ALL USING (true);

-- ==============================================================
-- 10. SEED INICIAL DE USUARIOS Y FUERZA DE VENTAS
-- ==============================================================
INSERT INTO public.usuarios (username, password_hash, role, vendor_id, nombre_completo) VALUES
('ADMIN', '123', 'ADMIN', 'ADMIN', 'ADMINISTRADOR GENERAL'),
('MARIA BRICEÑO', '15937615', 'VENDEDOR', '1', 'MARIA BRICEÑO'),
('MARIANA CHACIN', '15260049', 'VENDEDOR', '2', 'MARIANA CHACIN'),
('HERNAN PAZ', '15405797', 'VENDEDOR', '4', 'HERNAN PAZ'),
('OSWALDO CHURION', '13754472', 'VENDEDOR', '7', 'OSWALDO CHURION'),
('CARLOS FUENMAYOR', '18741545', 'VENDEDOR', '12', 'CARLOS FUENMAYOR'),
('SARAH REYES', '18663070', 'VENDEDOR', '14', 'SARAH REYES'),
('J PABLO ARAUJO - CAB/OJE', '15239697', 'VENDEDOR', '15', 'J PABLO ARAUJO - CAB/OJE'),
('JOSE G. GONZALEZ', '13262058', 'VENDEDOR', '16', 'JOSE G. GONZALEZ'),
('ANGELICA MORENO', '14682378', 'VENDEDOR', '21', 'ANGELICA MORENO'),
('ADEL JARABA', '11719291', 'VENDEDOR', '22', 'ADEL JARABA'),
('JUAN HERNANDEZ', '14658122', 'VENDEDOR', '24', 'JUAN HERNANDEZ'),
('YOLEIDA LUGO', '10083900', 'VENDEDOR', '25', 'YOLEIDA LUGO'),
('SAIRU VALLES', '18383237', 'VENDEDOR', '26', 'SAIRU VALLES'),
('ELISA SOLER', '12330043', 'VENDEDOR', '28', 'ELISA SOLER'),
('ALI PEREZ', '19117934', 'VENDEDOR', '29', 'ALI PEREZ'),
('J PABLO ARAUJO', '15239697', 'VENDEDOR', '31', 'J PABLO ARAUJO'),
('EDUARDO PIÑA', '11878063', 'VENDEDOR', '33', 'EDUARDO PIÑA'),
('JOHNATAN SOTO VILLA DEL ROS', '18395226', 'VENDEDOR', '37', 'JOHNATAN SOTO VILLA DEL ROS'),
('LEONARDO RIOS', '17925198', 'VENDEDOR', '38', 'LEONARDO RIOS'),
('MARYERY GARCIA', '12712534', 'VENDEDOR', '39', 'MARYERY GARCIA'),
('LUIS GUANIPA', '18700742', 'VENDEDOR', '40', 'LUIS GUANIPA'),
('PEDRO ABREU', '12456937', 'VENDEDOR', '45', 'PEDRO ABREU'),
('OSCAR ORTIZ', '16347637', 'VENDEDOR', '46', 'OSCAR ORTIZ'),
('MIKELANGELO DIAZ', '20863632', 'VENDEDOR', '47', 'MIKELANGELO DIAZ')
ON CONFLICT (username) DO NOTHING;
