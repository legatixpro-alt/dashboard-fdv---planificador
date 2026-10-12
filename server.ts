import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

dotenv.config();

// Prevenir caídas del proceso por errores o rechazos no controlados en tareas asíncronas
process.on('uncaughtException', (err) => {
  console.error('[SERVER] Excepción no controlada capturada:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Promesa rechazada no controlada:', reason);
});

import { pcmToWav } from './pcmToWav';

let cachedWorkbook: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

async function getWorkbook(force = false) {
  if (!force && cachedWorkbook && (Date.now() - lastFetchTime < CACHE_TTL)) {
    return cachedWorkbook;
  }
  const XLSX = await import('xlsx');

  // 1. Intentar descargar en caliente desde Google Sheets
  try {
    const fetchRes = await fetch('https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx');
    if (fetchRes.ok) {
      const buffer = await fetchRes.arrayBuffer();
      cachedWorkbook = XLSX.read(buffer, { type: 'array' });
      lastFetchTime = Date.now();
      return cachedWorkbook;
    }
  } catch (err: any) {
    console.warn("[SERVER] No se pudo obtener XLSX en vivo desde Google Sheets:", err?.message);
  }

  // 2. Fallback a copia local de respaldo sheet.xlsx
  const localPath = path.join(process.cwd(), 'sheet.xlsx');
  if (fs.existsSync(localPath)) {
    try {
      cachedWorkbook = XLSX.readFile(localPath);
      lastFetchTime = Date.now();
      return cachedWorkbook;
    } catch (fsErr: any) {
      console.warn("[SERVER] Error leyendo archivo local sheet.xlsx:", fsErr?.message);
    }
  }

  if (cachedWorkbook) return cachedWorkbook;
  throw new Error("No se pudo cargar el libro de datos ni en línea ni desde el respaldo local.");
}


