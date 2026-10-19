const fs = require('fs');
const path = require('path');

const SUPABASE_URL = "https://nudltbgyewyiklqdyujk.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx0Ymd5ZXd5aWtscWR5dWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgzMDA3OCwiZXhwIjoyMTA3NDA2MDc4fQ.k92vdZiuVkTzAWNK8Fq71m1Xi_MoWtpx_eRQcZTw1cA";

const headers = {
  "apikey": KEY,
  "Authorization": "Bearer " + KEY,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

async function run() {
  console.log("=== 1. TEST SURVEYS TABLE IN SUPABASE ===");
  const testPayload = {
    type: "Degustacion",
    date: "2026-10-15",
    store: "TEST STORE SAN FRANCISCO",
    promoter: "Maria Briceño",
    product: "Mortadela Tapara",
    comments: JSON.stringify({ test: true, id: "test-001" })
  };

  const postRes = await fetch(`${SUPABASE_URL}/rest/v1/surveys`, {
    method: "POST",
    headers,
    body: JSON.stringify(testPayload)
  });
  console.log("POST /surveys status:", postRes.status);
  const postData = await postRes.json();
  console.log("POST /surveys response:", postData);

  const delRes = await fetch(`${SUPABASE_URL}/rest/v1/surveys?store=eq.TEST%20STORE%20SAN%20FRANCISCO`, {
    method: "DELETE",
    headers
  });
  console.log("DELETE /surveys status:", delRes.status);

  console.log("\n=== 2. FETCH ALL 28 DEGUSTACIONES FROM SUPABASE ===");
  const getDegs = await fetch(`${SUPABASE_URL}/rest/v1/degustaciones?select=*&order=fecha.desc`, {
    headers: { "apikey": KEY, "Authorization": "Bearer " + KEY }
  });
  const degs = await getDegs.json();
  console.log("Found degustaciones in Supabase:", degs.length);

  console.log("\n=== 3. CONVERT TO TRADE MARKETING FORMAT ===");
  const tradeItems = degs.map((d, idx) => {
    let dmyDate = d.fecha;
    if (d.fecha && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) {
      const [y, m, day] = d.fecha.split('-');
      dmyDate = `${day}/${m}/${y}`;
    }

    let timeStr = d.hora;
    if (!timeStr || !timeStr.trim()) {
      if (d.turno === 'MAÑANA') timeStr = '09:00 - 13:00';
      else if (d.turno === 'TARDE') timeStr = '14:00 - 18:00';
      else timeStr = '09:00 - 18:00';
    }

    const productStr = Array.isArray(d.productos) ? d.productos.join(', ') : (d.productos || 'Embutidos y Refrigerados');
    let status = 'scheduled';
    const norm = (d.estado || 'SOLICITADA').toUpperCase().trim();
    if (norm === 'REALIZADA') status = 'completed';
    else if (norm === 'CANCELADA' || norm === 'RECHAZADA') status = 'cancelled';

    return {
      id: d.id,
      date: dmyDate,
      time: timeStr,
      activity: `Impulso y Degustación ${productStr} - ${d.cliente_nombre}`,
      product: productStr,
      promoter: d.promotora_asignada || d.vendedor_nombre || 'Por Asignar',
      promoterRole: d.requiere_promotora ? 'Promotora' : 'Impulsadora',
      client: d.cliente_nombre,
      zone: d.ruta || d.vendedor_nombre || 'Maracaibo',
      status: status,
      delivered: d.resultado?.porcionesEntregadas || 0,
      target: Number(d.personas_estimadas) || Math.round((Number(d.kilos_estimados) || 1) * 35) || 140,
      acceptanceRate: d.resultado?.porcentajeAceptacion || (status === 'completed' ? 95 : 0),
      comments: [
        d.observaciones,
        d.notas_trade_marketing ? `Notas Trade: ${d.notas_trade_marketing}` : '',
        `Vendedor: ${d.vendedor_nombre}`,
        d.contacto_punto ? `Contacto: ${d.contacto_punto} (${d.telefono_contacto || ''})` : ''
      ].filter(Boolean).join(' | ')
    };
  });

  console.log("Converted Trade Marketing items sample:", tradeItems[0]);

  console.log("\n=== 4. WRITE TO GERENCIA data_degustaciones.json ===");
  const gerenciaPath = path.resolve("c:/Users/JAVIER CASTELLANOS/Downloads/codizulca-dashboard (3)/data_degustaciones.json");
  if (fs.existsSync(gerenciaPath)) {
    const existing = JSON.parse(fs.readFileSync(gerenciaPath, 'utf8') || '[]');
    const existingMap = new Map();
    existing.forEach(e => existingMap.set(e.id, e));
    tradeItems.forEach(t => existingMap.set(t.id, t));
    const merged = Array.from(existingMap.values());
    fs.writeFileSync(gerenciaPath, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`Updated gerencia data_degustaciones.json with ${merged.length} total items (${tradeItems.length} from FDV).`);
  }

  // Also write to local
  const localPath = path.resolve("./data_degustaciones.json");
  fs.writeFileSync(localPath, JSON.stringify(tradeItems, null, 2), 'utf8');
  console.log(`Saved local data_degustaciones.json with ${tradeItems.length} items.`);
}

run().catch(console.error);
