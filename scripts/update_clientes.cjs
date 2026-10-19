const dotenv = require('dotenv');
dotenv.config();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan variables en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Lectura de base de datos provista por el usuario
const rawClientsFile = path.join(__dirname, 'clientes_maestro.csv');
if (!fs.existsSync(rawClientsFile)) {
  console.error("Archivo clientes_maestro.csv no encontrado");
  process.exit(1);
}

async function updateClients() {
  console.log("=== ACTUALIZANDO ASIGNACIÓN DE CLIENTES EN SUPABASE ===");
  const content = fs.readFileSync(rawClientsFile, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  
  const records = [];
  // Saltar header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length >= 3) {
      let vendedor = parts[0].trim().replace(/\s+/g, ' ');
      // Corrección de caracteres con encoding roto
      vendedor = vendedor
        .replace(/BRICE.O/gi, 'MARIA BRICEÑO')
        .replace(/CHAC.N/gi, 'MARIANA CHACÍN')
        .replace(/PI.A/gi, 'EDUARDO PIÑA');

      const codRaw = parts[1].trim();
      const cod = codRaw.replace(/^0+/, '') || codRaw; // Normalizar '000326' -> '326'
      const cliente = parts[2].trim().replace(/^"/, '').replace(/"$/, '').trim();

      records.push({
        codigoOriginal: codRaw,
        codigoNorm: cod,
        cliente,
        vendedor
      });
    }
  }

  console.log(`Leídos ${records.length} clientes del maestro.`);

  // Actualizar en bloques la tabla activacion_clientes de Supabase
  let updatedCount = 0;
  for (const item of records) {
    const { data, error } = await supabase
      .from('activacion_clientes')
      .update({
        vendedor_nombre: item.vendedor,
        vendedor_id: item.vendedor
      })
      .or(`cliente_codigo.eq.${item.codigoOriginal},cliente_codigo.eq.${item.codigoNorm}`);

    if (!error) updatedCount++;
  }

  console.log(`✓ Asignación completada. Clientes procesados.`);
}

updateClients().catch(console.error);