async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CORS Middleware para permitir sincronización directa con el dashboard de gerencia (https://dashboardgerencia01.ai.studio)
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // ==============================================================
  // ENDPOINT DE AUTENTICACIÓN SEGURA
  // ==============================================================
  const VENDOR_SERVER_CREDENTIALS: Record<string, { password: string; role: 'ADMIN' | 'VENDEDOR'; vendorId: string }> = {
    'ADMIN': { password: process.env.ADMIN_PASSWORD || '123', role: 'ADMIN', vendorId: 'ADMIN' },
    'MARIA BRICEÑO': { password: '15937615', role: 'VENDEDOR', vendorId: '1' },
    'MARIANA CHACIN': { password: '15260049', role: 'VENDEDOR', vendorId: '2' },
    'MIKELANGELO DIAZ': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'MIKELANGELODIAZ@GMAIL.COM': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'MIKELANGELO': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'MIKELANGELO DIAZ1': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'MIKELANGELO DIAZ - VILLA DEL ROS': { password: '20863632', role: 'VENDEDOR', vendorId: '37' },
    'MIKELANGELO DIAZ VILLA DEL ROS': { password: '20863632', role: 'VENDEDOR', vendorId: '37' },
    'MIKELANGELO VILLA DEL ROS': { password: '20863632', role: 'VENDEDOR', vendorId: '37' },
    'JOHNATAN SOTO': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'JOHNATAN': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'JONATHAN': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'JHONATAN': { password: '20863632', role: 'VENDEDOR', vendorId: '47' },
    'HERNAN PAZ': { password: '15405797', role: 'VENDEDOR', vendorId: '4' },
    'OSWALDO CHURION': { password: '13754472', role: 'VENDEDOR', vendorId: '7' },
    'CARLOS FUENMAYOR': { password: '18741545', role: 'VENDEDOR', vendorId: '12' },
    'SARAH REYES': { password: '18663070', role: 'VENDEDOR', vendorId: '14' },
    'J PABLO ARAUJO - CAB/OJE': { password: '15239697', role: 'VENDEDOR', vendorId: '15' },
    'JOSE G. GONZALEZ': { password: '13262058', role: 'VENDEDOR', vendorId: '16' },
    'ANGELICA MORENO': { password: '14682378', role: 'VENDEDOR', vendorId: '21' },
    'ADEL JARABA': { password: '11719291', role: 'VENDEDOR', vendorId: '22' },
    'JUAN HERNANDEZ': { password: '14658122', role: 'VENDEDOR', vendorId: '24' },
    'YOLEIDA LUGO': { password: '10083900', role: 'VENDEDOR', vendorId: '25' },
    'SAIRU VALLES': { password: '18383237', role: 'VENDEDOR', vendorId: '26' },
    'ELISA SOLER': { password: '12330043', role: 'VENDEDOR', vendorId: '28' },
    'ALI PEREZ': { password: '19117934', role: 'VENDEDOR', vendorId: '29' },
    'J PABLO ARAUJO': { password: '15239697', role: 'VENDEDOR', vendorId: '31' },
    'EDUARDO PIÑA': { password: '11878063', role: 'VENDEDOR', vendorId: '33' },
    'JOHNATAN SOTO VILLA DEL ROS': { password: '18395226', role: 'VENDEDOR', vendorId: '37' },
    'LEONARDO RIOS': { password: '17925198', role: 'VENDEDOR', vendorId: '38' },
    'MARYERY GARCIA': { password: '12712534', role: 'VENDEDOR', vendorId: '39' },
    'LUIS GUANIPA': { password: '18700742', role: 'VENDEDOR', vendorId: '40' },
    'PEDRO ABREU': { password: '12456937', role: 'VENDEDOR', vendorId: '45' },
    'OSCAR ORTIZ': { password: '16347637', role: 'VENDEDOR', vendorId: '46' },
  };

  app.post("/api/auth/login", (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
      }

      const usuarioUpper = String(username).toUpperCase().trim();
      
      const normalizeForAuth = (s: string) => {
        return s
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/Ñ/gi, 'N')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();
      };

      const usuarioNorm = normalizeForAuth(usuarioUpper);
      let creds = VENDOR_SERVER_CREDENTIALS[usuarioUpper];
      if (!creds) {
        for (const [key, val] of Object.entries(VENDOR_SERVER_CREDENTIALS)) {
          if (normalizeForAuth(key) === usuarioNorm) {
            creds = val;
            break;
          }
        }
      }

      if (!creds) {
        return res.status(401).json({ success: false, error: 'Usuario no autorizado o no encontrado en la base de datos' });
      }

      const pwd = String(password).trim();
      const pwdClean = pwd.replace(/\D/g, '');
      const isMikel = usuarioUpper.includes('MIKELANGELO') || usuarioUpper.includes('SOTO') || usuarioUpper.includes('JOHNATAN');
      const isValidPwd = (pwd === creds.password) || (pwdClean === creds.password) || (isMikel && (pwdClean === '20863632' || pwdClean === '18395226'));

      if (!isValidPwd) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
      }

      return res.json({
        success: true,
        user: {
          username: usuarioUpper,
          role: creds.role,
          vendorId: creds.vendorId
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Error interno en autenticación' });
    }
  });

  // ==============================================================
  // ENDPOINTS DE DEGUSTACIONES Y TRADE MARKETING
  // Permite sincronización directa con https://dashboardgerencia01.ai.studio/
  // ==============================================================
  app.get("/api/degustaciones", async (req, res) => {
    try {
      const { db } = await import('./src/lib/firebase');
      const { collection, getDocs } = await import('firebase/firestore');

      const snapshot = await getDocs(collection(db, 'degustaciones'));
      let list: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.clienteNombre) {
          list.push({
            id: docSnap.id,
            ...data
          });
        }
      });

      // Filtros opcionales
      if (req.query.vendedor) {
        const v = String(req.query.vendedor).toUpperCase().trim();
        list = list.filter(d => 
          (d.vendedorNombre || '').toUpperCase().includes(v) ||
          (d.vendedorId || '').toUpperCase().includes(v)
        );
      }
      if (req.query.estado) {
        const e = String(req.query.estado).toUpperCase().trim();
        list = list.filter(d => (d.estado || '').toUpperCase() === e);
      }
      if (req.query.fecha) {
        const f = String(req.query.fecha).trim();
        list = list.filter(d => d.fecha === f);
      }

      // Ordenar por fecha descendente
      list.sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());

      res.json({
        success: true,
        count: list.length,
        data: list,
        source: 'firestore'
      });
    } catch (err: any) {
      console.error("Error fetching degustaciones via API:", err);
      res.status(500).json({ error: "Error al consultar degustaciones", details: err?.message });
    }
  });

  const GOOGLE_SCRIPT_WEBHOOK_URL = process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbx6JMUR1IubQuZ97Ics7emw_I0G9UAy-5vig4Vl8zPwW8yMBbZldvQGeGOPNiNbUmVTaQ/exec';
  const GERENCIA_SUPABASE_SURVEYS_URL = process.env.GERENCIA_SUPABASE_SURVEYS_URL || process.env.VITE_GERENCIA_SUPABASE_SURVEYS_URL || 'https://uterioexpfweghxfbvoa.supabase.co/rest/v1/surveys';
  const GERENCIA_SUPABASE_ANON_KEY = process.env.GERENCIA_SUPABASE_ANON_KEY || process.env.VITE_GERENCIA_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZXJpb2V4cGZ3ZWdoeGZidm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTg3ODYsImV4cCI6MjEwMzUzNDc4Nn0.bZnN4vrXUDlcoIaI7l39O-bU4GQp05SvJdio_cn6niI';

  async function syncToGerenciaDirect(item: any) {
    try {
      const payload = {
        type: 'Degustacion',
        date: item.fecha || item.fechaDegustacion || new Date().toISOString().split('T')[0],
        store: item.clienteNombre,
        promoter: item.vendedorNombre || item.vendedor || item.vendedorId || 'Vendedor',
        product: Array.isArray(item.productos) ? item.productos.join(', ') : (item.productos || 'Productos'),
        comments: JSON.stringify({
          time: item.hora || (item.turno === 'MANANA' ? '09:00 AM - 01:00 PM' : '02:00 PM - 07:00 PM'),
          address: `Ruta: ${item.ruta || item.vendedorNombre || ''} | Contacto: ${item.contactoPunto || ''} (${item.telefonoContacto || ''})`,
          promoterType: item.requierePromotora ? 'Fija' : 'Vendedor / Impulso',
          isTasting: true,
          estado: item.estado || 'SOLICITADA',
          originalComments: item.observaciones || `Agendada por ${item.vendedorNombre || ''}. Kilos: ${item.kilosEstimados || 0}. Personas: ${item.personasEstimadas || 0}.`,
          vendedor: item.vendedorNombre,
          clienteCodigo: item.clienteCodigo,
          kilos: item.kilosEstimados,
          personas: item.personasEstimadas,
          turno: item.turno,
          materialPop: item.materialPop ? 'SI' : 'NO',
          degustacionId: item.id
        })
      };

      await fetch(GERENCIA_SUPABASE_SURVEYS_URL, {
        method: 'POST',
        headers: {
          'apikey': GERENCIA_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn("Failed to sync directly to Gerencia:", err);
    }
  }

  async function syncToGoogleScript(item: any) {
    try {
      await fetch(GOOGLE_SCRIPT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADD_DEGUSTACION',
          timestamp: new Date().toISOString(),
          id: item.id,
          fechaRegistro: item.createdAt || new Date().toISOString(),
          vendedor: item.vendedorNombre || item.vendedor,
          ruta: item.ruta || item.vendedorId,
          clienteCodigo: item.clienteCodigo,
          clienteNombre: item.clienteNombre,
          fechaDegustacion: item.fecha || item.fechaDegustacion,
          turno: item.turno,
          hora: item.hora,
          productos: Array.isArray(item.productos) ? item.productos.join(', ') : item.productos,
          kilosEstimados: item.kilosEstimados,
          personasEstimadas: item.personasEstimadas,
          requierePromotora: item.requierePromotora ? 'SI' : 'NO',
          materialPop: item.materialPop ? 'SI' : 'NO',
          contactoPunto: item.contactoPunto || '',
          telefonoContacto: item.telefonoContacto || '',
          estado: item.estado || 'SOLICITADA',
          promotoraAsignada: item.promotoraAsignada || '',
          notasTradeMarketing: item.notasTradeMarketing || '',
          observaciones: item.observaciones || ''
        })
      });
    } catch (err) {
      console.warn("Failed to sync with Google Script:", err);
    }
  }

  app.post("/api/degustaciones", async (req, res) => {
    try {
      const { db } = await import('./src/lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      const item = req.body;
      if (!item || !item.clienteNombre || !item.fecha) {
        return res.status(400).json({ error: "Faltan campos obligatorios (clienteNombre, fecha)" });
      }

      const id = item.id || `deg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const record = {
        ...item,
        id,
        createdAt: item.createdAt || new Date().toISOString()
      };

      await setDoc(doc(db, 'degustaciones', id), record);
      syncToGoogleScript(record).catch(() => {});
      syncToGerenciaDirect(record).catch(() => {});
      res.json({ success: true, data: record });
    } catch (err: any) {
      console.error("Error creating degustacion via API:", err);
      res.status(500).json({ error: "Error al guardar degustacion", details: err?.message });
    }
  });

  app.put("/api/degustaciones/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const { db } = await import('./src/lib/firebase');
      const { doc, setDoc, getDoc } = await import('firebase/firestore');

      await setDoc(doc(db, 'degustaciones', id), updates, { merge: true });
      const snap = await getDoc(doc(db, 'degustaciones', id));
      if (snap.exists()) {
        const full = { id, ...snap.data() };
        syncToGoogleScript(full).catch(() => {});
        syncToGerenciaDirect(full).catch(() => {});
      }
      res.json({ success: true, id, updated: updates });
    } catch (err: any) {
      console.error("Error updating degustacion via API:", err);
      res.status(500).json({ error: "Error al actualizar degustacion", details: err?.message });
    }
  });

  // ==============================================================
  // ENDPOINTS DE PEDIDOS ALKOSTO (CUENTAS CLAVE 2 - SAIRÚ VALLES)
  // ==============================================================
  app.get("/api/alkosto/pedidos", async (req, res) => {
    try {
      const { db } = await import('./src/lib/firebase');
      const { collection, getDocs } = await import('firebase/firestore');

      const snapshot = await getDocs(collection(db, 'alkosto_orders'));
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      res.json({ success: true, count: list.length, data: list });
    } catch (err: any) {
      console.error("Error fetching Alkosto orders:", err);
      res.status(500).json({ error: "Error fetching Alkosto orders", details: err?.message });
    }
  });

  async function syncAlkostoOrderToExternal(item: any) {
    try {
      const itemsDesc = Array.isArray(item.items)
        ? item.items.map((i: any) => `${i.producto || i.sku || 'Item'} (Cant: ${i.cantidadCajas || i.cantSolicitada || 0} cjs, Kilos: ${i.totalKilos || 0} kg, Sub: $${i.subtotalUSD || i.subtotal || 0})`).join(' | ')
        : 'Productos Alkosto';

      // 1. Enviar a Google Sheets Webhook
      if (GOOGLE_SCRIPT_WEBHOOK_URL) {
        fetch(GOOGLE_SCRIPT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ADD_PEDIDO_ALKOSTO',
            tipo: 'PEDIDO_ALKOSTO',
            timestamp: new Date().toISOString(),
            id: item.id,
            numeroPedido: item.numeroPedido,
            correlativo: item.correlativo || item.numeroPedido,
            ordenCompraAlkosto: item.ordenCompraAlkosto,
            sucursalCodigo: item.sucursalCodigo,
            sucursalNombre: item.sucursalNombre,
            vendedora: item.vendedora || 'SAIRU VALLES',
            ruta: item.ruta || 'CUENTAS CLAVE 2',
            fechaPedido: item.fechaPedido,
            fechaEntrega: item.fechaEntregaEstimada,
            totalBultos: item.totalBultos,
            totalKilos: item.totalKilos,
            totalUSD: item.totalUSD,
            condicionPago: item.condicionPago,
            items: item.items,
            observaciones: item.observaciones
          })
        }).catch(err => console.warn("Google script webhook alkosto error:", err));
      }

      // 2. Enviar al programa externo (Supabase / ERP)
      fetch(GERENCIA_SUPABASE_SURVEYS_URL, {
        method: 'POST',
        headers: {
          'apikey': GERENCIA_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          type: 'Pedido Alkosto',
          date: item.fechaPedido || new Date().toISOString().split('T')[0],
          store: item.sucursalNombre,
          promoter: item.vendedora || 'SAIRU VALLES',
          product: itemsDesc.substring(0, 500),
          comments: JSON.stringify({
            tipo: 'PEDIDO_ALKOSTO',
            id: item.id,
            numeroPedido: item.numeroPedido,
            ordenCompraAlkosto: item.ordenCompraAlkosto,
            sucursalCodigo: item.sucursalCodigo,
            vendedora: item.vendedora || 'SAIRU VALLES',
            ruta: item.ruta || 'CUENTAS CLAVE 2',
            totalBultos: item.totalBultos,
            totalKilos: item.totalKilos,
            totalUSD: item.totalUSD,
            condicionPago: item.condicionPago,
            observaciones: item.observaciones,
            items: item.items
          })
        })
      }).catch(err => console.warn("Supabase external program alkosto error:", err));

    } catch (e) {
      console.warn("syncAlkostoOrderToExternal failure:", e);
    }
  }

  app.post("/api/alkosto/pedidos", async (req, res) => {
    try {
      const { db } = await import('./src/lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      const item = req.body;
      if (!item || !item.sucursalNombre) {
        return res.status(400).json({ error: "Falta sucursalNombre" });
      }
      const id = item.id || `alk-ord-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      
      // Asignar correlativo automáticamente en sala de espera si no viene asignado
      let correlativo = item.correlativo;
      if (!correlativo || correlativo === 'AUTO' || item.numeroPedido === 'PENDIENTE') {
        const { getDocs, collection } = await import('firebase/firestore');
        const snap = await getDocs(collection(db, 'alkosto_orders')).catch(() => null);
        const total = snap ? snap.size : 0;
        correlativo = String(total + 1).padStart(4, '0');
        item.correlativo = correlativo;
        item.numeroPedido = correlativo;
      }

      const record = {
        ...item,
        correlativo,
        id,
        createdAt: item.createdAt || new Date().toISOString()
      };
      await setDoc(doc(db, 'alkosto_orders', id), record, { merge: true });

      // Transmisión automática del pedido al programa externo / Google Sheets
      syncAlkostoOrderToExternal(record).catch(() => {});

      res.json({ success: true, data: record });
    } catch (err: any) {
      console.error("Error saving Alkosto order:", err);
      res.status(500).json({ error: "Error saving Alkosto order", details: err?.message });
    }
  });

  app.post("/api/alkosto/pedidos/transmitir", async (req, res) => {
    try {
      const item = req.body;
      if (!item || (!item.id && !item.numeroPedido)) {
        return res.status(400).json({ error: "Datos de pedido inválidos para transmisión" });
      }
      await syncAlkostoOrderToExternal(item);
      res.json({ success: true, message: "Pedido transmitido correctamente al programa externo y Google Sheets" });
    } catch (err: any) {
      console.error("Error transmitiendo pedido:", err);
      res.status(500).json({ error: "Error transmitiendo pedido", details: err?.message });
    }
  });

  app.put("/api/alkosto/pedidos/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const { db } = await import('./src/lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      await setDoc(doc(db, 'alkosto_orders', id), updates, { merge: true });
      res.json({ success: true, id, updated: updates });
    } catch (err: any) {
      console.error("Error updating Alkosto order:", err);
      res.status(500).json({ error: "Error updating Alkosto order", details: err?.message });
    }
  });

  app.delete("/api/alkosto/pedidos/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { db } = await import('./src/lib/firebase');
      const { doc, deleteDoc } = await import('firebase/firestore');

      await deleteDoc(doc(db, 'alkosto_orders', id));
      res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error deleting Alkosto order:", err);
      res.status(500).json({ error: "Error deleting Alkosto order", details: err?.message });
    }
  });

  // DICCIONARIO MAESTRO OFICIAL DE PRODUCTOS Y CÓDIGOS CODIZULCA
  const MASTER_PRODUCTOS_DICT = [
    { sku: '1496', nombre: 'MORTADELA ESP D/POLLO ASTURIAS 10UNDX900GR', barcode: '7590377000077', chainCodes: ['1461', '1496', '7590377000077'], unid: 'CJ' },
    { sku: '1519', nombre: 'MORTADELA ESP D/POLLO SALPICAO 10UNDX900GR', barcode: '', chainCodes: ['1462', '1519'], unid: 'CJ' },
    { sku: '21', nombre: 'MORTADELA ESP D/POLLO CORRAL 1X12UNI', barcode: '', chainCodes: ['21', '1463'], unid: 'CJ' },
    { sku: '1464', nombre: 'MORT. NAVIDEÑA ASTURIAS XKG', barcode: '', chainCodes: ['1464'], unid: 'KG' },
    { sku: '1461', nombre: 'MORT. ESTANDAR ASTURIAS X KG', barcode: '', chainCodes: ['1461'], unid: 'KG' },
    { sku: '1462', nombre: 'MORT. ESPECIAL COCIDA ASTURIAS X KG', barcode: '', chainCodes: ['1462'], unid: 'KG' },
    { sku: '1463', nombre: 'MORT. SUPERIOR ASTURIAS X KG', barcode: '', chainCodes: ['1463', '100929'], unid: 'KG' },
    { sku: '1512', nombre: 'MORT. PECHUGA DE PAVO ASTURIAS X KG', barcode: '', chainCodes: ['100881', '1512'], unid: 'KG' },
    { sku: '1511', nombre: 'MORT. PECHUGA DE POLLO ASTURIAS X KG', barcode: '', chainCodes: ['100882', '1511'], unid: 'KG' },
    { sku: '1561', nombre: 'MORT. PAVO TIPO SHOULDER ASTURIAS POR KG', barcode: '', chainCodes: ['1561'], unid: 'KG' },
    { sku: '1521', nombre: 'MORT. ECONOM COCIDA ASTURIAS X KG', barcode: '', chainCodes: ['1521'], unid: 'KG' },
    { sku: '1522', nombre: 'MORT. TIPO AREPERO ASTURIAS X KG', barcode: '', chainCodes: ['1522'], unid: 'KG' },
    { sku: '1564', nombre: 'MORTADELA EXTRA ASTURIAS X KG', barcode: '', chainCodes: ['1564'], unid: 'KG' },
    { sku: '1563', nombre: 'MORT. ESTANDAR SALPICAO X KG', barcode: '', chainCodes: ['1563'], unid: 'KG' },
    { sku: '1562', nombre: 'MORT. ESPECIAL COCIDA SALPICAO X KG', barcode: '', chainCodes: ['1562'], unid: 'KG' },
    { sku: '1599', nombre: 'MORT. NAVIDEÑA SALPICAO X KG', barcode: '', chainCodes: ['1599'], unid: 'KG' },
    { sku: '927', nombre: 'MORTADELA ESP. CARACAS 10X900GRS', barcode: '', chainCodes: ['927'], unid: 'CJ' },
    { sku: '1051', nombre: 'MORTADELA ESP. CARACAS 10X500GRS', barcode: '', chainCodes: ['1051'], unid: 'CJ' },
    { sku: '1242', nombre: 'MORT. CHORIZO ESPECIAL CDZ X KG', barcode: '', chainCodes: ['1242'], unid: 'KG' },
    { sku: '1446', nombre: 'CHULETA FRESCA ASTURIAS POR KG', barcode: '', chainCodes: ['1446'], unid: 'KG' },
    { sku: '1088', nombre: 'CHULETA FRESCA IBERICO POR KG', barcode: '', chainCodes: ['1088'], unid: 'KG' },
    { sku: '1445', nombre: 'TOCINO FRESCO ASTURIAS X KG', barcode: '', chainCodes: ['1445'], unid: 'KG' },
    { sku: '340', nombre: 'CHULETA AHUMADA ALIMEX X KG', barcode: '', chainCodes: ['340'], unid: 'KG' },
    { sku: '171', nombre: 'JAMON COC. SUPERIOR ALIMEX 1X5.9KG', barcode: '', chainCodes: ['171', '100929'], unid: 'CJ' },
    { sku: '172', nombre: 'ESPALDA COCIDA ALIMEX 1X4.6KG', barcode: '', chainCodes: ['172'], unid: 'CJ' },
    { sku: '241', nombre: 'ESPAL. AHUM T/VISKING ALIMEX 6X3.2', barcode: '', chainCodes: ['241'], unid: 'CJ' },
    { sku: '439', nombre: 'ESPAL AHUM.T/AREPERO ALIMEX 12X1,6KG', barcode: '', chainCodes: ['439'], unid: 'CJ' },
    { sku: '995', nombre: 'ESPAL. AHUM T/VISKING ITALICO 6UNDX3.2KG', barcode: '', chainCodes: ['995'], unid: 'CJ' },
    { sku: '337', nombre: 'JAMON COCIDO ESTANDAR ITALICO X KG', barcode: '', chainCodes: ['337'], unid: 'KG' },
    { sku: '170', nombre: 'TOCINETA AHUM S/CUERO ALIMEX X KG', barcode: '', chainCodes: ['170'], unid: 'KG' },
    { sku: '177', nombre: 'SALCHICHA VIENA ALIMEX 16 X 450 GRS', barcode: '', chainCodes: ['177'], unid: 'CJ' },
    { sku: '176', nombre: 'SALCHICHA VIENA ALIMEX 8 X 800 GRS', barcode: '', chainCodes: ['176'], unid: 'CJ' },
    { sku: '101', nombre: 'POLLO BENEFICIADO ENTERO', barcode: '', chainCodes: ['101', 'POLLO'], unid: 'KG' },
    { sku: '103', nombre: 'FILET VARIAS PRESENTACIONES', barcode: '', chainCodes: ['103', 'FILET'], unid: 'KG' },
    { sku: '629', nombre: 'MUSLO CUADRIL DESPRESADO POR KG', barcode: '', chainCodes: ['629', '102', 'MUSLO'], unid: 'KG' },
    { sku: '630', nombre: 'ALAS DESPRESADAS POR KG', barcode: '', chainCodes: ['630', 'ALAS'], unid: 'KG' },
    { sku: '870', nombre: 'HIGADO (EMPACADO)', barcode: '', chainCodes: ['870'], unid: 'KG' },
    { sku: '393', nombre: 'MOLLEJA (EMPACADA)', barcode: '', chainCodes: ['393'], unid: 'KG' },
    { sku: 'QS', nombre: 'QUESO AMARILLO', barcode: '', chainCodes: ['QS', 'QUESO'], unid: 'KG' },
    { sku: '301', nombre: 'ACEITE VEGETAL COMESTIBLE 12X1LT', barcode: '', chainCodes: ['301', 'ACEITE'], unid: 'CJ' },
    { sku: '302', nombre: 'AZUCAR REFINADA BLANCA 50KG', barcode: '', chainCodes: ['302', 'AZUCAR'], unid: 'CJ' },
    { sku: '303', nombre: 'ARROZ BLANCO ESPECIAL 24X1KG', barcode: '', chainCodes: ['303', 'ARROZ'], unid: 'CJ' },
    { sku: '401', nombre: 'HUEVOS BLANCOS SELECCIONADOS', barcode: '', chainCodes: ['401', 'HUEVOS'], unid: 'CJ' },
    { sku: '1360', nombre: 'PATATAS FRESCAS MARQUISE 4X2.5KG', barcode: '', chainCodes: ['1360', 'PATATAS'], unid: 'CJ' },
    { sku: '1569', nombre: 'PATATAS FRESCAS DOBLE COBERTURA 4X2.5KG', barcode: '', chainCodes: ['1569'], unid: 'CJ' },
    { sku: 'UTH', nombre: 'LECHE LIQUIDA UHT 12X1LT', barcode: '', chainCodes: ['UTH'], unid: 'CJ' },
    { sku: 'LPV', nombre: 'LECHE EN POLVO VENCAMPO', barcode: '', chainCodes: ['LPV'], unid: 'CJ' },
    { sku: 'JUGOS', nombre: 'JUGOS Y NECTAR VARIOS', barcode: '', chainCodes: ['JUGOS', 'BEBIDAS'], unid: 'CJ' },
    { sku: '1572', nombre: 'CAJAS DE PIZZA 1X100', barcode: '', chainCodes: ['1572'], unid: 'BLT' }
  ];

  function resolverProductoBackend(codInput: string, descInput: string) {
    const rawCod = String(codInput || '').trim();
    const cleanCod = rawCod.replace(/[\s\-_.]/g, '').toUpperCase();
    const cleanDesc = String(descInput || '').trim().toUpperCase();

    // 1. Coincidencia exacta SKU
    if (cleanCod) {
      const match = MASTER_PRODUCTOS_DICT.find(p => p.sku.toUpperCase() === cleanCod);
      if (match) return match;
    }

    // 2. Coincidencia por código de barra (EAN-13)
    if (cleanCod) {
      const match = MASTER_PRODUCTOS_DICT.find(p => p.barcode && p.barcode.replace(/[\s\-_.]/g, '') === cleanCod);
      if (match) return match;
    }

    // 3. Coincidencia por código de cadena (Alkosto / Familia Center)
    if (cleanCod) {
      const match = MASTER_PRODUCTOS_DICT.find(p => p.chainCodes && p.chainCodes.some(c => c.toUpperCase() === cleanCod));
      if (match) return match;
    }

    // 4. Coincidencia por texto de descripción
    if (cleanDesc) {
      const match = MASTER_PRODUCTOS_DICT.find(p => {
        const pNorm = p.nombre.toUpperCase();
        return cleanDesc.includes(pNorm) || pNorm.includes(cleanDesc);
      });
      if (match) return match;

      // Tokens clave
      const tokens = cleanDesc.split(/\s+/).filter(t => t.length > 2 && !['POR', 'CON', 'DEL', 'LOS', 'LAS', 'PARA'].includes(t));
      if (tokens.length > 0) {
        const tokenMatch = MASTER_PRODUCTOS_DICT.find(p => {
          const pNorm = p.nombre.toUpperCase();
          return tokens.filter(t => pNorm.includes(t)).length >= Math.min(2, tokens.length);
        });
        if (tokenMatch) return tokenMatch;
      }
    }

    return null;
  }

  // Helper numérico robusto contra formato venezolano e internacional (ej: 210,00 o 1.500,50 o 1,500.50 o con símbolos)
  function parseNumeroSeguro(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const s = String(val).trim();
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      const num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    }
    if (/^\d+,\d+$/.test(s)) {
      const num = parseFloat(s.replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    const cleaned = s.replace(/[$BsUSD\s]/gi, '');
    if (cleaned.includes('.') && cleaned.includes(',')) {
      if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
        const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
      } else {
        const n = parseFloat(cleaned.replace(/,/g, ''));
        return isNaN(n) ? 0 : n;
      }
    }
    if (cleaned.includes(',')) {
      const n = parseFloat(cleaned.replace(',', '.'));
      return isNaN(n) ? 0 : n;
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  // LECTOR OCR INTELIGENTE DE ÓRDENES DE COMPRA ALKOSTO Y FAMILIA CENTER CON LECTURA OPTIMIZADA DE CÓDIGOS
  app.post("/api/alkosto/ocr-orden", async (req, res) => {
    try {
      const { imageBase64, mimeType = "image/jpeg" } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Falta la imagen de la orden de compra" });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Analiza detalladamente esta Orden de Compra dirigida a CODIZULCA, C.A. Puede pertenecer a:
1. ALKOSTO (ALKOSTO DONDE COMPRAR ES GANAR, C.A.): contiene columnas por tienda AK01, AK02, AK03, AK04, AK05, AK06, AK07, AK08, AK09, AK10 (y AKOP).
2. FAMILIA CENTER (FAMILIA CENTER, C.A.): contiene columnas por tienda FC01, FC02, FC03, FC04, FC05, FC06, FC07 (y FCOP).

Extrae minuciosamente toda la información de cabecera y CADA UNO de los renglones/productos con sus códigos, descripciones, cantidades por tienda, totales y montos.

DICCIONARIO MAESTRO DE CÓDIGOS Y PRODUCTOS CODIZULCA PARA ASISTIR LA LECTURA EXACTA:
- EAN-13: 7590377000077 -> SKU 1496 (o 1461) MORTADELA ESP D/POLLO ASTURIAS 10UNDX900GR (Unidad: CJ)
- Cadena Alkosto: 100881 -> SKU 1512 MORT. PECHUGA DE PAVO ASTURIAS X KG (Unidad: KG)
- Cadena Alkosto: 100882 -> SKU 1511 MORT. PECHUGA DE POLLO ASTURIAS X KG (Unidad: KG)
- Cadena Alkosto: 100929 -> SKU 1463 / 171 JAMON COCIDO DE PAVO AHUMADO SUPERIOR / JAMON SUPERIOR ALIMEX (Unidad: KG/CJ)
- Código 1446 -> SKU 1446 CHULETA FRESCA ASTURIAS POR KG (Unidad: KG)
- Código 1462 / 1519 -> SKU 1519 MORTADELA ESP D/POLLO SALPICAO 10UNDX900GR (Unidad: CJ)
- Código 21 -> SKU 21 MORTADELA ESP D/POLLO CORRAL 1X12UNI (Unidad: CJ)
- Código 1464 -> SKU 1464 MORT. NAVIDEÑA ASTURIAS XKG (Unidad: KG)
- Código 1461 -> SKU 1461 MORT. ESTANDAR ASTURIAS X KG (Unidad: KG)
- Código 171 -> SKU 171 JAMON COC. SUPERIOR ALIMEX 1X5.9KG (Unidad: CJ)
- Código 172 -> SKU 172 ESPALDA COCIDA ALIMEX 1X4.6KG (Unidad: CJ)
- Código 630 / ALAS -> SKU 630 ALAS DESPRESADAS POR KG (Unidad: KG)
- Código 629 / 102 / MUSLO -> SKU 629 MUSLO CUADRIL DESPRESADO POR KG (Unidad: KG)
- Código 101 / POLLO -> SKU 101 POLLO BENEFICIADO ENTERO (Unidad: KG)

REGLAS CRÍTICAS PARA LA LECTURA DE CÓDIGOS DE PRODUCTOS:
1. "codigo": Lee el código EXACTO impreso en la columna de código de cada renglón. Puede ser un código de barra EAN-13 (13 dígitos limpios ej: 7590377000077), código interno de la cadena (ej. 100881, 100882, 100929) o código interno del proveedor (1446, 1461, etc.). ELIMINA cualquier espacio, punto, guion o letra extra.
2. "skuCodizulca": Identifica el código SKU oficial de Codizulca correspondiente del diccionario (ej: 7590377000077 -> "1496"; 100881 -> "1512"; 100882 -> "1511"; 1446 -> "1446").
3. "codigoBarra": Si el producto tiene código de barras de 13 dígitos o en la orden aparece el EAN (ej. 7590377000077), colócalo en este campo.
4. "unid": Asigna "CJ" para embutidos o víveres empacados en bultos o cajas (mortadelas 10x900g, 12uni, latas, aceites, etc., o si EMP > 0), o "KG" para productos pesables a granel/vacío (chuletas por kg, pechugas de pavo por kg, pollo por kg, alas por kg).`;

      const ocResponseSchema = {
        type: Type.OBJECT,
        properties: {
          clienteCadena: { type: Type.STRING },
          ordenNro: { type: Type.STRING },
          sede: { type: Type.STRING },
          fechaEmision: { type: Type.STRING },
          fechaEntrega: { type: Type.STRING },
          diasCredito: { type: Type.NUMBER },
          tasaCambio: { type: Type.NUMBER },
          proveedorNombre: { type: Type.STRING },
          proveedorRif: { type: Type.STRING },
          subtotal: { type: Type.NUMBER },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                renglon: { type: Type.NUMBER },
                codigo: { type: Type.STRING },
                skuCodizulca: { type: Type.STRING },
                codigoBarra: { type: Type.STRING },
                descripcion: { type: Type.STRING },
                unid: { type: Type.STRING },
                emp: { type: Type.NUMBER },
                totalCantidad: { type: Type.NUMBER },
                costoBruto: { type: Type.NUMBER },
                costoUnitario: { type: Type.NUMBER },
                totalRenglon: { type: Type.NUMBER },
                tiendas: {
                  type: Type.OBJECT,
                  properties: {
                    AK01: { type: Type.NUMBER },
                    AK02: { type: Type.NUMBER },
                    AK03: { type: Type.NUMBER },
                    AK04: { type: Type.NUMBER },
                    AK05: { type: Type.NUMBER },
                    AK06: { type: Type.NUMBER },
                    AK07: { type: Type.NUMBER },
                    AK08: { type: Type.NUMBER },
                    AK09: { type: Type.NUMBER },
                    AK10: { type: Type.NUMBER },
                    AKOP: { type: Type.NUMBER },
                    FC01: { type: Type.NUMBER },
                    FC02: { type: Type.NUMBER },
                    FC03: { type: Type.NUMBER },
                    FC04: { type: Type.NUMBER },
                    FC05: { type: Type.NUMBER },
                    FC06: { type: Type.NUMBER },
                    FC07: { type: Type.NUMBER },
                    FCOP: { type: Type.NUMBER }
                  }
                }
              },
              required: ["codigo", "descripcion", "totalCantidad"]
            }
          }
        },
        required: ["ordenNro", "items"]
      };

      let rawResponseText = '';
      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
      let lastModelError: any = null;

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType, data: imageBase64 } },
                  { text: prompt }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: ocResponseSchema,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              temperature: 0.1
            }
          });
          if (response && response.text) {
            rawResponseText = response.text;
            break;
          }
        } catch (mErr: any) {
          console.warn(`Intento OCR con schema en ${modelName} falló:`, mErr?.message);
          // Reintento sin schema estricto por si el modelo tiene incompatibilidad
          try {
            const fallbackRes = await ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  role: "user",
                  parts: [
                    { inlineData: { mimeType, data: imageBase64 } },
                    { text: prompt }
                  ]
                }
              ],
              config: {
                responseMimeType: "application/json",
                temperature: 0.1
              }
            });
            if (fallbackRes && fallbackRes.text) {
              rawResponseText = fallbackRes.text;
              break;
            }
          } catch (fbErr: any) {
            lastModelError = fbErr;
          }
        }
      }

      if (!rawResponseText) {
        throw new Error(lastModelError?.message || "No se obtuvo respuesta del motor de IA para el OCR");
      }

      // Función robusta para extracción y parseo seguro de JSON con tolerancia a markdown y caracteres extra
      function safeExtractJson(raw: string): any {
        if (!raw || typeof raw !== "string") {
          throw new Error("Respuesta vacía del motor OCR");
        }
        let text = raw.trim();

        // 1. Extraer contenido de bloques markdown ```json ... ``` si existen
        const mdCodeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (mdCodeBlock && mdCodeBlock[1]) {
          text = mdCodeBlock[1].trim();
        } else if (text.startsWith("```")) {
          text = text.replace(/^```[a-z]*\s*/i, "").replace(/```$/s, "").trim();
        }

        // 2. Intentar JSON.parse directo
        try {
          return JSON.parse(text);
        } catch (err: any) {
          // Si el error indica caracteres sobrantes tras el JSON (ej. Unexpected non-whitespace character after JSON at position N)
          const posMatch = err.message && err.message.match(/at position (\d+)/);
          if (posMatch) {
            const pos = parseInt(posMatch[1], 10);
            try {
              return JSON.parse(text.substring(0, pos).trim());
            } catch (e2) {}
          }
        }

        // 3. Extracción por balanceo preciso de llaves de objeto { ... }
        const firstBrace = text.indexOf("{");
        if (firstBrace !== -1) {
          let depth = 0;
          let inString = false;
          let escape = false;
          let endPos = -1;

          for (let i = firstBrace; i < text.length; i++) {
            const ch = text[i];
            if (escape) {
              escape = false;
              continue;
            }
            if (ch === '\\') {
              escape = true;
              continue;
            }
            if (ch === '"') {
              inString = !inString;
              continue;
            }
            if (!inString) {
              if (ch === '{') depth++;
              else if (ch === '}') {
                depth--;
                if (depth === 0) {
                  endPos = i;
                  break;
                }
              }
            }
          }

          if (endPos !== -1) {
            const candidate = text.substring(firstBrace, endPos + 1).trim();
            try {
              return JSON.parse(candidate);
            } catch (e3) {
              try {
                // Remover posibles comas finales antes de } o ]
                const cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
                return JSON.parse(cleaned);
              } catch (e4) {}
            }
          }

          // Fallback: buscar la última llave '}'
          const lastBrace = text.lastIndexOf("}");
          if (lastBrace > firstBrace) {
            const candidate2 = text.substring(firstBrace, lastBrace + 1).trim();
            try {
              return JSON.parse(candidate2);
            } catch (e5) {
              try {
                const cleaned2 = candidate2.replace(/,\s*([}\]])/g, '$1');
                return JSON.parse(cleaned2);
              } catch (e6) {}
            }
          }
        }

        throw new Error("No se pudo interpretar el JSON devuelto por el lector OCR");
      }

      const parsed = safeExtractJson(rawResponseText);

      // Normalizar raíz del objeto si viene envuelta
      let rootOrder: any = parsed;
      if (parsed.orden && typeof parsed.orden === 'object') rootOrder = parsed.orden;
      else if (parsed.ordenCompra && typeof parsed.ordenCompra === 'object') rootOrder = parsed.ordenCompra;
      else if (parsed.ordenDeCompra && typeof parsed.ordenDeCompra === 'object') rootOrder = parsed.ordenDeCompra;
      else if (parsed.orden_compra && typeof parsed.orden_compra === 'object') rootOrder = parsed.orden_compra;
      else if (parsed.orden_de_compra && typeof parsed.orden_de_compra === 'object') rootOrder = parsed.orden_de_compra;
      else if (parsed.compra && typeof parsed.compra === 'object') rootOrder = parsed.compra;
      else if (parsed.pedido && typeof parsed.pedido === 'object') rootOrder = parsed.pedido;
      else if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) rootOrder = parsed.data;

      // Extraer lista de items/renglones con cualquier nomenclatura posible
      let rawItems: any[] = [];
      if (Array.isArray(rootOrder)) {
        rawItems = rootOrder;
        rootOrder = { items: rawItems };
      } else if (Array.isArray(rootOrder.items)) {
        rawItems = rootOrder.items;
      } else if (Array.isArray(rootOrder.articulos)) {
        rawItems = rootOrder.articulos;
      } else if (Array.isArray(rootOrder.artículos)) {
        rawItems = rootOrder.artículos;
      } else if (Array.isArray(rootOrder.productos)) {
        rawItems = rootOrder.productos;
      } else if (Array.isArray(rootOrder.renglones)) {
        rawItems = rootOrder.renglones;
      } else if (Array.isArray(rootOrder.detalle)) {
        rawItems = rootOrder.detalle;
      } else if (Array.isArray(rootOrder.detalles)) {
        rawItems = rootOrder.detalles;
      } else if (Array.isArray(rootOrder.lineas)) {
        rawItems = rootOrder.lineas;
      } else if (Array.isArray(rootOrder.filas)) {
        rawItems = rootOrder.filas;
      } else {
        // Búsqueda profunda de cualquier array de objetos en rootOrder
        for (const k of Object.keys(rootOrder)) {
          if (Array.isArray(rootOrder[k]) && rootOrder[k].length > 0 && typeof rootOrder[k][0] === 'object') {
            rawItems = rootOrder[k];
            break;
          }
        }
      }

      // Normalización y enriquecimiento de renglones con el maestro de productos Codizulca
      const cleanItems = rawItems.map((it: any, idx: number) => {
        const rawCod = String(
          it.codigo || 
          it.codigo_articulo || 
          it.codigo_producto || 
          it.skuCodizulca || 
          it.sku || 
          it.codigoBarra || 
          it.codigo_barra || 
          it.ean || 
          it.barcode || 
          it.referencia || 
          it.ref || 
          ''
        ).trim();
        const cleanCod = rawCod.replace(/[\s\-_.]/g, '');
        const desc = String(
          it.descripcion || 
          it.descripcion_producto || 
          it.producto || 
          it.nombre || 
          it.articulo || 
          it.detalle || 
          it.concepto || 
          it.item || 
          it.description || 
          ''
        ).trim();
        const match = resolverProductoBackend(cleanCod, desc);

        const finalSku = (match ? match.sku : '') || it.skuCodizulca || it.sku || (cleanCod.length <= 6 ? cleanCod : '') || cleanCod;
        const finalCodigo = cleanCod || finalSku || (match ? match.barcode : '');
        const finalBarcode = it.codigoBarra || it.ean || (match && match.barcode ? match.barcode : (/^\d{12,14}$/.test(cleanCod) ? cleanCod : undefined));
        // Priorizar la lectura exacta leída del documento físico/digital; si no viene descripción, usar la del catálogo
        const finalDesc = desc || (match ? match.nombre : '');

        const rawUnid = String(it.unid || it.unidad || it.unidadMedida || it.medida || '').trim().toUpperCase();
        let finalUnid = rawUnid;
        if (!finalUnid) {
          if (match?.unid) finalUnid = match.unid;
          else if (it.emp && parseNumeroSeguro(it.emp) > 0) finalUnid = 'CJ';
          else finalUnid = 'KG';
        }

        // Parsear desglose de tiendas con parseNumeroSeguro
        const cleanTiendas: Record<string, number> = {};
        const storeObj = (it.tiendas && typeof it.tiendas === 'object') ? it.tiendas : {};
        for (const [tag, val] of Object.entries(storeObj)) {
          const numVal = parseNumeroSeguro(val);
          if (numVal > 0) {
            cleanTiendas[tag.toUpperCase()] = numVal;
          }
        }

        // Detectar columnas de tiendas directamente en la raíz de 'it' (ej. it.AK01, it.AK02, it.FC01)
        for (const [k, val] of Object.entries(it)) {
          const uKey = k.toUpperCase();
          if (/^(AK\d{2}|AKOP|FC\d{2}|FCOP)$/.test(uKey)) {
            const numVal = parseNumeroSeguro(val);
            if (numVal > 0) {
              cleanTiendas[uKey] = numVal;
            }
          }
        }

        // Cantidad: tomar totalCantidad, cantidad, cant, cantidadSolicitada o suma de tiendas
        let totalCant = parseNumeroSeguro(it.totalCantidad) || 
                        parseNumeroSeguro(it.total_cantidad) || 
                        parseNumeroSeguro(it.cantidad) || 
                        parseNumeroSeguro(it.cant) || 
                        parseNumeroSeguro(it.cantidadSolicitada) || 
                        parseNumeroSeguro(it.cantidad_solicitada) || 
                        parseNumeroSeguro(it.total) || 
                        parseNumeroSeguro(it.cajas) || 
                        parseNumeroSeguro(it.bultos) || 
                        parseNumeroSeguro(it.kilos) || 0;

        if (!totalCant && Object.keys(cleanTiendas).length > 0) {
          totalCant = Object.values(cleanTiendas).reduce((sum, v) => sum + v, 0);
        }

        let precio = parseNumeroSeguro(it.costoUnitario) || 
                     parseNumeroSeguro(it.costo_unitario) || 
                     parseNumeroSeguro(it.costoBruto) || 
                     parseNumeroSeguro(it.costo_bruto) || 
                     parseNumeroSeguro(it.precio) || 
                     parseNumeroSeguro(it.precioUnitario) || 
                     parseNumeroSeguro(it.precio_unitario) || 
                     parseNumeroSeguro(it.costo) || 
                     parseNumeroSeguro(it.valor_unitario) || 0;

        let total = parseNumeroSeguro(it.totalRenglon) || 
                    parseNumeroSeguro(it.total_renglon) || 
                    parseNumeroSeguro(it.subtotal) || 
                    parseNumeroSeguro(it.total) || 
                    parseNumeroSeguro(it.importe) || 
                    parseNumeroSeguro(it.monto);

        if (!precio && total > 0 && totalCant > 0) {
          precio = Number((total / totalCant).toFixed(2));
        } else if (precio > 0 && !total) {
          total = Number((totalCant * precio).toFixed(2));
        }

        return {
          ...it,
          renglon: Number(it.renglon) || idx + 1,
          codigo: finalSku || finalCodigo,
          skuCodizulca: finalSku,
          codigoBarra: finalBarcode,
          descripcion: finalDesc,
          unid: finalUnid,
          emp: parseNumeroSeguro(it.emp) || 0,
          totalCantidad: totalCant,
          costoBruto: precio,
          costoUnitario: precio,
          totalRenglon: total,
          tiendas: cleanTiendas
        };
      });

      rootOrder.items = cleanItems;
      rootOrder.ordenNro = String(
        rootOrder.ordenNro || 
        parsed.ordenNro || 
        rootOrder.numeroOrden || 
        parsed.numeroOrden || 
        rootOrder.numero || 
        parsed.numero || 
        rootOrder.nroOrden || 
        parsed.nroOrden || 
        rootOrder.nro_orden || 
        parsed.nro_orden || 
        rootOrder.oc || 
        parsed.oc || 
        rootOrder.orden || 
        parsed.orden || 
        rootOrder.pedido || 
        parsed.pedido || 
        rootOrder.nroPedido || 
        parsed.nroPedido || 
        rootOrder.numOrden ||
        parsed.numOrden ||
        ''
      ).trim();
      rootOrder.sede = String(rootOrder.sede || parsed.sede || rootOrder.sucursal || rootOrder.codigoSede || '').trim();
      rootOrder.fechaEmision = String(rootOrder.fechaEmision || parsed.fechaEmision || rootOrder.fecha || rootOrder.emision || '').trim();
      rootOrder.fechaEntrega = String(rootOrder.fechaEntrega || parsed.fechaEntrega || rootOrder.entrega || rootOrder.fechaEstimada || '').trim();
      rootOrder.clienteCadena = rootOrder.clienteCadena || parsed.clienteCadena || (rootOrder.sede?.startsWith('FC') ? 'FAMILIA_CENTER' : 'ALKOSTO');
      rootOrder.subtotal = parseNumeroSeguro(rootOrder.subtotal) || cleanItems.reduce((acc: number, item: any) => acc + (parseNumeroSeguro(item.totalRenglon) || 0), 0);

      return res.json({ success: true, data: rootOrder });
    } catch (err: any) {
      console.error("Error en OCR Alkosto:", err);
      return res.status(500).json({ error: "Error procesando orden de compra", details: err?.message });
    }
  });

  // RUTAS PARA ABREVIATURAS Y SUCURSALES DE CADENAS (ALKOSTO & FAMILIA CENTER)
  const ABREVIATURAS_CONFIG = {
    alkosto: [
      { codigo: '7497', tag: 'AK01', nombre: 'Alkosto 01 - Zona Industrial', zona: 'Maracaibo Sur', direccion: 'Av. 68 con Calle 148, Zona Industrial' },
      { codigo: '7498', tag: 'AK02', nombre: 'Alkosto 02 - La Limpia', zona: 'Maracaibo Oeste', direccion: 'Av. 28 La Limpia con Calle 79' },
      { codigo: '7499', tag: 'AK03', nombre: 'Alkosto 03 - Delicias Norte', zona: 'Maracaibo Norte', direccion: 'Av. 15 Las Delicias, CC Delicias Plaza' },
      { codigo: '7500', tag: 'AK04', nombre: 'Alkosto 04 - Circunvalación 2', zona: 'Maracaibo Centro-Oeste', direccion: 'Av. Circunvalación 2, Sector Sabaneta' },
      { codigo: '7501', tag: 'AK05', nombre: 'Alkosto 05 - Bella Vista', zona: 'Maracaibo Este', direccion: 'Calle 72 con Av. 4 Bella Vista' },
      { codigo: '7502', tag: 'AK06', nombre: 'Alkosto 06 - San Francisco', zona: 'San Francisco', direccion: 'Av. 40 con Calle 161, San Francisco' },
      { codigo: '7503', tag: 'AK07', nombre: 'Alkosto 07 - Curva de Molina', zona: 'Maracaibo Nor-Oeste', direccion: 'Av. La Limpia Oeste, Curva de Molina' },
      { codigo: '7680', tag: 'AK08', nombre: 'Alkosto 08 - El Milagro', zona: 'Maracaibo Norte', direccion: 'Av. 2 El Milagro frente a Vereda del Lago' },
      { codigo: '7905', tag: 'AK09', nombre: 'Alkosto 09 - La Coromoto', zona: 'San Francisco', direccion: 'Urb. La Coromoto, Av. 40' },
      { codigo: '8160', tag: 'AK10', nombre: 'Alkosto 10 - Cabimas', zona: 'Costa Oriental del Lago', direccion: 'Av. Intercomunal Sector Las Cabillas, Cabimas' },
      { codigo: '1560', tag: 'AKOP', nombre: 'Alkosto Sede Principal / AKOP', zona: 'Maracaibo Paraíso', direccion: 'Calle 78 Dr Portillo Local 17-71 Sector Paraíso' }
    ],
    familiaCenter: [
      { codigo: '7489', tag: 'FC01', nombre: 'Familia Center 01', zona: 'Maracaibo', direccion: 'Familia Center Sucursal 01' },
      { codigo: '7490', tag: 'FC02', nombre: 'Familia Center 02', zona: 'Maracaibo', direccion: 'Familia Center Sucursal 02' },
      { codigo: '7491', tag: 'FC03', nombre: 'Familia Center 03', zona: 'Maracaibo', direccion: 'Familia Center Sucursal 03' },
      { codigo: '7492', tag: 'FC04', nombre: 'Familia Center 04', zona: 'Maracaibo', direccion: 'Familia Center Sucursal 04' },
      { codigo: '7493', tag: 'FC05', nombre: 'Familia Center 05', zona: 'Maracaibo', direccion: 'Familia Center Sucursal 05' },
      { codigo: '7494', tag: 'FC06', nombre: 'Familia Center 06', zona: 'Maracaibo', direccion: 'Familia Center Sucursal 06' },
      { codigo: '8229', tag: 'FC07', nombre: 'Familia Center 07', zona: 'Maracaibo', direccion: 'Familia Center Sucursal 07' },
      { codigo: '5373', tag: 'FCOP', nombre: 'Familia Center Sede Principal / FCOP', zona: 'Maracaibo', direccion: 'Familia Center Sede Principal' }
    ],
    tags: {
      alkosto: ['AK01', 'AK02', 'AK03', 'AK04', 'AK05', 'AK06', 'AK07', 'AK08', 'AK09', 'AK10'],
      familiaCenter: ['FC01', 'FC02', 'FC03', 'FC04', 'FC05', 'FC06', 'FC07']
    }
  };

  app.get("/api/cadenas/sucursales", async (req, res) => {
    try {
      res.json({
        success: true,
        ...ABREVIATURAS_CONFIG
      });
    } catch (err: any) {
      res.status(500).json({ error: "Error obteniendo sucursales de cadenas" });
    }
  });

  app.post("/api/cadenas/sincronizar", async (req, res) => {
    try {
      const { db } = await import('./src/lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      await setDoc(doc(db, 'cadenas_config', 'abreviaturas'), {
        ...ABREVIATURAS_CONFIG,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      res.json({ success: true, message: "Abreviaturas de Alkosto y Familia Center sincronizadas correctamente en Firestore" });
    } catch (err: any) {
      console.error("Error sincronizando cadenas en Firestore:", err);
      res.status(500).json({ error: "Error sincronizando en Firestore", details: err?.message });
    }
  });

  // Proxy / API Routes
  app.post("/api/ocr", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "Missing image" });
      
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      let attempt = 0;
      let maxAttempts = 5;
      
      while (attempt < maxAttempts) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: {
              parts: [
                { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                { text: "Extrae la siguiente información de este recibo bancario o manuscrito y devuelve únicamente un JSON válido: banco (nombre completo oficial del banco, sin abreviaciones, ej: Banco de Venezuela, Banesco, Mercantil, etc), monto (numérico sin símbolos, usa punto para decimales), referencia (string), fecha_pago (formato YYYY-MM-DD. OJO: Los recibos venezolanos están en formato DD/MM/YYYY, por lo que 02/07/2026 es 2 de julio de 2026, es decir 2026-07-02), titular (quien envía el dinero, no el receptor), rif (RIF o Cédula de identidad del titular/remitente, ej: J-12345678-9, V-12345678), productos (lista de strings con los códigos o nombres de los artículos identificados). DICCIONARIO PARA RECONOCER CÓDIGOS Y PRODUCTOS CODIZULCA: 1496/7590377000077=MORTADELA ESPECIAL DE POLLO ASTURIAS 10X900G, 1519/1462=MORTADELA ESP D/POLLO SALPICAO 10X900G, 21=MORTADELA CORRAL 1X12, 1464=MORT. NAVIDEÑA ASTURIAS X KG, 1461=MORT. ESTANDAR ASTURIAS X KG, 1462=MORT. ESPECIAL COCIDA ASTURIAS, 1463=MORT. SUPERIOR ASTURIAS, 1512/100881=MORT. PECHUGA DE PAVO ASTURIAS, 1511/100882=MORT. PECHUGA DE POLLO ASTURIAS, 1561=MORT. PAVO SHOULDER, 1521=MORT. ECONOMICA ASTURIAS, 1522=MORT. AREPERO ASTURIAS, 1564=MORTADELA EXTRA, 1563=MORT. ESTANDAR SALPICAO, 1562=MORT. ESPECIAL SALPICAO, 1599=MORT. NAVIDEÑA SALPICAO, 927=MORTADELA CARACAS 10X900, 1051=MORTADELA CARACAS 10X500, 1242=MORT. CHORIZO ESPECIAL, 1446=CHULETA FRESCA ASTURIAS POR KG, 1088=CHULETA FRESCA IBERICO, 1445=TOCINO FRESCO ASTURIAS, 340=CHULETA AHUMADA ALIMEX, 171/100929=JAMON COC. SUPERIOR ALIMEX, 172=ESPALDA COCIDA ALIMEX, 241=ESPALDA VISKING ALIMEX, 439=ESPALDA AREPERO ALIMEX, 995=ESPALDA VISKING ITALICO, 337=JAMON ITALICO, 170=TOCINETA ALIMEX, 177=SALCHICHA VIENA 16X450, 176=SALCHICHA VIENA 8X800, POLLO/101=POLLO ENTERO, FILET/103=FILET DE POLLO, MUSLO/629=MUSLO CUADRIL, 630/ALAS=ALAS DESPRESADAS, 870=HIGADO, 393=MOLLEJA, QS=QUESO AMARILLO, 301/ACEITE=ACEITE VEGETAL, 302/AZUCAR=AZUCAR, 303/ARROZ=ARROZ 900G, 401/HUEVOS=HUEVOS BLANCOS, 1360=PATATAS MARQUISE, 1569=PATATAS DOBLE COBERTURA, UTH=LECHE LIQUIDA, LPV=LECHE EN POLVO VENCAMPO, JUGOS=JUGOS Y NECTAR, 1572=CAJAS DE PIZZA. Si no logras leer algo, devuélvelo como un string vacío \"\" en lugar de null." }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  banco: { type: Type.STRING },
                  monto: { type: Type.NUMBER },
                  referencia: { type: Type.STRING },
                  fecha_pago: { type: Type.STRING },
                  titular: { type: Type.STRING },
                  rif: { type: Type.STRING }
                }
              }
            }
          });
          
          let result = JSON.parse(response.text || '{}');
          return res.json(result);
        } catch (error: any) {
          const isRetryable = error.status === 429 || error.status === 503 || 
            (error.message && (error.message.includes('429') || error.message.includes('503')));
          
          if (isRetryable) {
            attempt++;
            if (attempt >= maxAttempts) {
              return res.status(503).json({ error: "El servicio de validación está saturado. Por favor, reintente en unos segundos." });
            }
            const baseDelay = 1000 * Math.pow(2, attempt);
            const jitter = Math.random() * 500;
            await new Promise(r => setTimeout(r, baseDelay + jitter));
          } else {
            console.error("Non-retryable OCR Error:", error);
            return res.status(500).json({ error: error.message || "Error al procesar la imagen" });
          }
        }
      }
    } catch (err: any) {
      console.error("OCR Outer Error:", err);
      return res.status(500).json({ error: "Fallo inesperado al procesar comprobante" });
    }
  });

  app.get("/api/tasa-bcv", async (req, res) => {
    try {
      const dateStr = req.query.date as string;
      if (!dateStr) return res.status(400).json({ error: "Missing date parameter" });

      // dateStr viene en formato YYYY-MM-DD
      const [year, month, day] = dateStr.split('-');
      const m = parseInt(month, 10);
      const d = parseInt(day, 10);

      // 1. Intentar buscar la fecha exacta en el archivo histórico de dolarvzla
      const historicalUrl = `https://rates.dolarvzla.com/bcv/${year}/${m}/${d}.json`;
      
      try {
        const histRes = await fetch(historicalUrl);
        if (histRes.ok) {
          const histData = await histRes.json();
          if (histData && histData.usd) {
             return res.json({ tasa: Number(histData.usd.toFixed(2)) });
          }
        }
      } catch (err) {
        console.log("No se pudo obtener el histórico, intentando actual...", err);
      }

      // 2. Fallback: buscar la tasa oficial actual si falló el histórico o no existe aún
      const response = await fetch("https://ve.dolarapi.com/v1/dolares/oficial");
      
      if (!response.ok) {
        throw new Error(`API respondió con status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.promedio) {
        res.json({ tasa: Number(data.promedio.toFixed(2)) });
      } else {
        res.status(404).json({ error: "Tasa no encontrada en la API" });
      }
    } catch (err: any) {
      console.error("Error fetching BCV rate:", err);
      res.status(500).json({ error: "Error interno al consultar la tasa" });
    }
  });

  app.get("/api/sheets-structure", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
         return res.status(401).json({ error: "Missing or invalid Authorization header" });
      }
      const token = authHeader.split(' ')[1];
      const spreadsheetId = '1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg';

      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!metaRes.ok) {
        return res.status(metaRes.status).json({ error: "Failed to fetch spreadsheet structure" });
      }

      const metaData = await metaRes.json();
      const sheets = metaData.sheets.map((s: any) => ({
         title: s.properties.title,
         sheetId: s.properties.sheetId
      }));

      // Ahora que tenemos los nombres, podemos obtener el contenido de cada hoja (primeras filas)
      // Para saber qué hay en cada una
      const result: Record<string, any> = { sheets: sheets };
      
      for (const sheet of sheets) {
         const dataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheet.title}'!A1:Z100`, {
            headers: { 'Authorization': `Bearer ${token}` }
         });
         if (dataRes.ok) {
            const data = await dataRes.json();
            result[sheet.title] = data.values || [];
         }
      }

      // IMPORTANTE: Guardarlo en disco local para que el agente (yo) pueda leerlo
      fs.writeFileSync(path.join(process.cwd(), 'sheets_dump.json'), JSON.stringify(result, null, 2));

      return res.json({ success: true, message: "Data guardada en sheets_dump.json" });

    } catch (err: any) {
      console.error("Structure lookup error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/usuarios", async (req, res) => {
    try {
      const workbook = await getWorkbook(req.query.force === 'true');
      const XLSX = await import('xlsx');
      const uSheet = workbook.Sheets['Usuarios'];
      if (!uSheet) return res.json([]);
      const rows = XLSX.utils.sheet_to_json(uSheet, { header: 1 });
      const users: any[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] as any[];
        if (r && r[0]) {
          users.push({
            usuario: String(r[0]).trim(),
            cedula: String(r[1]).trim(),
            rol: String(r[2] || 'Vendedor').trim(),
            vendorId: String(r[3] || '').trim()
          });
        }
      }
      return res.json(users);
    } catch (err: any) {
      console.error("Error fetching usuarios:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/client-lookup", async (req, res) => {
    try {
      const codigo = req.query.codigo as string;
      if (!codigo) {
        return res.status(400).json({ error: "Missing 'codigo' parameter" });
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('codigo', codigo)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      let vendedorNombre = data.vendedor_nombre;
      let vendedorEmail = '';
      if (vendedorNombre && /johnatan|soto|mikelangelo/i.test(vendedorNombre)) {
        vendedorNombre = 'Mikelangelo Diaz';
        vendedorEmail = 'Mikelangelodiaz@gmail.com';
      }
      return res.json({ 
        nombre: data.razon_social, 
        vendedor: vendedorNombre, 
        vendedorEmail: vendedorEmail, 
        direccion: data.direccion, 
        ruc: data.codigo 
      });

    } catch (err: any) {
      console.error("Client lookup error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/data/volumen", async (req, res) => {
    try {
      const workbook = await getWorkbook(req.query.force === 'true');
const XLSX = await import('xlsx');

      let volumenData: any[] = [];
      let idCounter = 1;

      const volSheet = workbook.Sheets['Volumen por SKU'];
      if (volSheet) {
        const volJson = XLSX.utils.sheet_to_json(volSheet, {header: 1});
        const header0 = volJson[0] as any[]; 
        
        for (let r = 2; r < volJson.length; r++) {
          const row = volJson[r];
          if (!row || !row[0]) continue;
          const sku = String(row[0]);
          const articulo = String(row[1]);
          
          let cat = 'OTROS';
          const artU = articulo.toUpperCase();
          const skuU = sku.toUpperCase();

          if (sku === '1461' || sku === '1463' || artU.includes('ESTANDAR ASTURIAS') || artU.includes('SUPERIOR ASTURIAS')) {
            cat = 'ESTANDAR Y SUPERIOR ASTURIAS';
          } else if (artU.includes('MORTADELA') || artU.includes('MORT.') || artU.includes('SALPICAO') || sku === '1464' || sku === '1462' || sku === '1512' || sku === '1521' || sku === '1561' || sku === '1522' || sku === '1563' || sku === '1562' || sku === '1564' || sku === '1519' || sku === '1496') {
            cat = 'MORTADELA SALPICAO Y ASTURIAS';
          } else if (skuU === 'ACEITE' || artU.includes('ACEITE')) {
            cat = 'ACEITE';
          } else if (skuU === 'AZUCAR' || skuU === 'AZÚCAR' || artU.includes('AZUCAR') || artU.includes('AZÚCAR')) {
            cat = 'AZÚCAR';
          } else if (skuU === 'POLLO' || skuU === 'FILET' || skuU === 'MUSLO' || skuU === '630' || skuU === '870' || skuU === '393' || artU.includes('POLLO ENTERO') || artU.includes('FILET') || artU.includes('MUSLO') || artU.includes('ALAS DESPRESADAS') || artU.includes('HIGADO') || artU.includes('MOLLEJA')) {
            cat = 'POLLO';
          }

          for (let c = 2; c < header0.length; c += 3) {
            const vendorName = String(header0[c] || '').replace(/\s+/g, ' ').trim();
            if (!vendorName) continue;
            
            const metaKg = parseFloat(row[c]) || 0;
            const ejecutadoKg = parseFloat(row[c+1]) || 0;
            
            if (metaKg > 0 || ejecutadoKg > 0) {
              const vendorUpper = vendorName.toUpperCase();
              const isMikelRoute1 = vendorUpper === 'MIKELANGELO DIAZ1' || vendorUpper.includes('MIKELANGELO DIAZ 1') || vendorUpper.includes('MIKELANGELO DIAZ - PRINCIPAL');
              const isMikelVilla = (vendorUpper.includes('MIKELANGELO') || vendorUpper.includes('SOTO') || vendorUpper.includes('DIAZ')) && vendorUpper.includes('VILLA');
              const isJohnatanHistorical = (vendorUpper === 'JOHNATAN SOTO' || vendorUpper === 'JHONATAN SOTO') && !vendorUpper.includes('VILLA');

              let finalVendedorId = vendorName;
              let finalVendedorNombre = vendorName;
              let finalVendedorEmail: string | undefined = undefined;

              if (isMikelRoute1) {
                finalVendedorId = 'MIKELANGELO DIAZ1';
                finalVendedorNombre = 'Mikelangelo Diaz (Principal)';
                finalVendedorEmail = 'Mikelangelodiaz@gmail.com';
              } else if (isMikelVilla) {
                finalVendedorId = 'MIKELANGELO DIAZ - VILLA DEL ROS';
                finalVendedorNombre = 'Mikelangelo Diaz (Villa del Rosario)';
                finalVendedorEmail = 'Mikelangelodiaz@gmail.com';
              } else if (isJohnatanHistorical) {
                finalVendedorId = 'JOHNATAN SOTO (HISTORICO)';
                finalVendedorNombre = 'Johnatan Soto (Histórico)';
              } else if (/mikelangelo/i.test(vendorName)) {
                finalVendedorNombre = 'Mikelangelo Diaz';
                finalVendedorEmail = 'Mikelangelodiaz@gmail.com';
              }

              volumenData.push({
                id: String(idCounter++),
                vendedorId: finalVendedorId,
                vendedorNombre: finalVendedorNombre,
                vendedorEmail: finalVendedorEmail,
                skuId: sku,
                articulo: articulo,
                cliente: finalVendedorNombre,
                categoria: cat,
                meta: metaKg,
                ejecutado: ejecutadoKg,
                zona: "General",
                lat: 10.6427, 
                lng: -71.6125
              });
            }
          }
        }
      }
      res.json(volumenData);
    } catch (err: any) {
      console.error("Error parsing volume data:", err);
      res.status(500).json([]);
    }
  });

  

  
  app.get("/api/data/activacion", async (req, res) => {
    try {
      const workbook = await getWorkbook(req.query.force === 'true');
      const XLSX = await import('xlsx');

      const findSheet = (patterns: string[]) => {
        const found = workbook.SheetNames.find((n: string) => 
          patterns.some(p => n.toLowerCase().trim().includes(p.toLowerCase()))
        );
        return found ? workbook.Sheets[found] : null;
      };

      const sAceite = findSheet(['aceite']);
      const sAzucar = findSheet(['azucar', 'azúcar']);
      const sPollo = findSheet(['pollo']);
      const sAsturias = findSheet(['asturias', 'jamon']);
      const sSalpicao = findSheet(['ligeros', 'salpicao', 'mortadela']);

      const readActiveClients = (sheet: any) => {
        const clientMap = new Map<string, number>();
        if (!sheet) return clientMap;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i] as any[];
          if (r && r[0] !== undefined && r[0] !== null && String(r[0]).trim() !== '') {
            const id = String(r[0]).trim();
            const cajas = parseFloat(r[2]) || 0;
            clientMap.set(id, (clientMap.get(id) || 0) + (cajas > 0 ? cajas : 1));
          }
        }
        return clientMap;
      };

      const mapAceite = readActiveClients(sAceite);
      const mapAzucar = readActiveClients(sAzucar);
      const mapPollo = readActiveClients(sPollo);
      const mapAsturias = readActiveClients(sAsturias);
      const mapSalpicao = readActiveClients(sSalpicao);

      let activacionData: any[] = [];
      const clientSheet = workbook.Sheets['Activación por Cliente'];
      if (clientSheet) {
        const clientJson = XLSX.utils.sheet_to_json(clientSheet, { header: 1 });
        for (let i = 1; i < clientJson.length; i++) {
          const row = clientJson[i] as any[];
          if (!row || row.length < 3 || !row[0]) continue;
          
          const codigo = String(row[0]).trim();
          const razonSocial = String(row[1] || '').trim();
          const vendedor = String(row[2] || '').replace(/\s+/g, ' ').trim();
          
          const hasAceite = mapAceite.has(codigo) || (row[3] && String(row[3]).trim().toUpperCase() === 'SI');
          const hasAzucar = mapAzucar.has(codigo) || (row[4] && String(row[4]).trim().toUpperCase() === 'SI');
          const hasPollo = mapPollo.has(codigo) || (row[5] && String(row[5]).trim().toUpperCase() === 'SI');
          const hasAsturias = mapAsturias.has(codigo) || (row[6] && String(row[6]).trim().toUpperCase() === 'SI');
          const hasSalpicao = mapSalpicao.has(codigo) || (row[7] && String(row[7]).trim().toUpperCase() === 'SI');

          const isActivo = hasAceite || hasAzucar || hasPollo || hasAsturias || hasSalpicao;
          const vendedorUpper = vendedor.toUpperCase();
          const isVilla = vendedorUpper.includes('VILLA');
          const isJohnatanOrMikel = vendedorUpper.includes('JOHNATAN') || vendedorUpper.includes('MIKELANGELO') || vendedorUpper.includes('SOTO');
          const vendedorNombre = isJohnatanOrMikel 
            ? (isVilla ? 'Mikelangelo Diaz (Villa del Rosario)' : 'Mikelangelo Diaz (Principal)')
            : vendedor;
          const vendedorEmail = isJohnatanOrMikel ? 'Mikelangelodiaz@gmail.com' : undefined;

          activacionData.push({
            id: String(codigo),
            vendedorId: vendedor,
            vendedorNombre: vendedorNombre,
            vendedorEmail: vendedorEmail,
            cliente: razonSocial,
            status: isActivo ? 'ACTIVO' : 'INACTIVO',
            cats: {
              ACEITE: hasAceite ? 1 : 0,
              AZUCAR: hasAzucar ? 1 : 0,
              POLLO: hasPollo ? 1 : 0,
              ESTANDAR_ASTURIAS: hasAsturias ? 1 : 0,
              MORTADELA_SALPICAO: hasSalpicao ? 1 : 0,
              // Aliases para retrocompatibilidad
              ARROZ: hasPollo ? 1 : 0,
              ENTERO: hasAsturias ? 1 : 0,
              LIGEROS: hasSalpicao ? 1 : 0,
            },
            cajas: {
              ACEITE: mapAceite.get(codigo) || 0,
              AZUCAR: mapAzucar.get(codigo) || 0,
              POLLO: mapPollo.get(codigo) || 0,
              ESTANDAR_ASTURIAS: mapAsturias.get(codigo) || 0,
              MORTADELA_SALPICAO: mapSalpicao.get(codigo) || 0,
            }
          });
        }
      }

      res.json(activacionData);
    } catch (err) {
      console.error("Error in /api/data/activacion:", err);
      res.status(500).json([]);
    }
  });

  app.get("/api/data/metas-activacion", async (req, res) => {
    try {
      const workbook = await getWorkbook(req.query.force === 'true');
      const XLSX = await import('xlsx');

      let metasData: any[] = [];
      const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
      if (gridSheet) {
        const gridJson = XLSX.utils.sheet_to_json(gridSheet, { header: 1 });
        for (let i = 2; i < gridJson.length; i++) {
          const row = gridJson[i] as any[];
          if (!row || !row[0]) continue;
          const vName = String(row[0]).replace(/\s+/g, ' ').trim();
          const cats = [
            { name: 'ACEITE', metaIdx: 2, actIdx: 3 },
            { name: 'AZÚCAR', metaIdx: 4, actIdx: 5 },
            { name: 'POLLO', metaIdx: 6, actIdx: 7 },
            { name: 'ESTANDAR Y SUPERIOR ASTURIAS', metaIdx: 8, actIdx: 9 },
            { name: 'MORTADELA SALPICAO Y ASTURIAS', metaIdx: 10, actIdx: 11 },
          ];
          cats.forEach(c => {
             metasData.push({
               vendedorId: vName,
               categoria: c.name,
               meta: parseInt(row[c.metaIdx]) || 0,
               activados: parseInt(row[c.actIdx]) || 0
             });
          });
        }
      }
      res.json(metasData);
    } catch(err) {
      console.error("Error in /api/data/metas-activacion:", err);
      res.status(500).json([]);
    }
  });

// Assistant Chat API
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, vendedorName, activeTab, contextData } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let contextInfo = "";
      if (activeTab === 'ACTIVACION_RUBRO') contextInfo = "El vendedor está viendo el módulo de 'Activación por Rubro'. Explícale que aquí puede ver los 5 productos clave del mes (Aceite, Azúcar, Pollo, Estándar y Superior Asturias, Mortadela Salpicao y Asturias) y su avance de metas.";
      else if (activeTab === 'VOLUMEN') contextInfo = "El vendedor está viendo el módulo de 'Volumen (SKU/KG)'. Explícale que aquí puede revisar la cantidad de kilos físicos que ha vendido desglosado por artículo.";
      else if (activeTab === 'ACTIVACION_CLIENTES') contextInfo = "El vendedor está viendo el módulo de 'Activación de Clientes'. Indícale que en esta pestaña puede ver la lista de sus clientes con los 5 productos clave del mes (Aceite, Azúcar, Pollo, Estándar y Superior Asturias, Mortadela Salpicao y Asturias).";
      else if (activeTab === 'COBROS_OCR') contextInfo = "El vendedor está viendo el módulo de 'Cobros (OCR)'. Explícale que aquí puede subir fotos de comprobantes de pago (transferencias, billetes) para que el sistema extraiga los datos automáticamente y registre el cobro.";
      else if (activeTab === 'DEGUSTACIONES') contextInfo = "El usuario está en el módulo de 'Degustaciones' / 'Trade Marketing'. Aquí puede consultar el calendario de disponibilidad, ver los horarios disponibles (9 en la mañana y 9 en la tarde), cargar solicitudes para clientes de su cartera y dar seguimiento al estado de aprobación y promotoras asignadas.";

      const systemInstruction = `Eres 'CodiBot', un asistente inteligente para el Dashboard de Fuerza de Ventas de Codizulca.
El vendedor actual que te está hablando es: ${vendedorName || 'Un vendedor del equipo'}.
CONTEXTO ACTUAL: ${contextInfo || 'El vendedor está en el dashboard general.'}
DATOS DE ESTA PESTAÑA PARA RESPONDER PREGUNTAS EXACTAS (Usa estos datos reales si te preguntan cuántos clientes tienen, faltan, volúmenes o degustaciones):
${contextData || 'No hay datos provistos.'}

Esta aplicación tiene 5 módulos principales:
1. VOLUMEN: Muestra el % de cumplimiento de ventas físicas en Kilogramos y Cajas desglosado por artículo (SKU).
2. ACTIVACIÓN POR RUBRO: Muestra si el vendedor está logrando colocar los 5 productos clave del mes (Aceite, Azúcar, Pollo, Estándar y Superior Asturias, Mortadela Salpicao y Asturias) en su cartera de clientes.
3. ACTIVACIÓN POR CLIENTES: Muestra la lista detallada de la cartera de clientes y cuáles de los 5 productos ha comprado cada uno para llegar al 100%.
4. COBROS (Lector OCR): Permite al vendedor tomar fotos de transferencias y billetes para registrar pagos y emitir recibos.
5. DEGUSTACIONES: Gestión integral de degustaciones e impulsaciones de producto en puntos de venta para clientes. Cuenta con 3 secciones: 1. Agendar, 2. Disponibilidad, 3. Historial y Seguimiento.

CONOCIMIENTO DETALLADO DEL MÓDULO DE DEGUSTACIONES (Debes dominarlo y explicarlo con exactitud):
- DÍAS HABILITADOS: El calendario ÚNICAMENTE habilita los días JUEVES, VIERNES Y SÁBADOS de cada semana para realizar degustaciones. Los días domingo, lunes, martes y miércoles permanecen deshabilitados.
- LÍMITE POR VENDEDOR: Cada vendedor puede cargar un MÁXIMO DE 5 DEGUSTACIONES POR SEMANA.
- CAPACIDAD DIARIA DE LA EMPRESA: Se pueden programar exactamente 18 degustaciones por día habilitado en total para toda la empresa:
  * 9 DEGUSTACIONES EN LA MAÑANA (Turno Mañana: Horario base de 9:00 AM a 1:00 PM, totalmente modificable según necesidad del punto de venta).
  * 9 DEGUSTACIONES EN LA TARDE (Turno Tarde: Horario base de 2:00 PM a 7:00 PM, totalmente modificable según necesidad del punto de venta).
- ANTICIPACIÓN REQUERIDA: Mínimo 2 días hábiles de anticipación para coordinar promotoras, producto e inventario.
- ESTRUCTURA DE PESTAÑAS DEL MÓDULO:
  1. AGENDAR: Formulario de reserva con selección de cliente asignado, fecha habilitada, turno/hora, catálogo de productos (Salpicao, Asturias, Alimex), kilos, personas estimadas, promotoras, material POP y contacto de tienda.
  2. DISPONIBILIDAD: Calendario interactivo mensual donde se visualizan los días Jueves, Viernes y Sábados con sus 18 bloques horarios disponibles en vivo.
  3. HISTORIAL Y SEGUIMIENTO: Panel donde el vendedor hace seguimiento en tiempo real al estado de sus degustaciones agendadas (Solicitadas, Aprobadas, Realizadas, Rechazadas), con promotoras asignadas, material POP, notas de Trade Marketing y resultados de ventas.
- SEGUIMIENTO DE ESTADOS:
  * SOLICITADA: En revisión por Gerencia de Trade Marketing.
  * APROBADA: Aprobada con promotora confirmada y material asignado.
  * REALIZADA: Degustación ejecutada exitosamente con reporte de kilos, personas alcanzadas y ventas.
  * RECHAZADA / CANCELADA: Con motivo detallado explicativo de gerencia.

INSTRUCCIÓN ESPECIAL DE NAVEGACIÓN:
Si el usuario menciona que necesita ir, ver, buscar información o abrir cualquiera de estos módulos (ejemplo: "llévame a volumen", "necesito ver mis clientes", "quiero escanear un pago", "abre el modulo de rubros", "quiero programar una degustacion", "ver trademarketing", "cargar degustacion"), DEBES responder incluyendo un COMANDO DE ACCIÓN EXACTO y OCULTO al final de tu mensaje en este formato exacto:
[[NAVIGATE_TO:VOLUMEN]]
[[NAVIGATE_TO:ACTIVACION_RUBRO]]
[[NAVIGATE_TO:ACTIVACION_CLIENTES]]
[[NAVIGATE_TO:COBROS_OCR]]
[[NAVIGATE_TO:DEGUSTACIONES]]

REGLAS ESTRICTAS PARA PRODUCCIÓN:
1. ERES UN ANALISTA DE DATOS Y ASESOR OPERATIVO PARA EL VENDEDOR. Tu objetivo es dar respuestas DETALLADAS, ESPECÍFICAS Y EXACTAS basadas en los datos reales del dashboard.
2. Si te preguntan sobre el módulo de degustaciones (reglas, cupos, horarios, pasos de carga, promotoras, estados), responde de forma amigable, estructurada y muy clara usando viñetas y negritas para que sea fácil de leer en pantallas de celulares Android e iOS.
3. NUNCA respondas con generalidades ni mandes al usuario a "ver la tabla". Si hay datos de degustaciones en la pestaña, indícale cuántas tiene solicitadas, aprobadas, realizadas o próximas fechas.
4. Cuando te pregunten sobre sus métricas de avance de venta (ej. "cómo voy en pollo" o "cuántos clientes he activado"):
   - Indica la META TOTAL, los ACTIVADOS actualmente y cuántos FALTAN para llegar a la meta.
   - Usa formato enriquecido (negritas, viñetas) para resaltar los números y que sea fácil de escanear en su teléfono celular.
5. Si el vendedor pide un dato o acción que corresponde a otra pestaña (ej. "quiero cargar una degustación" o "llévame a clientes"), RESPONDE y NAVEGA AUTOMÁTICAMENTE a la pestaña correcta. Añade OBLIGATORIAMENTE el comando de navegación al final de tu mensaje (ej. [[NAVIGATE_TO:DEGUSTACIONES]]) sin preguntarle si desea ir.
6. Tono: Mantén un lenguaje profesional, altamente analítico y motivador, orientado al éxito del vendedor.`;

      // Limpiar y estructurar mensajes para la API de Gemini (debe iniciar con user y alternar)
      let formattedMessages: any[] = [];
      if (Array.isArray(messages)) {
        for (const m of messages) {
          const role = (m.role === 'model' || m.role === 'assistant') ? 'model' : 'user';
          const text = (m.parts?.[0]?.text || m.text || '').trim();
          if (!text) continue;

          if (formattedMessages.length === 0 && role === 'model') {
            formattedMessages.push({ role: 'user', parts: [{ text: 'Hola CodiBot' }] });
          }

          if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === role) {
            formattedMessages[formattedMessages.length - 1].parts[0].text += `\n${text}`;
          } else {
            formattedMessages.push({ role, parts: [{ text }] });
          }
        }
      }
      if (formattedMessages.length === 0) {
        formattedMessages = [{ role: 'user', parts: [{ text: 'Hola' }] }];
      }

      let response;
      // Priorizamos gemini-3.1-flash-lite por su latencia ultrarrápida (sub-2s) y fallback a gemini-3.8-flash
      const modelsToTry = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];
      
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const modelName of modelsToTry) {
          try {
            response = await ai.models.generateContent({
              model: modelName,
              contents: formattedMessages,
              config: {
                 systemInstruction: systemInstruction,
                 temperature: 0.5
              }
            });
            if (response?.text) break;
          } catch (err: any) {
            console.log(`Model ${modelName} attempt ${attempt} notice:`, err.message || err);
          }
        }
        if (response?.text) break;
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      if (!response || !response.text) {
         return res.json({ text: "¡Hola! Estoy listo para apoyarte. ¿En qué módulo o información de ventas o degustaciones te puedo asistir hoy?" });
      }

      return res.json({ text: response.text });
    } catch (error: any) {
      console.error("Chat API error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Assistant STT (Speech to Text) API
  app.post("/api/transcribe", express.json({limit: '50mb'}), async (req, res) => {
    try {
      const { audioBase64 } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const audioPart = {
        inlineData: {
          mimeType: "audio/webm",
          data: audioBase64,
        },
      };

      const maxRetries = 3;
      let attempt = 0;
      let response;

      while (attempt < maxRetries) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: { parts: [audioPart, { text: "Transcribe exactamente lo que dice el audio." }] },
          });
          break;
        } catch (err: any) {
          attempt++;
          const isUnavailable = err.status === 503 || err.status === "UNAVAILABLE" || err.message?.includes("503") || err.message?.includes("high demand");
          if (attempt < maxRetries && isUnavailable) {
             await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
             continue;
          }
          throw err;
        }
      }

      return res.json({ text: response?.text });
    } catch (error: any) {
      console.error("Transcribe API error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Assistant TTS (Text to Speech) API - Optimizado para respuesta de voz ágil e inmediata
  app.post("/api/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Limpiar markdown, viñetas y comandos para sintetizar solo lenguaje hablado fluido
      const cleanText = text
        .replace(/\[\[NAVIGATE_TO:.*?\]\]/g, '')
        .replace(/[*#_`~>•-]/g, ' ')
        .replace(/\b(https?:\/\/\S+)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Tomamos un extracto conciso (primeras 1 o 2 oraciones, max 220 caracteres)
      // Esto reduce el tiempo de generación a < 1.5 segundos en lugar de 20 segundos
      let spokenText = cleanText;
      const firstSentenceMatch = cleanText.match(/^([^.!?]+[.!?])/);
      if (firstSentenceMatch && firstSentenceMatch[1].length >= 25 && firstSentenceMatch[1].length <= 220) {
        spokenText = firstSentenceMatch[1];
      } else if (spokenText.length > 220) {
        spokenText = spokenText.substring(0, 215) + '...';
      }

      const { Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const maxRetries = 2;
      let attempt = 0;
      let response;

      while (attempt < maxRetries) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.1-flash-tts-preview",
            contents: [{ parts: [{ text: spokenText }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
            },
          });
          break; // Success
        } catch (err: any) {
          attempt++;
          if (attempt < maxRetries) {
             await new Promise(resolve => setTimeout(resolve, 600));
             continue;
          }
          throw err;
        }
      }

      const inlineData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      let base64Audio = inlineData?.data;
      let mimeType = inlineData?.mimeType || 'audio/mp3';

      // Gemini TTS usually returns raw PCM. We need to wrap it in a WAV header for the browser to play it.
      if (base64Audio) {
         const pcmBuffer = Buffer.from(base64Audio, 'base64');
         const wavBuffer = pcmToWav(pcmBuffer, 24000, 1);
         base64Audio = wavBuffer.toString('base64');
         mimeType = 'audio/wav';
      }

      return res.json({ audioBase64: base64Audio, mimeType: mimeType });
    } catch (error: any) {
      console.error("TTS API error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  const distPath = path.join(process.cwd(), 'dist');
  const distIndexExists = fs.existsSync(path.join(distPath, 'index.html'));

  // Servir estáticos de producción si se especificó production o si existe dist y no es el script dev
  const isDevMode = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development';

  if (!isDevMode && distIndexExists) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (vErr) {
      console.error("[SERVER] Error al inicializar Vite en modo desarrollo, usando fallback a dist:", vErr);
      if (distIndexExists) {
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[SERVER] Puerto ${PORT} ocupado.`);
    } else {
      console.error('[SERVER] Error en servidor HTTP:', err);
    }
  });
}

startServer().catch((err) => {
  console.error('[SERVER] Fallo al iniciar startServer:', err);
});
