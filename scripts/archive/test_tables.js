import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
  const { error: e1 } = await supabase.from('metas_vendedor').select('*').limit(1);
  console.log('metas_vendedor error:', e1?.message);
  const { error: e2 } = await supabase.from('clientes').select('*').limit(1);
  console.log('clientes error:', e2?.message);
  const { error: e3 } = await supabase.from('volumen_vendedor').select('*').limit(1);
  console.log('volumen_vendedor error:', e3?.message);
}
test();
