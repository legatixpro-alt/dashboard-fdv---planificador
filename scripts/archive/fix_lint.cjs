const fs = require('fs');

let serverTs = fs.readFileSync('server.ts', 'utf8');
serverTs = serverTs.replace(/volJson\[0\] as unknown\[\]/g, 'volJson[0] as any[]');
serverTs = serverTs.replace(/actJson\[0\] as unknown\[\]/g, 'actJson[0] as any[]');
fs.writeFileSync('server.ts', serverTs);

let supabaseTs = fs.readFileSync('src/lib/supabase.ts', 'utf8');
supabaseTs = supabaseTs.replace(/\(import\.meta\.env as any\)\./g, 'import.meta.env.');
supabaseTs = supabaseTs.replace(/import\.meta\.env/g, '(import.meta as any).env');
fs.writeFileSync('src/lib/supabase.ts', supabaseTs);
