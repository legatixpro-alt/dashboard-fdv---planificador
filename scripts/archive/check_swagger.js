import fetch from 'node-fetch';
async function run() {
  const url = process.env.VITE_SUPABASE_URL + '?apikey=' + process.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(url);
  const data = await res.json();
  console.log(Object.keys(data.definitions || {}));
}
run();
