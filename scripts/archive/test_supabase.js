import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

let url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_ANON_KEY || '';

if (url.endsWith('/rest/v1/')) {
  url = url.replace('/rest/v1/', '');
} else if (url.endsWith('/rest/v1')) {
  url = url.replace('/rest/v1', '');
}

const supabase = createClient(url, key);

async function test() {
  console.log("URL:", url);
  const { data, error } = await supabase.from('incidencias').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success! Data:", data);
  }
}
test();
