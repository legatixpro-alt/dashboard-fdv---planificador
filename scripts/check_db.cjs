require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  for (const t of ['ventas_volumen', 'activacion_clientes', 'metas_activacion', 'ventas_historial']) {
    const { count, error } = await s.from(t).select('*', { count: 'exact', head: true });
    console.log(t.padEnd(22), error ? 'ERROR: ' + error.message + ' [' + error.code + ']' : 'filas=' + count);
  }
  const { data } = await s.from('ventas_volumen').select('periodo,vendedor_id,sku').limit(3);
  console.log('muestra ventas_volumen', data);
})();
