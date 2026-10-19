const dotenv = require('dotenv');
dotenv.config();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log("=== INICIANDO MIGRACIÓN AUTOMÁTICA A SUPABASE ===");
  console.log("Conectado a:", SUPABASE_URL);

  // 1. Verificar si las tablas existen
  const { data: testDeg, error: errDeg } = await supabase.from('degustaciones').select('id').limit(1);
  if (errDeg) {
    console.log("\n[ESTADO] La tabla 'degustaciones' aún no existe en el proyecto Supabase.");
    console.log("Para crear todas las tablas en 1 clic, ve al SQL Editor de Supabase:");
    console.log("-> https://supabase.com/dashboard/project/nudltbgyewyiklqdyujk/sql/new");
    console.log("Copia y pega el contenido del archivo 'supabase_schema.sql' y presiona RUN.");
    console.log("Una vez ejecutado, vuelve a correr este script para migrar todos los datos.\n");
    return;
  }

  console.log("Tablas detectadas correctamente en Supabase. Comenzando transferencia de datos...\n");

  // 2. Migrar Degustaciones desde API local / Firestore
  try {
    console.log("1. Migrando Degustaciones...");
    const res = await fetch('http://localhost:3000/api/degustaciones');
    const { data: degustaciones } = await res.json();
    if (Array.isArray(degustaciones) && degustaciones.length > 0) {
      const records = degustaciones.map(d => ({
        id: d.id,
        cliente_codigo: d.clienteCodigo || 'PDV',
        cliente_nombre: d.clienteNombre || 'Sin nombre',
        vendedor_nombre: d.vendedorNombre || 'Vendedor',
        vendedor_id: d.vendedorId || '1',
        vendedor_email: d.vendedorEmail || null,
        ruta: d.ruta || d.vendedorId || '',
        fecha: d.fecha,
        turno: d.turno || 'MAÑANA',
        hora: d.hora || '',
        productos: Array.isArray(d.productos) ? d.productos : [],
        kilos_estimados: Number(d.kilosEstimados) || 0,
        personas_estimadas: Number(d.personasEstimadas) || 0,
        requiere_promotora: Boolean(d.requierePromotora),
        promotora_asignada: d.promotoraAsignada || '',
        material_pop: Boolean(d.materialPop),
        contacto_punto: d.contactoPunto || '',
        telefono_contacto: d.telefonoContacto || '',
        observaciones: d.observaciones || '',
        estado: d.estado || 'SOLICITADA',
        notas_trade_marketing: d.notasTradeMarketing || '',
        resultado: d.resultado || null,
        created_at: d.createdAt || new Date().toISOString()
      }));

      const { error: insErr } = await supabase.from('degustaciones').upsert(records, { onConflict: 'id' });
      if (insErr) console.warn("Error insertando degustaciones:", insErr.message);
      else console.log(`   ✓ ${records.length} degustaciones migradas exitosamente.`);
    }
  } catch (e) {
    console.warn("Error en migración de degustaciones:", e.message);
  }

  // 3. Migrar Pedidos Alkosto
  try {
    console.log("2. Migrando Pedidos Alkosto...");
    const res = await fetch('http://localhost:3000/api/alkosto/pedidos');
    const { data: pedidos } = await res.json();
    if (Array.isArray(pedidos) && pedidos.length > 0) {
      const records = pedidos.map(p => ({
        id: p.id,
        numero_pedido: p.numeroPedido || '',
        correlativo: p.correlativo || p.numeroPedido || '',
        orden_compra_alkosto: p.ordenCompraAlkosto || '',
        sucursal_codigo: p.sucursalCodigo || '',
        sucursal_nombre: p.sucursalNombre || '',
        vendedora: p.vendedora || 'SAIRU VALLES',
        ruta: p.ruta || 'CUENTAS CLAVE 2',
        fecha_pedido: p.fechaPedido ? new Date(p.fechaPedido).toISOString().split('T')[0] : null,
        total_bultos: Number(p.totalBultos) || 0,
        total_kilos: Number(p.totalKilos) || 0,
        total_usd: Number(p.totalUSD) || 0,
        condicion_pago: p.condicionPago || '',
        items: p.items || [],
        observaciones: p.observaciones || '',
        created_at: p.createdAt || new Date().toISOString()
      }));

      const { error: insErr } = await supabase.from('pedidos_alkosto').upsert(records, { onConflict: 'id' });
      if (insErr) console.warn("Error insertando pedidos Alkosto:", insErr.message);
      else console.log(`   ✓ ${records.length} pedidos Alkosto migrados exitosamente.`);
    }
  } catch (e) {
    console.warn("Error en migración de pedidos Alkosto:", e.message);
  }

  // 4. Migrar Volumen de Ventas por SKU
  try {
    console.log("3. Migrando Volumen de Ventas...");
    const res = await fetch('http://localhost:3000/api/data/volumen');
    const volData = await res.json();
    if (Array.isArray(volData) && volData.length > 0) {
      const records = volData.map(v => ({
        periodo: '2026-10',
        vendedor_id: v.vendedorId || 'General',
        vendedor_nombre: v.vendedorNombre || 'General',
        sku: v.skuId || 'SKU',
        articulo: v.articulo || 'Articulo',
        categoria: v.categoria || 'OTROS',
        meta_kg: Number(v.meta) || 0,
        ejecutado_kg: Number(v.ejecutado) || 0,
        zona: v.zona || 'General'
      }));

      for (let i = 0; i < records.length; i += 200) {
        const batch = records.slice(i, i + 200);
        await supabase.from('ventas_volumen').insert(batch);
      }
      console.log(`   ✓ ${records.length} registros de volumen migrados exitosamente.`);
    }
  } catch (e) {
    console.warn("Error en migración de volumen:", e.message);
  }

  // 5. Migrar Activación de Clientes
  try {
    console.log("4. Migrando Activación por Cliente...");
    const res = await fetch('http://localhost:3000/api/data/activacion');
    const actData = await res.json();
    if (Array.isArray(actData) && actData.length > 0) {
      const records = actData.map(a => ({
        periodo: '2026-10',
        cliente_codigo: a.id || 'PDV',
        cliente_nombre: a.cliente || 'Cliente',
        vendedor_id: a.vendedorId || 'General',
        vendedor_nombre: a.vendedorNombre || a.vendedorId || 'General',
        status: a.status || 'INACTIVO',
        cajas_aceite: Number(a.cajas?.ACEITE) || 0,
        cajas_azucar: Number(a.cajas?.AZUCAR) || 0,
        cajas_pollo: Number(a.cajas?.POLLO) || 0,
        cajas_estandar_asturias: Number(a.cajas?.ESTANDAR_ASTURIAS) || 0,
        cajas_mortadela_salpicao: Number(a.cajas?.MORTADELA_SALPICAO) || 0,
        has_aceite: Boolean(a.cats?.ACEITE),
        has_azucar: Boolean(a.cats?.AZUCAR),
        has_pollo: Boolean(a.cats?.POLLO),
        has_estandar_asturias: Boolean(a.cats?.ESTANDAR_ASTURIAS),
        has_mortadela_salpicao: Boolean(a.cats?.MORTADELA_SALPICAO)
      }));

      for (let i = 0; i < records.length; i += 200) {
        const batch = records.slice(i, i + 200);
        await supabase.from('activacion_clientes').insert(batch);
      }
      console.log(`   ✓ ${records.length} clientes de activación migrados exitosamente.`);
    }
  } catch (e) {
    console.warn("Error en migración de activación:", e.message);
  }

  console.log("\n=== MIGRACIÓN A SUPABASE COMPLETADA CON ÉXITO ===");
}

runMigration();
