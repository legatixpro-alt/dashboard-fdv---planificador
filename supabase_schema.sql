-- Tabla Usuarios
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255),
    password VARCHAR(255),
    rol VARCHAR(50),
    vendedor_id VARCHAR(50)
);

-- Tabla Clientes
CREATE TABLE clientes (
    codigo VARCHAR(50) PRIMARY KEY,
    razon_social VARCHAR(255),
    vendedor_nombre VARCHAR(255)
);

-- Tabla Metas y Activaciones del Vendedor (Agrupado por Vendedor y Categoría)
CREATE TABLE metas_vendedor (
    id SERIAL PRIMARY KEY,
    vendedor_nombre VARCHAR(255),
    categoria VARCHAR(50),
    cartera INT,
    meta_activacion INT,
    ejecutado_activacion INT
);

-- Tabla Ventas Volumen (Detalle por Cliente y Categoría)
CREATE TABLE ventas_volumen (
    id SERIAL PRIMARY KEY,
    cliente_codigo VARCHAR(50),
    cliente_nombre VARCHAR(255),
    categoria VARCHAR(50),
    volumen_cajas NUMERIC
);
