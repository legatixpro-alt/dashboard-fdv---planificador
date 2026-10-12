const fs = require('fs');

let serverContent = fs.readFileSync('server.ts', 'utf8');

serverContent = serverContent.replace(
  `async function getWorkbook() {
  if (cachedWorkbook && (Date.now() - lastFetchTime < CACHE_TTL)) {
    return cachedWorkbook;
  }`,
  `async function getWorkbook(force = false) {
  if (!force && cachedWorkbook && (Date.now() - lastFetchTime < CACHE_TTL)) {
    return cachedWorkbook;
  }`
);

serverContent = serverContent.replace(/app\.get\("\/api\/data\/volumen", async \(req, res\) => \{\n    try \{\n      const workbook = await getWorkbook\(\);/g, `app.get("/api/data/volumen", async (req, res) => {\n    try {\n      const workbook = await getWorkbook(req.query.force === 'true');`);
serverContent = serverContent.replace(/app\.get\("\/api\/data\/activacion", async \(req, res\) => \{\n    try \{\n      const workbook = await getWorkbook\(\);/g, `app.get("/api/data/activacion", async (req, res) => {\n    try {\n      const workbook = await getWorkbook(req.query.force === 'true');`);
serverContent = serverContent.replace(/app\.get\("\/api\/data\/metas-activacion", async \(req, res\) => \{\n    try \{\n      const workbook = await getWorkbook\(\);/g, `app.get("/api/data/metas-activacion", async (req, res) => {\n    try {\n      const workbook = await getWorkbook(req.query.force === 'true');`);

fs.writeFileSync('server.ts', serverContent);
