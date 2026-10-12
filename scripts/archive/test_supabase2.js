import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_ANON_KEY || '';
const cleanUrl = url.replace(/\/rest\/v1\/?$/, '');

const supabase = createClient(cleanUrl, key);

async function test() {
  const { data: { session }, error: authError } = await supabase.auth.getSession();
  console.log("Auth session:", session ? "exists" : "none", "Error:", authError);

  const { data, error } = await supabase.rpc('reload_schema');
  console.log("RPC Error (if any):", error);
  
  const { data: dbData, error: dbError } = await supabase.from('incidencias').select('*').limit(1);
  if (dbError) {
    console.error("DB Error:", dbError);
  } else {
    console.log("Success! Data:", dbData);
  }
}
test();
