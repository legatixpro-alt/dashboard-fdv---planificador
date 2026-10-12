const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const cacheCode = `
let cachedWorkbook = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

async function getWorkbook() {
  if (cachedWorkbook && (Date.now() - lastFetchTime < CACHE_TTL)) {
    return cachedWorkbook;
  }
  const XLSX = await import('xlsx');
  const fetchRes = await fetch('https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx');
  if (!fetchRes.ok) throw new Error("Failed to fetch XLSX");
  const buffer = await fetchRes.arrayBuffer();
  cachedWorkbook = XLSX.read(buffer, { type: 'array' });
  lastFetchTime = Date.now();
  return cachedWorkbook;
}
`;

code = code.replace("import { pcmToWav } from './pcmToWav';", "import { pcmToWav } from './pcmToWav';\n\n" + cacheCode);

code = code.replace(/const XLSX = await import\('xlsx'\);\s*const fetchRes = await fetch\('https:\/\/docs\.google\.com.*?;\s*if \(!fetchRes\.ok\) throw new Error\("Failed to fetch XLSX"\);\s*const buffer = await fetchRes\.arrayBuffer\(\);\s*const workbook = XLSX\.read\(buffer, { type: 'array' }\);/g, "const workbook = await getWorkbook();\nconst XLSX = await import('xlsx');");

fs.writeFileSync('server.ts', code);
