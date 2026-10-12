CREATE TABLE trazabilidad_login (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario varchar(255) NOT NULL,
  rol varchar(50) NOT NULL,
  fecha_ingreso timestamp with time zone DEFAULT now()
);

ALTER TABLE trazabilidad_login ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir inserción y lectura desde el dashboard
CREATE POLICY "Permitir inserciones publicas en trazabilidad" ON trazabilidad_login FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir lectura publica en trazabilidad" ON trazabilidad_login FOR SELECT USING (true);
