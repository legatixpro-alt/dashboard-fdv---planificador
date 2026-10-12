import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient('https://lncccovvljvmgkvrrwpl.supabase.co', process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
  const t1 = await supabase.from('metas_vendedor').select('*').limit(1);
  console.log('metas_vendedor:', t1.error?.message || 'OK');
  const t2 = await supabase.from('clientes').select('*').limit(1);
  console.log('clientes:', t2.error?.message || 'OK');
  const t3 = await supabase.from('volumen_sku').select('*').limit(1);
  console.log('volumen_sku:', t3.error?.message || 'OK');
}
test();
