async function testAll() {
  const base = "http://127.0.0.1:3000";
  
  // 1. Health
  const h = await fetch(`${base}/api/health`).then(r => r.json());
  console.log("1. Health Status:", h.status);

  // 2. Auth Admin
  const auth = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ADMIN", password: "123" })
  }).then(r => r.json());
  console.log("2. Auth Admin:", auth.success, "| Role:", auth.user?.role, "| VendorId:", auth.user?.vendorId);
  const token = auth.token;

  // 3. Volumen
  const vol = await fetch(`${base}/api/data/volumen`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json());
  console.log("3. Volumen SKUs:", vol.length);

  // 4. Activacion
  const act = await fetch(`${base}/api/data/activacion`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json());
  console.log("4. Clientes Activación:", act.length);

  // 5. Degustaciones
  const deg = await fetch(`${base}/api/degustaciones`).then(r => r.json());
  console.log("5. Degustaciones:", deg.count || deg.data?.length, "| Source:", deg.source);

  // 6. Sync Trade Marketing
  const syncG = await fetch(`${base}/api/degustaciones/sync-gerencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
  console.log("6. Sync Trade Marketing:", syncG.success, "| Total Synced:", syncG.synced, "| Msg:", syncG.message);
}

testAll().catch(console.error);
