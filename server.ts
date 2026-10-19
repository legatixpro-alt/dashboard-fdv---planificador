import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

dotenv.config();

// Prevenir caídas del proceso por errores o rechazos no controlados en tareas asíncronas (como caídas de red o reconexiones VPN)
process.on('uncaughtException', (err: any) => {
  const msg = err?.message || String(err);
  if (msg.includes('firestore') || msg.includes('GrpcConnection') || msg.includes('Name resolution failed') || err?.code === 14) {
    console.warn('[SERVER] Advertencia de red Firestore capturada (VPN/DNS):', msg);
    return;
  }
  console.error('[SERVER] Excepción no controlada capturada:', err);
});

process.on('unhandledRejection', (reason: any, promise) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('firestore') || msg.includes('GrpcConnection') || msg.includes('Name resolution failed') || reason?.code === 14) {
    console.warn('[SERVER] Rechazo de red Firestore capturado (VPN/DNS):', msg);
    return;
  }
  console.error('[SERVER] Promesa rechazada no controlada:', reason);
});

import { db } from './src/lib/firebase';
import { VENDOR_PROFILES, getVendorProfile } from './src/utils/vendorRoutes';
import { collection, doc, getDocs, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Polyfill WebSocket para compatibilidad total en Node.js < 22 con @supabase/realtime-js
if (typeof (globalThis as any).WebSocket === 'undefined') {
  try {
    (globalThis as any).WebSocket = require('ws');
  } catch {
    (globalThis as any).WebSocket = class DummyWebSocket {} as any;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nudltbgyewyiklqdyujk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const JWT_SECRET = process.env.JWT_SECRET || 'codizulca_super_secret_jwt_key_2026_fdv_secure_token_9x8y7z';

// Middleware de autenticación segura vía JWT
export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token de autenticación requerido (Bearer token ausente)' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido o expirado' });
    }
    req.user = decoded;
    next();
  });
}

export function requireAdmin(req: any, res: any, next: any) {
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Acceso no autorizado: Se requieren privilegios de Administrador' });
}

// Control de rate limiting en memoria para evitar abusos o costos excesivos en APIs de IA
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
export function rateLimiter(windowMs: number, maxRequests: number, label: string) {
  return (req: any, res: any, next: any) => {
    const userKey = (req.user?.username || req.ip || 'anon') + ':' + label;
    const now = Date.now();
    const record = rateLimitMap.get(userKey);
    if (!record || now > record.resetTime) {
      rateLimitMap.set(userKey, { count: 1, resetTime: now + windowMs });
      return next();
    }
    if (record.count >= maxRequests) {
      const waitSec = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        error: `Límite de solicitudes alcanzado para ${label}. Por favor espera ${waitSec} segundos.`
      });
    }
    record.count++;
    next();
  };
}

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
      const localPath = path.join(process.cwd(), 'sheet.xlsx');
      try {
        fs.writeFileSync(localPath, Buffer.from(buffer));
      } catch (_) {}
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
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
      return res.status(400).json({ success: false, error: 'JSON malformado en la petición' });
    }
    next(err);
  });

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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
      }

      const usuarioUpper = String(username).toUpperCase().trim();
      const pwd = String(password).trim();
      const pwdClean = pwd.replace(/\D/g, '');

      // 1. Intentar autenticación contra Supabase si la tabla existe
      if (supabase) {
        try {
          const { data: supaUser, error: supaErr } = await supabase
            .from('usuarios')
            .select('*')
            .eq('username', usuarioUpper)
            .maybeSingle();

          if (!supaErr && supaUser) {
            const isBcrypt = supaUser.password_hash && supaUser.password_hash.startsWith('$2');
            let isValid = false;
            if (isBcrypt) {
              isValid = await bcrypt.compare(pwd, supaUser.password_hash) || await bcrypt.compare(pwdClean, supaUser.password_hash);
            } else {
              isValid = (pwd === supaUser.password_hash) || (pwdClean === supaUser.password_hash);
            }

            if (isValid) {
              const token = jwt.sign(
                {
                  username: supaUser.username,
                  role: supaUser.role,
                  vendorId: supaUser.vendor_id
                },
                JWT_SECRET,
                { expiresIn: '7d' }
              );

              return res.json({
                success: true,
                token,
                user: {
                  username: supaUser.username,
                  role: supaUser.role,
                  vendorId: supaUser.vendor_id
                },
                source: 'supabase'
              });
            } else {
              return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
            }
          }
        } catch (e: any) {
          // Fallback a credenciales locales
        }
      }

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

      const isMikel = usuarioUpper.includes('MIKELANGELO') || usuarioUpper.includes('SOTO') || usuarioUpper.includes('JOHNATAN');
      const isValidPwd = (pwd === creds.password) || (pwdClean === creds.password) || (isMikel && (pwdClean === '20863632' || pwdClean === '18395226'));

      if (!isValidPwd) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
      }

      const token = jwt.sign(
        {
          username: usuarioUpper,
          role: creds.role,
          vendorId: creds.vendorId
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          username: usuarioUpper,
          role: creds.role,
          vendorId: creds.vendorId
        },
        source: 'local'
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Error interno en autenticación' });
    }
  });

  // Verificación de sesión activa y perfil del usuario autenticado
  app.get("/api/auth/me", authenticateToken, (req: any, res: any) => {
    return res.json({
      success: true,
      user: {
        username: req.user.username,
        role: req.user.role,
        vendorId: req.user.vendorId
      }
    });
  });

  // ==============================================================
  // ENDPOINTS DE DEGUSTACIONES Y TRADE MARKETING
  // Permite sincronización directa con https://dashboardgerencia01.ai.studio/
  // ==============================================================
  app.get("/api/degustaciones", async (req, res) => {
    try {
      // 1. Intentar consultar directamente desde Supabase si está disponible
      if (supabase) {
        try {
          let query = supabase.from('degustaciones').select('*');
          if (req.query.vendedor) {
            query = query.ilike('vendedor_nombre', `%${req.query.vendedor}%`);
          }
          if (req.query.estado) {
            query = query.eq('estado', String(req.query.estado).toUpperCase().trim());
          }
          if (req.query.fecha) {
            query = query.eq('fecha', String(req.query.fecha).trim());
          }
          const { data: supaList, error: supaErr } = await query.order('fecha', { ascending: false });
          if (!supaErr && Array.isArray(supaList) && supaList.length > 0) {
            const mapped = supaList.map((d: any) => ({
              id: d.id,
              clienteCodigo: d.cliente_codigo || 'PDV',
              clienteNombre: d.cliente_nombre,
              vendedorNombre: d.vendedor_nombre,
              vendedorId: d.vendedor_id,
              vendedorEmail: d.vendedor_email,
              ruta: d.ruta,
              fecha: d.fecha,
              turno: d.turno,
              hora: d.hora,
              productos: d.productos,
              kilosEstimados: Number(d.kilos_estimados) || 0,
              personasEstimadas: Number(d.personas_estimadas) || 0,
              requierePromotora: Boolean(d.requiere_promotora),
              promotoraAsignada: d.promotora_asignada,
              materialPop: Boolean(d.material_pop),
              contactoPunto: d.contacto_punto,
              telefonoContacto: d.telefono_contacto,
              observaciones: d.observaciones,
              estado: d.estado,
              notasTradeMarketing: d.notas_trade_marketing,
              resultado: d.resultado,
              createdAt: d.created_at
            }));
            return res.json({
              success: true,
              count: mapped.length,
              data: mapped,
              source: 'supabase'
            });
          }
        } catch (supaErr: any) {
          // Fallback silencioso a Firestore si la tabla aún no existe
        }
      }

      // 2. Fallback a Firestore
      let list: any[] = [];
      try {
        const snapshot = await getDocs(collection(db, 'degustaciones'));
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data && data.clienteNombre) {
            list.push({
              id: docSnap.id,
              ...data
            });
          }
        });
      } catch (fsErr: any) {
        console.warn("[SERVER] Fallback Firestore degustaciones no disponible (modo offline):", fsErr?.message);
      }

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
  const GERENCIA_SUPABASE_SURVEYS_URL = process.env.GERENCIA_SUPABASE_SURVEYS_URL || process.env.VITE_GERENCIA_SUPABASE_SURVEYS_URL || 'https://nudltbgyewyiklqdyujk.supabase.co/rest/v1/surveys';
  const GERENCIA_SUPABASE_ANON_KEY = process.env.GERENCIA_SUPABASE_ANON_KEY || process.env.VITE_GERENCIA_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx0Ymd5ZXd5aWtscWR5dWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgzMDA3OCwiZXhwIjoyMTA3NDA2MDc4fQ.k92vdZiuVkTzAWNK8Fq71m1Xi_MoWtpx_eRQcZTw1cA';

  // Configuración de Supabase para el Programa de Pedidos Manuales (gestor-de-pedidos-pro)
  const PEDIDOS_MANUALES_SUPABASE_URL = process.env.PEDIDOS_MANUALES_SUPABASE_URL || 'https://vxduxyrbeybhhbpdyqoc.supabase.co';
  const PEDIDOS_MANUALES_SUPABASE_KEY = process.env.PEDIDOS_MANUALES_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZHV4eXJiZXliaGhicGR5cW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzUxNTgsImV4cCI6MjEwNjY1MTE1OH0.sOgUaTLZ0NhlVYSLukAysyxRzggAicjM4n-u4H8NrQ4';

  // Sincronizador bidireccional exacto para los archivos data_degustaciones.json de Trade Marketing
  function syncToTradeMarketingJson(itemOrList: any | any[]) {
    try {
      const items = Array.isArray(itemOrList) ? itemOrList : [itemOrList];
      const gerenciaPath = path.resolve(process.cwd(), '../codizulca-dashboard (3)/data_degustaciones.json');
      const localPath = path.resolve(process.cwd(), 'data_degustaciones.json');

      const targetPaths = [localPath];
      if (fs.existsSync(path.dirname(gerenciaPath))) {
        targetPaths.push(gerenciaPath);
      }

      for (const tPath of targetPaths) {
        let existing: any[] = [];
        try {
          if (fs.existsSync(tPath)) {
            existing = JSON.parse(fs.readFileSync(tPath, 'utf8') || '[]');
          }
        } catch (_) {}

        const map = new Map<string, any>();
        existing.forEach(e => { if (e && e.id) map.set(e.id, e); });

        for (const item of items) {
          if (!item || !item.id) continue;
          let dmyDate = item.fecha || item.date;
          if (dmyDate && /^\d{4}-\d{2}-\d{2}$/.test(dmyDate)) {
            const [y, m, day] = dmyDate.split('-');
            dmyDate = `${day}/${m}/${y}`;
          }

          let timeStr = item.hora || item.time;
          if (!timeStr || !timeStr.trim()) {
            if (item.turno === 'MAÑANA') timeStr = '09:00 - 13:00';
            else if (item.turno === 'TARDE') timeStr = '14:00 - 18:00';
            else timeStr = '09:00 - 18:00';
          }

          const productStr = Array.isArray(item.productos) 
            ? item.productos.join(', ') 
            : (item.productos || item.product || 'Embutidos y Refrigerados');

          let status = 'scheduled';
          const norm = (item.estado || item.status || 'SOLICITADA').toUpperCase().trim();
          if (norm === 'REALIZADA' || norm === 'COMPLETED') status = 'completed';
          else if (norm === 'CANCELADA' || norm === 'RECHAZADA' || norm === 'CANCELLED') status = 'cancelled';

          const promoter = item.promotoraAsignada || item.promotora_asignada || item.promoter || item.vendedorNombre || item.vendedor_nombre || 'Por Asignar';
          const promoterRole = (item.requierePromotora || item.requiere_promotora) ? 'Promotora' : 'Impulsadora';

          const target = Number(item.personasEstimadas || item.personas_estimadas) || Math.round((Number(item.kilosEstimados || item.kilos_estimados) || 1) * 35) || 140;
          const delivered = item.resultado?.porcionesEntregadas || item.delivered || 0;
          const acceptance = item.resultado?.porcentajeAceptacion || item.acceptanceRate || (status === 'completed' ? 95 : 0);

          const notes = [
            item.observaciones || item.notes,
            (item.notasTradeMarketing || item.notas_trade_marketing) ? `Notas Trade: ${item.notasTradeMarketing || item.notas_trade_marketing}` : '',
            `Vendedor: ${item.vendedorNombre || item.vendedor_nombre || ''}`,
            (item.contactoPunto || item.contacto_punto) ? `Contacto: ${item.contactoPunto || item.contacto_punto} (${item.telefonoContacto || item.telefono_contacto || ''})` : ''
          ].filter(Boolean).join(' | ');

          map.set(item.id, {
            id: item.id,
            date: dmyDate,
            time: timeStr,
            activity: `Impulso y Degustación ${productStr} - ${item.clienteNombre || item.cliente_nombre || item.client}`,
            product: productStr,
            promoter: promoter,
            promoterRole: promoterRole,
            client: item.clienteNombre || item.cliente_nombre || item.client,
            zone: item.ruta || item.vendedorNombre || item.vendedor_nombre || 'Maracaibo',
            status: status,
            delivered: delivered,
            target: target,
            acceptanceRate: acceptance,
            comments: notes
          });
        }

        try {
          fs.writeFileSync(tPath, JSON.stringify(Array.from(map.values()), null, 2), 'utf8');
        } catch (err: any) {
          console.warn(`[SYNC TRADE] Error al escribir en ${tPath}:`, err?.message);
        }
      }
    } catch (e: any) {
      console.warn("[SYNC TRADE] Error sincronizando archivo json de Trade Marketing:", e?.message);
    }
  }

  function deleteFromTradeMarketingJson(id: string) {
    try {
      const gerenciaPath = path.resolve(process.cwd(), '../codizulca-dashboard (3)/data_degustaciones.json');
      const localPath = path.resolve(process.cwd(), 'data_degustaciones.json');

      const targetPaths = [localPath];
      if (fs.existsSync(path.dirname(gerenciaPath))) targetPaths.push(gerenciaPath);

      for (const tPath of targetPaths) {
        if (!fs.existsSync(tPath)) continue;
        const existing: any[] = JSON.parse(fs.readFileSync(tPath, 'utf8') || '[]');
        const filtered = existing.filter(e => e.id !== id);
        fs.writeFileSync(tPath, JSON.stringify(filtered, null, 2), 'utf8');
      }
    } catch (e: any) {
      console.warn("[SYNC TRADE] Error eliminando de json Trade Marketing:", e?.message);
    }
  }

  function buildGerenciaDirectPayload(item: any) {
    const normEstado = (item.estado || item.status || 'SOLICITADA').toUpperCase();
    let status = 'Solicitada';
    if (normEstado === 'APROBADA') status = 'Aprobada';
    else if (normEstado === 'RECHAZADA') status = 'Rechazada';
    else if (normEstado === 'CANCELADA') status = 'Cancelada';
    else if (normEstado === 'REALIZADA') status = 'Realizada';

    let shift = 'Mañana (9:00 AM - 1:00 PM)';
    if (item.turno === 'TARDE') shift = 'Tarde (2:00 PM - 7:00 PM)';
    else if (item.turno === 'COMPLETO') shift = 'Día Completo';

    const productListStr = Array.isArray(item.productos)
      ? item.productos.join(', ')
      : (item.productos || item.product || 'Productos');

    const commentsObj = {
      isTasting: true,
      degustacionId: item.id,
      id: item.id,
      client: item.clienteNombre || item.cliente_nombre || item.client,
      cliente: item.clienteNombre || item.cliente_nombre || item.client,
      clienteCodigo: item.clienteCodigo || item.cliente_codigo || 'PDV',
      store: item.clienteNombre || item.cliente_nombre || item.client,
      vendedor: item.vendedorNombre || item.vendedor_nombre || item.vendedor,
      salesRep: item.vendedorNombre || item.vendedor_nombre || item.vendedor,
      promoter: item.promotoraAsignada || item.promotora_asignada || item.promoter || item.vendedorNombre || item.vendedor_nombre || 'Vendedor',
      promotoraAsignada: item.promotoraAsignada || item.promotora_asignada || '',
      ruta: item.ruta || item.vendedorId || item.vendedor_id || '',
      date: item.fecha || item.date || new Date().toISOString().split('T')[0],
      turno: item.turno || 'MAÑANA',
      shift: shift,
      time: item.hora || item.time || (item.turno === 'MAÑANA' ? '09:00 AM - 01:00 PM' : '02:00 PM - 07:00 PM'),
      products: productListStr,
      product: productListStr,
      kilos: Number(item.kilosEstimados || item.kilos_estimados) || 0,
      kg: Number(item.kilosEstimados || item.kilos_estimados) || 0,
      personas: Number(item.personasEstimadas || item.personas_estimadas) || 0,
      personasEstimadas: Number(item.personasEstimadas || item.personas_estimadas) || 0,
      estado: normEstado,
      status: status,
      requierePromotora: Boolean(item.requierePromotora || item.requiere_promotora),
      promoterType: (item.requierePromotora || item.requiere_promotora) ? 'Fija' : 'Vendedor / Impulso',
      materialPop: (item.materialPop || item.material_pop) ? 'SI' : 'NO',
      contactoPunto: item.contactoPunto || item.contacto_punto || '',
      telefonoContacto: item.telefonoContacto || item.telefono_contacto || '',
      address: `Ruta: ${item.ruta || item.vendedorNombre || item.vendedor_nombre || ''} | Contacto: ${item.contactoPunto || item.contacto_punto || ''} (${item.telefonoContacto || item.telefono_contacto || ''})`,
      notes: item.observaciones || `Agendada por ${item.vendedorNombre || item.vendedor_nombre || ''}.`,
      originalComments: item.observaciones || `Agendada por ${item.vendedorNombre || item.vendedor_nombre || ''}.`,
      notasTradeMarketing: item.notasTradeMarketing || item.notas_trade_marketing || '',
      resultado: item.resultado || null
    };

    return {
      type: 'Degustacion',
      date: item.fecha || item.date || new Date().toISOString().split('T')[0],
      store: item.clienteNombre || item.cliente_nombre || item.client,
      promoter: item.promotoraAsignada || item.promotora_asignada || item.vendedorNombre || item.vendedor_nombre || 'Vendedor',
      product: productListStr,
      comments: JSON.stringify(commentsObj)
    };
  }

  async function syncToGerenciaDirect(item: any) {
    try {
      // 1. Sincronizar en data_degustaciones.json (Local y Gerencia Trade Marketing)
      syncToTradeMarketingJson(item);

      // 2. Sincronizar en Supabase surveys
      const payload = buildGerenciaDirectPayload(item);

      const searchUrl = `${GERENCIA_SUPABASE_SURVEYS_URL}?type=eq.Degustacion&comments=like.*${item.id}*&select=id&limit=1`;
      const searchRes = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'apikey': GERENCIA_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`
        }
      });

      if (searchRes.ok) {
        const records = await searchRes.json();
        if (Array.isArray(records) && records.length > 0 && records[0].id) {
          const updateUrl = `${GERENCIA_SUPABASE_SURVEYS_URL}?id=eq.${records[0].id}`;
          await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
              'apikey': GERENCIA_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
          });
          return;
        }
      }

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

  async function deleteFromGerenciaDirect(id: string) {
    try {
      deleteFromTradeMarketingJson(id);
      const deleteUrl = `${GERENCIA_SUPABASE_SURVEYS_URL}?type=eq.Degustacion&comments=like.*${id}*`;
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'apikey': GERENCIA_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`
        }
      });
    } catch (err) {
      console.warn("Failed to delete from Gerencia:", err);
    }
  }

  // ENDPOINT DE SINCRONIZACIÓN INTEGRAL DE DEGUSTACIONES CON TRADE MARKETING
  app.post("/api/degustaciones/sync-gerencia", async (req, res) => {
    try {
      console.log("[SYNC TRADE] Sincronizando degustaciones de forma exacta y perfecta con Trade Marketing...");
      let list: any[] = [];
      if (supabase) {
        const { data, error } = await supabase.from('degustaciones').select('*').order('fecha', { ascending: false });
        if (!error && Array.isArray(data) && data.length > 0) {
          list = data;
        }
      }

      if (list.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'degustaciones'));
          snap.forEach(d => {
            const data = d.data();
            if (data && data.clienteNombre) list.push({ id: d.id, ...data });
          });
        } catch (_) {}
      }

      // 1. Sincronizar en data_degustaciones.json (Local y Gerencia Trade Marketing)
      syncToTradeMarketingJson(list);

      // 2. Sincronizar en Supabase surveys
      let countSynced = 0;
      for (const item of list) {
        await syncToGerenciaDirect(item);
        countSynced++;
      }

      res.json({
        success: true,
        message: "Degustaciones sincronizadas de forma exacta y perfecta con Trade Marketing",
        total: list.length,
        synced: countSynced,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[SYNC TRADE] Error en /api/degustaciones/sync-gerencia:", err);
      res.status(500).json({ error: "Error sincronizando con Trade Marketing", details: err?.message });
    }
  });

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

      // Guardar en Firestore para compatibilidad
      await setDoc(doc(db, 'degustaciones', id), record);

      // Guardar en Supabase si está disponible
      if (supabase) {
        Promise.resolve(supabase.from('degustaciones').upsert({
          id: record.id,
          cliente_codigo: record.clienteCodigo || 'PDV',
          cliente_nombre: record.clienteNombre,
          vendedor_nombre: record.vendedorNombre || 'Vendedor',
          vendedor_id: record.vendedorId || '1',
          vendedor_email: record.vendedorEmail || null,
          ruta: record.ruta || '',
          fecha: record.fecha,
          turno: record.turno || 'MAÑANA',
          hora: record.hora || '',
          productos: Array.isArray(record.productos) ? record.productos : [],
          kilos_estimados: Number(record.kilosEstimados) || 0,
          personas_estimadas: Number(record.personasEstimadas) || 0,
          requiere_promotora: Boolean(record.requierePromotora),
          promotora_asignada: record.promotoraAsignada || '',
          material_pop: Boolean(record.materialPop),
          contacto_punto: record.contactoPunto || '',
          telefono_contacto: record.telefonoContacto || '',
          observaciones: record.observaciones || '',
          estado: record.estado || 'SOLICITADA',
          notas_trade_marketing: record.notasTradeMarketing || '',
          resultado: record.resultado || null,
          created_at: record.createdAt
        })).catch(err => console.warn("[SUPABASE] Error guardando degustación:", err?.message));
      }

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

      await setDoc(doc(db, 'degustaciones', id), updates, { merge: true });
      const snap = await getDoc(doc(db, 'degustaciones', id));
      if (snap.exists()) {
        const full = { id, ...snap.data() };

        if (supabase) {
          const supaUpdate: any = {};
          if (updates.clienteNombre !== undefined) supaUpdate.cliente_nombre = updates.clienteNombre;
          if (updates.vendedorNombre !== undefined) supaUpdate.vendedor_nombre = updates.vendedorNombre;
          if (updates.estado !== undefined) supaUpdate.estado = updates.estado;
          if (updates.notasTradeMarketing !== undefined) supaUpdate.notas_trade_marketing = updates.notasTradeMarketing;
          if (updates.promotoraAsignada !== undefined) supaUpdate.promotora_asignada = updates.promotoraAsignada;
          if (updates.resultado !== undefined) supaUpdate.resultado = updates.resultado;
          if (updates.kilosEstimados !== undefined) supaUpdate.kilos_estimados = Number(updates.kilosEstimados) || 0;
          if (updates.personasEstimadas !== undefined) supaUpdate.personas_estimadas = Number(updates.personasEstimadas) || 0;
          supaUpdate.updated_at = new Date().toISOString();

          Promise.resolve(supabase.from('degustaciones').update(supaUpdate).eq('id', id)).catch(err => console.warn("[SUPABASE] Error actualizando:", err?.message));
        }

        syncToGoogleScript(full).catch(() => {});
        syncToGerenciaDirect(full).catch(() => {});
      }
      res.json({ success: true, id, updated: updates });
    } catch (err: any) {
      console.error("Error updating degustacion via API:", err);
      res.status(500).json({ error: "Error al actualizar degustacion", details: err?.message });
    }
  });

  app.delete("/api/degustaciones/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await deleteDoc(doc(db, 'degustaciones', id));
      if (supabase) {
        Promise.resolve(supabase.from('degustaciones').delete().eq('id', id)).catch(err => console.warn("[SUPABASE] Error eliminando:", err?.message));
      }
      deleteFromGerenciaDirect(id).catch(() => {});
      res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error deleting degustacion via API:", err);
      res.status(500).json({ error: "Error al eliminar degustacion", details: err?.message });
    }
  });

  // ==============================================================
  // ENDPOINTS DE PEDIDOS ALKOSTO (CUENTAS CLAVE 2 - SAIRÚ VALLES)
  // ==============================================================
  app.get("/api/alkosto/pedidos", authenticateToken, async (req: any, res: any) => {
    try {
      if (supabase) {
        try {
          const { data: supaList, error: supaErr } = await supabase
            .from('pedidos_alkosto')
            .select('*')
            .order('created_at', { ascending: false });

          if (!supaErr && Array.isArray(supaList) && supaList.length > 0) {
            const mapped = supaList.map((p: any) => ({
              id: p.id,
              numeroPedido: p.numero_pedido || '',
              correlativo: p.correlativo || p.numero_pedido || '',
              ordenCompraAlkosto: p.orden_compra_alkosto || '',
              sucursalCodigo: p.sucursal_codigo || '',
              sucursalNombre: p.sucursal_nombre || '',
              vendedora: p.vendedora || 'SAIRU VALLES',
              ruta: p.ruta || 'CUENTAS CLAVE 2',
              fechaPedido: p.fecha_pedido,
              fechaEntregaEstimada: p.fecha_entrega,
              totalBultos: Number(p.total_bultos) || 0,
              totalKilos: Number(p.total_kilos) || 0,
              totalUSD: Number(p.total_usd) || 0,
              condicionPago: p.condicion_pago || '',
              items: p.items || [],
              observaciones: p.observaciones || '',
              status: p.status || 'PENDIENTE',
              createdAt: p.created_at
            }));
            return res.json({ success: true, count: mapped.length, data: mapped, source: 'supabase' });
          }
        } catch (e: any) {
          // Fallback silencioso a Firestore si la tabla no existe
        }
      }

      const snapshot = await getDocs(collection(db, 'alkosto_orders'));
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      res.json({ success: true, count: list.length, data: list, source: 'firestore' });
    } catch (err: any) {
      console.error("Error fetching Alkosto orders:", err);
      res.status(500).json({ error: "Error fetching Alkosto orders", details: err?.message });
    }
  });

  async function syncAlkostoOrderToExternal(item: any) {
    try {
      const correlativo = String(item.correlativo || item.numeroPedido || '').trim();
      const orderId = String(item.id || `alk-${Date.now()}`).trim();

      // Formatear renglones de artículos con la estructura exacta del Programa de Pedidos Manuales (gestor-de-pedidos-pro)
      const gestorArticles = Array.isArray(item.items)
        ? item.items.map((it: any) => ({
            codigo: String(it.sku || it.codigo || "").trim(),
            descripcion: String(it.producto || it.descripcion || "Item").trim(),
            cantidad_solicitada: Number(it.cantidadCajas ?? it.cantSolicitada ?? it.cantidad ?? 0),
            unidad_medida: String(it.presentacion || it.unid || it.unidad || "CJ").trim(),
            precio_unitario: Number(it.precioUnitarioUSD ?? it.precio ?? 0),
            sub_total: Number(it.subtotalUSD ?? it.subtotal ?? 0)
          }))
        : [];

      const totalMonto = Number(item.totalUSD ?? item.total_usd ?? gestorArticles.reduce((acc: number, a: any) => acc + (a.sub_total || 0), 0));
      const fechaValida = item.fechaPedido
        ? (String(item.fechaPedido).includes('T') ? String(item.fechaPedido).split('T')[0] : String(item.fechaPedido))
        : new Date().toISOString().split('T')[0];

      const observacionesComb = [
        item.observaciones ? String(item.observaciones).trim() : null,
        item.ordenCompraAlkosto ? `OC Alkosto: ${String(item.ordenCompraAlkosto).trim()}` : null
      ].filter(Boolean).join(" | ");

      const rawOrder = {
        id_cliente: String(item.sucursalCodigo || item.idCliente || "").trim(),
        cliente: String(item.sucursalNombre || item.cliente || "ALKOSTO").trim(),
        numero_pedido: correlativo,
        ruta: String(item.ruta || "CUENTAS CLAVE 2").trim(),
        supervisor: String(item.vendedora || "SAIRU VALLES").trim(),
        chofer: String(item.chofer || "").trim(),
        observaciones: observacionesComb,
        fecha: fechaValida,
        total_pedido: totalMonto,
        monto_pedido: totalMonto,
        sucursal: "Maracaibo",
        articulos: gestorArticles
      };

      const supabaseOrderRow = {
        id: orderId,
        numero_pedido: correlativo || null,
        cliente: rawOrder.cliente,
        id_cliente: rawOrder.id_cliente || null,
        ruta: rawOrder.ruta,
        supervisor: rawOrder.supervisor,
        chofer: rawOrder.chofer || null,
        observaciones: rawOrder.observaciones || null,
        fecha: fechaValida,
        total_pedido: totalMonto,
        monto_pedido: totalMonto,
        status: "PENDIENTE_CXC", // <--- ENTRA DIRECTAMENTE A LA SALA DE ESPERA (CXC) DE PEDIDOS MANUALES
        sucursal: "Maracaibo",
        version: 1,
        is_modified: false,
        reject_reason: null,
        cxc_note: null,
        fact_note: null,
        articulos: gestorArticles,
        status_history: [
          {
            status: "CREADO",
            department: "Ventas",
            changedBy: rawOrder.supervisor || "SAIRU VALLES",
            timestamp: new Date().toISOString()
          }
        ],
        raw_order: rawOrder,
        created_at: item.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_archived: false
      };

      // 1. Envío directo al Supabase del Programa de Pedidos Manuales (Realtime Sala de Espera CxC)
      try {
        const ordersUrl = `${PEDIDOS_MANUALES_SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/orders`;
        const supaRes = await fetch(ordersUrl, {
          method: 'POST',
          headers: {
            'apikey': PEDIDOS_MANUALES_SUPABASE_KEY,
            'Authorization': `Bearer ${PEDIDOS_MANUALES_SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(supabaseOrderRow)
        });
        if (supaRes.ok) {
          console.log(`[ALKOSTO -> PEDIDOS MANUALES] Pedido N° ${correlativo} (ID: ${orderId}) insertado exitosamente en Sala de Espera de Supabase (status: PENDIENTE_CXC)`);
        } else {
          const errTxt = await supaRes.text();
          console.warn(`[ALKOSTO -> PEDIDOS MANUALES] Supabase aviso:`, supaRes.status, errTxt);
        }
      } catch (supaErr) {
        console.error(`[ALKOSTO -> PEDIDOS MANUALES] Error conectando a Supabase Pedidos Manuales:`, supaErr);
      }

      // 2. Persistencia en archivo local orders.json del Gestor de Pedidos Manuales
      try {
        const ordersFilePath = path.resolve(process.cwd(), '../gestor-de-pedidos-pro/orders.json');
        if (fs.existsSync(ordersFilePath)) {
          const rawContent = fs.readFileSync(ordersFilePath, 'utf8');
          let fileOrders: any[] = [];
          try {
            fileOrders = JSON.parse(rawContent);
            if (!Array.isArray(fileOrders)) fileOrders = [];
          } catch {}

          const dbOrderObj = {
            id: orderId,
            status: "PENDIENTE_CXC",
            isArchived: false,
            createdAt: supabaseOrderRow.created_at,
            updatedAt: supabaseOrderRow.updated_at,
            sucursal: "Maracaibo",
            version: 1,
            order: rawOrder,
            statusHistory: supabaseOrderRow.status_history
          };

          const existingIdx = fileOrders.findIndex(o => 
            o.id === orderId || 
            (o.order?.numero_pedido && correlativo && String(o.order.numero_pedido).trim() === correlativo)
          );

          if (existingIdx >= 0) {
            fileOrders[existingIdx] = dbOrderObj;
          } else {
            fileOrders.unshift(dbOrderObj);
          }

          fs.writeFileSync(ordersFilePath, JSON.stringify(fileOrders, null, 2), 'utf8');
          console.log(`[ALKOSTO -> PEDIDOS MANUALES] Pedido N° ${correlativo} guardado en orders.json de gestor-de-pedidos-pro`);
        }
      } catch (fErr) {
        console.warn(`[ALKOSTO -> PEDIDOS MANUALES] No se pudo escribir localmente en orders.json:`, fErr);
      }

      // 3. Actualizar estado local a ENVIADO en Firestore y Supabase local para sacarlo de la sala de espera de la app de Sairú
      try {
        await setDoc(doc(db, 'alkosto_orders', orderId), {
          estado: 'ENVIADO',
          status: 'ENVIADO',
          transmitido_a_pedidos_manuales: true,
          fecha_transmision: new Date().toISOString()
        }, { merge: true });

        if (supabase) {
          Promise.resolve(supabase.from('pedidos_alkosto').update({
            status: 'ENVIADO',
            updated_at: new Date().toISOString()
          }).eq('id', orderId)).catch(err => console.warn("[SUPABASE LOCAL] Error actualizando estado a ENVIADO:", err?.message));
        }
      } catch (dbErr) {
        console.warn(`[ALKOSTO] Error actualizando estado a ENVIADO en db local:`, dbErr);
      }

      // 4. Enviar a Google Sheets Webhook
      if (GOOGLE_SCRIPT_WEBHOOK_URL) {
        fetch(GOOGLE_SCRIPT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ADD_PEDIDO_ALKOSTO',
            tipo: 'PEDIDO_ALKOSTO',
            timestamp: new Date().toISOString(),
            id: orderId,
            numeroPedido: correlativo,
            correlativo: correlativo,
            ordenCompraAlkosto: item.ordenCompraAlkosto,
            sucursalCodigo: item.sucursalCodigo,
            sucursalNombre: item.sucursalNombre,
            vendedora: item.vendedora || 'SAIRU VALLES',
            ruta: item.ruta || 'CUENTAS CLAVE 2',
            fechaPedido: fechaValida,
            fechaEntrega: item.fechaEntregaEstimada,
            totalBultos: item.totalBultos,
            totalKilos: item.totalKilos,
            totalUSD: totalMonto,
            condicionPago: item.condicionPago || 'Crédito 21 días',
            items: item.items,
            observaciones: observacionesComb
          })
        }).catch(err => console.warn("Google script webhook alkosto error:", err));
      }

    } catch (e) {
      console.warn("syncAlkostoOrderToExternal failure:", e);
    }
  }

  app.post("/api/alkosto/pedidos", authenticateToken, async (req: any, res: any) => {
    try {
      const item = req.body;
      if (!item || !item.sucursalNombre) {
        return res.status(400).json({ error: "Falta sucursalNombre" });
      }
      const id = item.id || `alk-ord-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      
      // Asignar correlativo automáticamente en sala de espera si no viene asignado
      let correlativo = item.correlativo;
      if (!correlativo || correlativo === 'AUTO' || item.numeroPedido === 'PENDIENTE') {
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

      // Guardar en Supabase si está disponible
      if (supabase) {
        Promise.resolve(supabase.from('pedidos_alkosto').upsert({
          id: record.id,
          numero_pedido: record.numeroPedido || '',
          correlativo: record.correlativo || record.numeroPedido || '',
          orden_compra_alkosto: record.ordenCompraAlkosto || '',
          sucursal_codigo: record.sucursalCodigo || '',
          sucursal_nombre: record.sucursalNombre || '',
          vendedora: record.vendedora || 'SAIRU VALLES',
          ruta: record.ruta || 'CUENTAS CLAVE 2',
          fecha_pedido: record.fechaPedido ? new Date(record.fechaPedido).toISOString().split('T')[0] : null,
          total_bultos: Number(record.totalBultos) || 0,
          total_kilos: Number(record.totalKilos) || 0,
          total_usd: Number(record.totalUSD) || 0,
          condicion_pago: record.condicionPago || '',
          items: record.items || [],
          observaciones: record.observaciones || '',
          created_at: record.createdAt
        })).catch(err => console.warn("[SUPABASE] Error guardando pedido Alkosto:", err?.message));
      }

      // Transmisión automática del pedido al programa externo / Google Sheets
      syncAlkostoOrderToExternal(record).catch(() => {});

      res.json({ success: true, data: record });
    } catch (err: any) {
      console.error("Error saving Alkosto order:", err);
      res.status(500).json({ error: "Error saving Alkosto order", details: err?.message });
    }
  });

  app.post("/api/alkosto/pedidos/transmitir", authenticateToken, async (req: any, res: any) => {
    try {
      const item = req.body;
      if (!item || (!item.id && !item.numeroPedido)) {
        return res.status(400).json({ success: false, error: "Datos de pedido requeridos o inválidos para transmisión" });
      }
      await syncAlkostoOrderToExternal(item);
      res.json({ 
        success: true, 
        message: `Pedido N° ${item.correlativo || item.numeroPedido} transmitido directamente a la Sala de Espera del Gestor de Pedidos Manuales` 
      });
    } catch (err: any) {
      console.error("Error transmitiendo pedido:", err);
      res.status(500).json({ success: false, error: "Error transmitiendo pedido", details: err?.message });
    }
  });

  app.put("/api/alkosto/pedidos/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      await setDoc(doc(db, 'alkosto_orders', id), updates, { merge: true });

      if (supabase) {
        const supaUpdate: any = {};
        if (updates.status !== undefined) supaUpdate.status = updates.status;
        if (updates.observaciones !== undefined) supaUpdate.observaciones = updates.observaciones;
        if (updates.items !== undefined) supaUpdate.items = updates.items;
        if (updates.totalBultos !== undefined) supaUpdate.total_bultos = Number(updates.totalBultos) || 0;
        if (updates.totalKilos !== undefined) supaUpdate.total_kilos = Number(updates.totalKilos) || 0;
        if (updates.totalUSD !== undefined) supaUpdate.total_usd = Number(updates.totalUSD) || 0;
        supaUpdate.updated_at = new Date().toISOString();

        Promise.resolve(supabase.from('pedidos_alkosto').update(supaUpdate).eq('id', id)).catch(err => console.warn("[SUPABASE] Error actualizando pedido Alkosto:", err?.message));
      }

      res.json({ success: true, id, updated: updates });
    } catch (err: any) {
      console.error("Error updating Alkosto order:", err);
      res.status(500).json({ error: "Error updating Alkosto order", details: err?.message });
    }
  });

  app.delete("/api/alkosto/pedidos/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await deleteDoc(doc(db, 'alkosto_orders', id));
      if (supabase) {
        Promise.resolve(supabase.from('pedidos_alkosto').delete().eq('id', id)).catch(err => console.warn("[SUPABASE] Error eliminando pedido Alkosto:", err?.message));
      }
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
  app.post("/api/alkosto/ocr-orden", authenticateToken, rateLimiter(10 * 60000, 20, 'OCR Orden Alkosto'), async (req: any, res: any) => {
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
      const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];
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
      const quota = /RESOURCE_EXHAUSTED|prepayment credits|quota|billing/i.test(String(err?.message || ''));
      return res.status(quota ? 503 : 500).json({ error: quota ? "El lector automático (IA) no está disponible temporalmente. Ingresa la orden manualmente." : "Error procesando orden de compra" });
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

  let cachedBcvRate = 875.65;

  // LECTOR OCR INTELIGENTE DE COMPROBANTES DE PAGO Y COBROS (BANCOS VENEZOLANOS)
  app.post("/api/ocr", authenticateToken, rateLimiter(10 * 60000, 30, 'OCR Bancario'), async (req: any, res: any) => {
    try {
      const { imageBase64, mimeType = "image/jpeg" } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "Falta la imagen del comprobante de pago" });
      
      let cleanBase64 = String(imageBase64).trim();
      let actualMime = mimeType;
      if (cleanBase64.startsWith('data:')) {
        const matches = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          actualMime = matches[1];
          cleanBase64 = matches[2];
        }
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ 
          error: "API Key de Gemini no configurada en el servidor (GEMINI_API_KEY en .env). Por favor ingresa los datos del pago manualmente.",
          manualEntryRequired: true
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Analiza detalladamente esta imagen de comprobante bancario, captura de pantalla de Pago Móvil, transferencia o recibo de pago venezolano.
Extrae la información financiera exacta de la transacción y devuelve estrictamente un objeto JSON con los siguientes campos:

REGLAS CRÍTICAS DE EXTRACCIÓN PARA COMPROBANTES BANCARIOS VENEZOLANOS:
1. "banco": Nombre oficial del banco de origen o emisor. Ejemplos comunes:
   - "Banco de Venezuela" (BDV, BDVenlínea, PagoMóvilBDV)
   - "Banesco" (Banesco Pago Móvil, BanescOnline)
   - "Banco Mercantil" (Mercantil Móvil, Tpago)
   - "BBVA Banco Provincial" (Provinet Móvil, Dinero Rápido)
   - "Bancamiga" (Bancamiga Pago Móvil)
   - "Banco Nacional de Crédito (BNC)"
   - "Bancaribe" (Mi Pago Bancaribe)
   - "Banplus" (Pago Plus)
   - "Banco Plaza" (Tu Pago Plaza)
   - "Banco del Tesoro" (Tesoro Pago Móvil)
   - "Banco Exterior", "Banco Bicentenario", "Zelle", "Dólares Efectivo".

2. "monto": Número decimal exacto pagado en Bolívares o Dólares (punto para decimales).
   - OJO VENEZUELA: Los recibos usan coma como decimal y punto como miles (ej: "Bs. 1.250,50" -> 1250.50; "Bs. 520,00" -> 520.00; "Bs. 5.400,00" -> 5400.00; "35,00 USD" -> 35.00).
   - NUNCA omitas decimales ni multipliques por 100 (ej: 520,00 NUNCA es 52000).

3. "referencia": El número de comprobante, secuencia, referencia bancaria o código de aprobación de la transacción (ej: "019283", "00281902", "12849201", "829103").
   - IMPORTANTE: En Pago Móvil NUNCA extraigas el número de teléfono celular (0414..., 0424..., 0412..., 0416...) ni la cédula. Extrae estrictamente el NÚMERO DE REFERENCIA / SECUENCIA bancario. Elimina palabras como "REF", "NRO", "OP", "APROBACIÓN".

4. "fecha_pago": Fecha en la que se efectuó el pago en formato YYYY-MM-DD.
   - En Venezuela los comprobantes están en formato DD/MM/YYYY (ej: 12/10/2026 -> "2026-10-12").
   - Si no aparece el año explícito pero sí el día y mes (ej: "12 Octubre"), asume el año en curso (2026).

5. "titular": Nombre de la persona o comercio que REALIZÓ el pago (el emisor/ordenante/cliente).
   - NUNCA pongas "Codizulca", "Distribuidora Codizulca" ni los datos de la cuenta receptora de la empresa.

6. "rif": Cédula de Identidad o RIF del pagador/emisor (ej: "V-18293041", "J-30192834-0").`;

      const cobroSchema = {
        type: Type.OBJECT,
        properties: {
          banco: { type: Type.STRING },
          monto: { type: Type.NUMBER },
          referencia: { type: Type.STRING },
          fecha_pago: { type: Type.STRING },
          titular: { type: Type.STRING },
          rif: { type: Type.STRING }
        },
        required: ["monto", "referencia"]
      };

      const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];
      let rawResponseText = '';
      let lastModelError: any = null;

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: actualMime, data: cleanBase64 } },
                  { text: prompt }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: cobroSchema,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              temperature: 0.1
            }
          });

          rawResponseText = response.text || '';
          if (rawResponseText) break;
        } catch (err: any) {
          lastModelError = err;
          console.warn(`[OCR COBROS] Falló modelo ${modelName}, intentando siguiente:`, err?.message);
        }
      }

      if (!rawResponseText) {
        throw new Error(lastModelError?.message || "No se pudo extraer la información del comprobante.");
      }

      const parsed = JSON.parse(rawResponseText);

      // Post-procesamiento y Sanitización Robusta
      let refClean = String(parsed.referencia || '').trim();
      refClean = refClean.replace(/^(REF|REFERENCIA|NRO|NUM|OPERACION|OP|SECUENCIA|APROB|APROBACION|#)[:\s-]*/gi, '').trim();

      const montoNum = parseNumeroSeguro(parsed.monto);

      let fechaClean = String(parsed.fecha_pago || '').trim();
      if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(fechaClean)) {
        const parts = fechaClean.split(/[/-]/);
        fechaClean = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaClean)) {
        fechaClean = new Date().toISOString().split('T')[0];
      }

      let bancoClean = String(parsed.banco || '').trim();
      if (/venezuela|bdv/i.test(bancoClean)) bancoClean = 'Banco de Venezuela';
      else if (/banesco/i.test(bancoClean)) bancoClean = 'Banesco';
      else if (/mercantil/i.test(bancoClean)) bancoClean = 'Banco Mercantil';
      else if (/provincial|bbva/i.test(bancoClean)) bancoClean = 'BBVA Banco Provincial';
      else if (/bancamiga/i.test(bancoClean)) bancoClean = 'Bancamiga';
      else if (/bnc|nacional de cr/i.test(bancoClean)) bancoClean = 'Banco Nacional de Crédito (BNC)';
      else if (/bancaribe/i.test(bancoClean)) bancoClean = 'Bancaribe';
      else if (/banplus/i.test(bancoClean)) bancoClean = 'Banplus';
      else if (/plaza/i.test(bancoClean)) bancoClean = 'Banco Plaza';
      else if (/tesoro/i.test(bancoClean)) bancoClean = 'Banco del Tesoro';
      else if (/zelle/i.test(bancoClean)) bancoClean = 'Zelle';

      const sinReferencia = !refClean || /^(NO[_ ]?ENCONTRADA|NULL|N\/A)$/i.test(refClean);
      if (montoNum <= 0 && sinReferencia) {
        return res.status(422).json({
          error: "No se pudo leer el comprobante. Toma la foto de frente, con buena luz y sin recortes, o ingresa los datos manualmente.",
          code: 'OCR_EMPTY'
        });
      }

      return res.json({
        banco: bancoClean || '',
        monto: montoNum,
        referencia: sinReferencia ? '' : refClean,
        fecha_pago: fechaClean,
        titular: String(parsed.titular || '').trim(),
        rif: String(parsed.rif || '').trim()
      });

    } catch (err: any) {
      console.error("[OCR COBROS] Error procesando comprobante:", err);
      const rawMsg = String(err?.message || '');
      const isQuota = /RESOURCE_EXHAUSTED|prepayment credits|"code"\s*:\s*(402|429)|quota|billing/i.test(rawMsg);
      if (isQuota) {
        return res.status(503).json({
          error: "El lector automático (IA) no está disponible temporalmente. Ingresa los datos del pago manualmente; el resto del módulo funciona con normalidad.",
          code: 'AI_QUOTA_EXHAUSTED'
        });
      }
      return res.status(500).json({ error: "No se pudo interpretar el comprobante. Puedes ingresar los datos manualmente." });
    }
  });

  // TASA OFICIAL BCV CON MÚLTIPLES CAPAS DE FALLBACK Y RESILIENCIA
  app.get("/api/tasa-bcv", async (req, res) => {
    try {
      const dateStr = req.query.date as string;
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.json({ tasa: cachedBcvRate });
      }

      const [year, month, day] = dateStr.split('-');
      const m = parseInt(month, 10);
      const d = parseInt(day, 10);

      // 1. Histórico de dolarvzla para la fecha solicitada
      const historicalUrl = `https://rates.dolarvzla.com/bcv/${year}/${m}/${d}.json`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const histRes = await fetch(historicalUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (histRes.ok) {
          const histData = await histRes.json();
          if (histData && typeof histData.usd === 'number' && histData.usd > 0) {
            cachedBcvRate = Number(histData.usd.toFixed(2));
            return res.json({ tasa: cachedBcvRate });
          }
        }
      } catch (err) {}

      // 2. Si no encontró (por ej. fin de semana o feriado bancario), buscar hasta 3 días hacia atrás
      const targetDate = new Date(`${dateStr}T12:00:00Z`);
      for (let i = 1; i <= 3; i++) {
        const prevDate = new Date(targetDate);
        prevDate.setDate(targetDate.getDate() - i);
        const py = prevDate.getUTCFullYear();
        const pm = prevDate.getUTCMonth() + 1;
        const pd = prevDate.getUTCDate();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const prevRes = await fetch(`https://rates.dolarvzla.com/bcv/${py}/${pm}/${pd}.json`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (prevRes.ok) {
            const prevData = await prevRes.json();
            if (prevData && typeof prevData.usd === 'number' && prevData.usd > 0) {
              cachedBcvRate = Number(prevData.usd.toFixed(2));
              return res.json({ tasa: cachedBcvRate });
            }
          }
        } catch (e) {}
      }

      // 3. Fallback: tasa actual oficial en ve.dolarapi.com
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const currRes = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (currRes.ok) {
          const data = await currRes.json();
          if (data && typeof data.promedio === 'number' && data.promedio > 0) {
            cachedBcvRate = Number(data.promedio.toFixed(2));
            return res.json({ tasa: cachedBcvRate });
          }
        }
      } catch (e) {}

      // 4. Retornar último valor conocido en caché sin arrojar error 500
      return res.json({ tasa: cachedBcvRate });
    } catch (err: any) {
      return res.json({ tasa: cachedBcvRate });
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

  app.get("/api/client-lookup", authenticateToken, async (req: any, res: any) => {
    try {
      const codigo = req.query.codigo as string;
      if (!codigo) {
        return res.status(400).json({ error: "Missing 'codigo' parameter" });
      }

      const cleanCode = String(codigo).replace(/^[#\s]+/, '').trim();
      const codeNoZeros = cleanCode.replace(/^0+/, '');

      let clientFound: any = null;

      if (supabase) {
        try {
          const { data: supaRows } = await supabase
            .from('activacion_clientes')
            .select('*')
            .or(`cliente_codigo.eq.${cleanCode},cliente_codigo.eq.${codeNoZeros}`)
            .limit(1);
          if (supaRows && supaRows.length > 0) {
            clientFound = supaRows[0];
          }
        } catch (sErr: any) {
          console.warn("[SERVER] Error consultando Supabase en client-lookup:", sErr?.message);
        }
      }

      if (!clientFound && cachedActivacionParsed && cachedActivacionParsed.length > 0) {
        const match = cachedActivacionParsed.find(c => {
          const cId = String(c.id || c.cliente_codigo || '').replace(/^[#\s]+/, '').trim();
          const cNoZeros = cId.replace(/^0+/, '');
          return cId === cleanCode || (codeNoZeros && cNoZeros === codeNoZeros);
        });
        if (match) {
          clientFound = {
            cliente_nombre: match.cliente || match.cliente_nombre,
            vendedor_nombre: match.vendedorNombre || match.vendedorId,
            cliente_codigo: match.id || match.cliente_codigo
          };
        }
      }

      if (!clientFound) {
        try {
          const workbook = await getWorkbook(false);
          const XLSX = await import('xlsx');
          const sheetName = workbook.SheetNames.find((s: string) => /activacion|clientes/i.test(s));
          if (sheetName) {
            const sheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            for (let r = 1; r < rows.length; r++) {
              const row = rows[r];
              if (!row || !row[0]) continue;
              const rCode = String(row[0]).replace(/^[#\s]+/, '').trim();
              const rNoZeros = rCode.replace(/^0+/, '');
              if (rCode === cleanCode || (codeNoZeros && rNoZeros === codeNoZeros)) {
                clientFound = {
                  cliente_nombre: String(row[1] || '').trim(),
                  vendedor_nombre: String(row[2] || '').trim(),
                  cliente_codigo: rCode
                };
                break;
              }
            }
          }
        } catch (wbErr: any) {
          console.warn("[SERVER] Fallback workbook client lookup error:", wbErr?.message);
        }
      }

      if (!clientFound) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      const data = clientFound;

      let vendedorNombre = data.vendedor_nombre;
      let vendedorEmail = '';
      if (vendedorNombre && /johnatan|soto|mikelangelo/i.test(vendedorNombre)) {
        vendedorNombre = 'Mikelangelo Diaz';
        vendedorEmail = 'Mikelangelodiaz@gmail.com';
      }
      return res.json({ 
        nombre: data.cliente_nombre || data.razon_social || '', 
        vendedor: vendedorNombre, 
        vendedorEmail: vendedorEmail, 
        direccion: data.direccion || '', 
        ruc: data.cliente_codigo || data.codigo || ''
      });

    } catch (err: any) {
      console.error("Client lookup error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  async function syncWorkbookToSupabase(workbook: any) {
    if (!supabase) return { countVolumen: 0, countActivacion: 0 };
    const XLSX = await import('xlsx');

    // 1. Extraer Volumen por SKU
    const volumenRows: any[] = [];
    const volSheet = workbook.Sheets['Volumen por SKU'];
    if (volSheet) {
      const volJson = XLSX.utils.sheet_to_json(volSheet, {header: 1});
      const header0 = volJson[0] as any[]; 
      for (let r = 2; r < volJson.length; r++) {
        const row = volJson[r] as any[];
        if (!row || !row[0]) continue;
        const sku = String(row[0]).trim();
        const articulo = String(row[1] || '').trim();
        
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
            volumenRows.push({
              sku,
              articulo,
              categoria: cat,
              vendedor_id: vendorName,
              vendedor_nombre: vendorName,
              meta_kg: metaKg,
              ejecutado_kg: ejecutadoKg,
              zona: "General"
            });
          }
        }
      }
    }

    // 2. Extraer compras operativas desde hojas de producto
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
          const rawCode = String(r[0]).trim();
          const cleanCode = rawCode.replace(/^0+/, '') || rawCode;
          const cajas = parseFloat(r[2]) || 0;
          const addVal = cajas > 0 ? cajas : 1;
          clientMap.set(rawCode, (clientMap.get(rawCode) || 0) + addVal);
          if (cleanCode !== rawCode) {
            clientMap.set(cleanCode, (clientMap.get(cleanCode) || 0) + addVal);
          }
        }
      }
      return clientMap;
    };

    const mapAceite = readActiveClients(sAceite);
    const mapAzucar = readActiveClients(sAzucar);
    const mapPollo = readActiveClients(sPollo);
    const mapAsturias = readActiveClients(sAsturias);
    const mapSalpicao = readActiveClients(sSalpicao);

    // 3. Sincronizar volumen en Supabase
    try {
      if (volumenRows.length > 0) {
        await supabase.from('ventas_volumen').delete().eq('periodo', '2026-10');
        for (let i = 0; i < volumenRows.length; i += 100) {
          const batch = volumenRows.slice(i, i + 100);
          await supabase.from('ventas_volumen').insert(batch);
        }
      }
    } catch (vErr: any) {
      console.warn("[SERVER] Error sincronizando ventas_volumen:", vErr?.message);
    }

    // 4. Sincronizar compras en activacion_clientes de Supabase preservando asignaciones maestras
    let allClients: any[] = [];
    try {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('activacion_clientes')
          .select('*')
          .order('id')
          .range(from, from + 999);
        if (error || !data || data.length === 0) break;
        allClients.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }

      if (allClients.length > 0) {
        const updateBatch: any[] = [];
        for (const c of allClients) {
          const cod = String(c.cliente_codigo).trim();
          const cleanCod = cod.replace(/^0+/, '') || cod;

          const cAceite = mapAceite.get(cod) || mapAceite.get(cleanCod) || 0;
          const cAzucar = mapAzucar.get(cod) || mapAzucar.get(cleanCod) || 0;
          const cPollo = mapPollo.get(cod) || mapPollo.get(cleanCod) || 0;
          const cAsturias = mapAsturias.get(cod) || mapAsturias.get(cleanCod) || 0;
          const cSalpicao = mapSalpicao.get(cod) || mapSalpicao.get(cleanCod) || 0;

          const hasAceite = cAceite > 0;
          const hasAzucar = cAzucar > 0;
          const hasPollo = cPollo > 0;
          const hasAsturias = cAsturias > 0;
          const hasSalpicao = cSalpicao > 0;
          const isActivo = hasAceite || hasAzucar || hasPollo || hasAsturias || hasSalpicao;

          updateBatch.push({
            id: c.id,
            periodo: '2026-10',
            cliente_codigo: c.cliente_codigo,
            cliente_nombre: c.cliente_nombre,
            vendedor_id: c.vendedor_id,
            vendedor_nombre: c.vendedor_nombre,
            status: isActivo ? 'ACTIVO' : 'INACTIVO',
            cajas_aceite: cAceite,
            cajas_azucar: cAzucar,
            cajas_pollo: cPollo,
            cajas_estandar_asturias: cAsturias,
            cajas_mortadela_salpicao: cSalpicao,
            has_aceite: hasAceite,
            has_azucar: hasAzucar,
            has_pollo: hasPollo,
            has_estandar_asturias: hasAsturias,
            has_mortadela_salpicao: hasSalpicao
          });
        }

        for (let i = 0; i < updateBatch.length; i += 100) {
          const batch = updateBatch.slice(i, i + 100);
          await supabase.from('activacion_clientes').upsert(batch, { onConflict: 'id' });
        }
      }
    } catch (cErr: any) {
      console.warn("[SERVER] Error sincronizando activacion_clientes:", cErr?.message);
    }

    return {
      countVolumen: volumenRows.length,
      countActivacion: allClients.length
    };
  }

  // ENDPOINT DE SINCRONIZACIÓN BAJO DEMANDA DESDE GOOGLE SHEETS
  app.post("/api/sync/sheets", authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      console.log("[SERVER] Sincronizando datos en vivo desde Google Sheets...");
      const workbook = await getWorkbook(true);

      // Limpiar caches en memoria
      cachedWorkbook = null;
      cachedVolumenParsed = null;
      cachedActivacionParsed = null;
      cachedMetasParsed = null;

      const result = await syncWorkbookToSupabase(workbook);

      res.json({
        success: true,
        message: "Sincronización con Google Sheets y Supabase completada con éxito",
        countVolumen: result.countVolumen,
        countActivacion: result.countActivacion,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[SERVER] Error en /api/sync/sheets:", err);
      res.status(500).json({ success: false, error: "Error sincronizando datos de Google Sheets", details: err?.message });
    }
  });

  // ==============================================================
  // HISTORIAL DE VENTAS (tabla ventas_historial + vistas hist_*)
  // Solo lectura. Protegido con JWT; el alcance por vendedor se decide AQUÍ (nunca en el navegador).
  // ==============================================================
  const normHist = (s: any) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const histFail = (res: any, e: any) => {
    const msg = String(e?.message || e || '');
    if (/does not exist|schema cache|Could not find the (table|relation)/i.test(msg)) {
      return res.status(503).json({ error: 'El historial aún no está instalado en Supabase (ejecutar scripts/sql/ventas_historial.sql y cargar el CSV).', code: 'NOT_INSTALLED' });
    }
    console.error('[HISTORIAL]', msg);
    return res.status(500).json({ error: 'Error consultando el historial', details: msg });
  };

  // Pagina de 1000 en 1000 (límite de PostgREST). `build` debe incluir order() para paginar de forma estable.
  async function histFetchAll(build: (from: number, to: number) => any): Promise<any[]> {
    const out: any[] = [];
    for (let from = 0; from < 300000; from += 1000) {
      const { data, error } = await build(from, from + 999);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }

  let histVendorsCache: { names: string[]; time: number } | null = null;
  async function histGetVendorNames(): Promise<string[]> {
    if (histVendorsCache && Date.now() - histVendorsCache.time < 300000) return histVendorsCache.names;
    const rows = await histFetchAll((a, b) => supabase!.from('hist_vendedores').select('vendedor').order('vendedor').range(a, b));
    const names = rows.map(r => String(r.vendedor || '')).filter(Boolean);
    histVendorsCache = { names, time: Date.now() };
    return names;
  }

  // Devuelve los nombres de vendedor que el usuario autenticado puede ver.
  // ADMIN: todo o la ruta pedida. VENDEDOR: únicamente sus propias rutas (ignora cualquier otro valor).
  async function histResolveScope(req: any): Promise<{ all: boolean; names: string[] }> {
    const user = req.user || {};
    const role = String(user.role || '').toUpperCase();
    const q = String(req.query.vendedor || '').trim();
    const qU = q.toUpperCase();
    const known = await histGetVendorNames();
    const toNames = (aliases: string[]) => {
      const set = new Set(aliases.map(normHist));
      return known.filter(n => set.has(normHist(n)));
    };
    const findRoute = (id: string) => {
      for (const p of Object.values(VENDOR_PROFILES)) {
        const r = p.routes.find(r => r.id === id || r.aliases.some(a => normHist(a) === normHist(id)));
        if (r) return r;
      }
      return null;
    };

    if (role === 'ADMIN') {
      if (!q || qU === 'ADMIN' || qU === 'TODOS' || qU === 'TODOS LOS VENDEDORES') return { all: true, names: [] };
      if (qU.startsWith('CONSOLIDATED:')) {
        const prof = getVendorProfile(q.slice('CONSOLIDATED:'.length));
        return { all: false, names: toNames(prof.routes.flatMap(r => r.aliases)) };
      }
      const r = findRoute(q);
      return { all: false, names: toNames(r ? r.aliases : [q]) };
    }

    const profile = getVendorProfile(String(user.username || ''));
    let routes = profile.routes;
    if (q && qU !== 'ALL_MY_ROUTES') {
      const mine = routes.find(r => r.id === q || r.aliases.some(a => normHist(a) === normHist(q)));
      if (mine) routes = [mine];
    }
    return { all: false, names: toNames(routes.flatMap(r => r.aliases)) };
  }

  const histCache = new Map<string, { time: number; data: any }>();
  const histCached = async <T,>(key: string, loader: () => Promise<T>): Promise<T> => {
    const hit = histCache.get(key);
    if (hit && Date.now() - hit.time < 300000) return hit.data as T;
    const data = await loader();
    if (histCache.size > 60) histCache.clear();
    histCache.set(key, { time: Date.now(), data });
    return data;
  };
  const scopeKey = (s: { all: boolean; names: string[] }) => (s.all ? 'ALL' : [...s.names].sort().join('|'));
  const nz = (v: any) => Number(v) || 0;

  async function histLoadVolumen(scope: { all: boolean; names: string[] }) {
    return histCached('vol:' + scopeKey(scope), async () => {
      const merged = new Map<string, any>();
      const add = (r: any) => {
        const k = `${r.ano}|${r.mes}|${r.id_articulo}`;
        let m = merged.get(k);
        if (!m) { m = { ano: r.ano, mes: r.mes, sku: r.id_articulo, articulo: r.articulo, rubro: r.rubro, cajas: 0, unidades: 0, kgs: 0, monto: 0, clientes: 0 }; merged.set(k, m); }
        m.cajas += nz(r.cajas); m.unidades += nz(r.unidades); m.kgs += nz(r.kgs); m.monto += nz(r.monto); m.clientes += nz(r.clientes);
      };
      if (scope.all) {
        const rows = await histFetchAll((a, b) => supabase!.from('hist_volumen_total_mes').select('*').order('ano').order('mes').order('id_articulo').range(a, b));
        rows.forEach(add);
      } else {
        const rows = await histFetchAll((a, b) => supabase!.from('hist_volumen_mes').select('*').in('vendedor', scope.names).order('ano').order('mes').order('vendedor').order('id_articulo').range(a, b));
        rows.forEach(add);
      }
      return [...merged.values()].map(r => ({ ...r, cajas: +r.cajas.toFixed(2), unidades: +r.unidades.toFixed(2), kgs: +r.kgs.toFixed(2), monto: +r.monto.toFixed(2) }));
    });
  }

  app.get('/api/historial/meta', authenticateToken, async (req: any, res: any) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const periodos = await histCached('periodos', () =>
        histFetchAll((a, b) => supabase!.from('hist_periodos').select('ano,mes').order('ano').order('mes').range(a, b)));
      res.json({ periodos });
    } catch (e) { histFail(res, e); }
  });

  app.get('/api/historial/volumen', authenticateToken, async (req: any, res: any) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const scope = await histResolveScope(req);
      if (!scope.all && scope.names.length === 0) return res.json({ rows: [] });
      res.json({ rows: await histLoadVolumen(scope) });
    } catch (e) { histFail(res, e); }
  });

  app.get('/api/historial/rubros', authenticateToken, async (req: any, res: any) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const scope = await histResolveScope(req);
      if (!scope.all && scope.names.length === 0) return res.json({ meses: [], cartera: 0 });

      const result = await histCached('rub:' + scopeKey(scope), async () => {
        const vol = await histLoadVolumen(scope);
        const meses = new Map<string, any>();
        const mesRow = (ano: number, mes: number) => {
          const k = `${ano}|${mes}`;
          let m = meses.get(k);
          if (!m) { m = { ano, mes, kgs: {} as Record<string, number>, cajas: {} as Record<string, number>, monto: {} as Record<string, number>, activos: { ACEITE: 0, AZUCAR: 0, POLLO: 0, ESTANDAR_ASTURIAS: 0, MORTADELA_SALPICAO: 0, TOTAL: 0 }, clientesConMovimiento: 0, fueraCartera: 0 }; meses.set(k, m); }
          return m;
        };
        vol.forEach((r: any) => {
          const m = mesRow(r.ano, r.mes);
          m.kgs[r.rubro] = (m.kgs[r.rubro] || 0) + r.kgs;
          m.cajas[r.rubro] = (m.cajas[r.rubro] || 0) + r.cajas;
          m.monto[r.rubro] = (m.monto[r.rubro] || 0) + r.monto;
        });

        const resumen = await histFetchAll((a, b) => {
          let q = supabase!.from('hist_activacion_resumen_mes').select('*');
          if (!scope.all) q = q.in('vendedor', scope.names);
          return q.order('ano').order('mes').order('vendedor').range(a, b);
        });
        resumen.forEach((r: any) => {
          const m = mesRow(r.ano, r.mes);
          m.activos.ACEITE += nz(r.act_aceite);
          m.activos.AZUCAR += nz(r.act_azucar);
          m.activos.POLLO += nz(r.act_pollo);
          m.activos.ESTANDAR_ASTURIAS += nz(r.act_estandar_asturias);
          m.activos.MORTADELA_SALPICAO += nz(r.act_mortadela_salpicao);
          m.activos.TOTAL += nz(r.act_total);
          m.clientesConMovimiento += nz(r.clientes_con_movimiento);
          m.fueraCartera += nz(r.clientes_fuera_cartera);
        });

        // Tamaño de la cartera actual (base del % de activación)
        const cart = await histFetchAll((a, b) => supabase!.from('activacion_clientes').select('cliente_codigo,vendedor_nombre').order('id').range(a, b));
        const allowed = new Set(scope.names.map(normHist));
        const seen = new Set<string>();
        cart.forEach((c: any) => {
          if (!scope.all && !allowed.has(normHist(c.vendedor_nombre))) return;
          seen.add(String(c.cliente_codigo || '').replace(/^0+/, ''));
        });

        return {
          meses: [...meses.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes),
          cartera: seen.size
        };
      });
      res.json(result);
    } catch (e) { histFail(res, e); }
  });

  app.get('/api/historial/clientes', authenticateToken, async (req: any, res: any) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const ano = parseInt(String(req.query.ano), 10);
      const mes = parseInt(String(req.query.mes), 10);
      if (!ano || !mes || mes < 1 || mes > 12) return res.status(400).json({ error: 'ano y mes son requeridos' });
      const scope = await histResolveScope(req);
      if (!scope.all && scope.names.length === 0) return res.json({ rows: [] });

      const rows = await histCached(`cli:${ano}:${mes}:${scopeKey(scope)}`, async () => {
        const data = await histFetchAll((a, b) => {
          let q = supabase!.from('hist_activacion_cliente_mes').select('*').eq('ano', ano).eq('mes', mes);
          if (!scope.all) q = q.in('vendedor', scope.names);
          return q.order('id_cliente').range(a, b);
        });
        return data.map((r: any) => ({
          id: r.id_cliente,
          cliente: r.cliente,
          vendedor: r.vendedor,
          enCartera: !!r.en_cartera,
          cajas: {
            ACEITE: nz(r.cajas_aceite),
            AZUCAR: nz(r.cajas_azucar),
            POLLO: nz(r.cajas_pollo),
            ESTANDAR_ASTURIAS: nz(r.cajas_estandar_asturias),
            MORTADELA_SALPICAO: nz(r.cajas_mortadela_salpicao)
          },
          kgs: nz(r.kgs),
          monto: nz(r.monto)
        }));
      });
      res.json({ rows });
    } catch (e) { histFail(res, e); }
  });

  app.get('/api/historial/cliente/:id', authenticateToken, async (req: any, res: any) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const id = String(req.params.id || '').trim().replace(/^0+/, '');
      if (!/^[A-Za-z0-9._-]{1,24}$/.test(id)) return res.status(400).json({ error: 'Código de cliente inválido' });
      const scope = await histResolveScope(req);
      if (!scope.all && scope.names.length === 0) return res.status(404).json({ error: 'Sin acceso' });

      const meses = await histFetchAll((a, b) => {
        let q = supabase!.from('hist_activacion_cliente_mes').select('*').eq('id_cliente', id);
        if (!scope.all) q = q.in('vendedor', scope.names);
        return q.order('ano').order('mes').range(a, b);
      });
      // Si el cliente no pertenece al alcance del usuario no se devuelve nada (ni sus productos).
      if (meses.length === 0) return res.json({ meses: [], productos: [] });

      const prods = await histFetchAll((a, b) =>
        supabase!.from('ventas_historial').select('ano,mes,id_articulo,articulo,rubro,cajas,kgs,monto').eq('id_cliente', id).order('ano').order('mes').order('id_articulo').range(a, b));
      const pm = new Map<string, any>();
      prods.forEach((r: any) => {
        const k = `${r.ano}|${r.mes}|${r.id_articulo}`;
        let m = pm.get(k);
        if (!m) { m = { ano: r.ano, mes: r.mes, sku: r.id_articulo, articulo: r.articulo, rubro: r.rubro, cajas: 0, kgs: 0, monto: 0 }; pm.set(k, m); }
        m.cajas += nz(r.cajas); m.kgs += nz(r.kgs); m.monto += nz(r.monto);
      });

      res.json({
        meses: meses.map((r: any) => ({
          ano: r.ano, mes: r.mes, cliente: r.cliente, vendedor: r.vendedor,
          cajas: { ACEITE: nz(r.cajas_aceite), AZUCAR: nz(r.cajas_azucar), POLLO: nz(r.cajas_pollo), ESTANDAR_ASTURIAS: nz(r.cajas_estandar_asturias), MORTADELA_SALPICAO: nz(r.cajas_mortadela_salpicao) },
          kgs: nz(r.kgs), monto: nz(r.monto)
        })),
        productos: [...pm.values()].map(p => ({ ...p, cajas: +p.cajas.toFixed(2), kgs: +p.kgs.toFixed(2), monto: +p.monto.toFixed(2) }))
      });
    } catch (e) { histFail(res, e); }
  });

  let cachedVolumenParsed: any[] | null = null;
  let lastVolumenParsedTime = 0;
  let cachedActivacionParsed: any[] | null = null;
  let lastActivacionParsedTime = 0;
  let cachedMetasParsed: any[] | null = null;
  let lastMetasParsedTime = 0;
  const PARSED_DATA_TTL = 30000; // 30 seconds

  app.get("/api/data/volumen", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user;
      const force = req.query.force === 'true';
      let vendorFilter: string | null = null;
      let allowedAliases: string[] = [];

      if (user.role === 'VENDEDOR') {
        const prof = getVendorProfile(user.username || '');
        allowedAliases = prof.routes.flatMap(r => [r.id, ...r.aliases]);
        vendorFilter = (user.username || '').toUpperCase().trim();
      } else if (req.query.vendedor) {
        vendorFilter = String(req.query.vendedor).toUpperCase().trim();
        if (vendorFilter && vendorFilter !== 'ADMIN' && vendorFilter !== 'TODOS') {
          const prof = getVendorProfile(vendorFilter);
          allowedAliases = prof.routes.flatMap(r => [r.id, ...r.aliases]);
        }
      }

      const filterByVendor = (list: any[]) => {
        if (!vendorFilter || vendorFilter === 'ADMIN' || vendorFilter === 'TODOS') return list;
        return list.filter(d => {
          const vNombre = (d.vendedorNombre || '').toUpperCase();
          const vId = (d.vendedorId || '').toUpperCase();
          if (vendorFilter && !/^\d+$/.test(vendorFilter)) {
            if (vNombre.includes(vendorFilter) || vId.includes(vendorFilter)) return true;
          }
          return allowedAliases.some(a => {
            const aU = a.toUpperCase();
            return vNombre.includes(aU) || vId.includes(aU) || aU.includes(vNombre) || aU.includes(vId);
          });
        });
      };

      if (!force && supabase) {
        try {
          const searchTerms = (vendorFilter && vendorFilter !== 'ADMIN' && vendorFilter !== 'TODOS')
            ? Array.from(new Set([vendorFilter, ...allowedAliases]))
                .filter(Boolean)
                .map(t => t.trim())
                .filter(t => t.length > 0 && !/^\d+$/.test(t))
            : [];
          const orClauses = searchTerms.flatMap(t => [
            `vendedor_nombre.ilike.%${t}%`,
            `vendedor_id.ilike.%${t}%`
          ]).join(',');

          let supaRows: any[] = [];
          let from = 0;
          const pageSize = 1000;
          while (from < 10000) {
            let q = supabase.from('ventas_volumen').select('*').range(from, from + pageSize - 1);
            if (orClauses) q = q.or(orClauses);
            const { data, error } = await q;
            if (error || !data || data.length === 0) break;
            supaRows.push(...data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
          if (Array.isArray(supaRows) && supaRows.length > 0) {
            const mapped = supaRows.map(r => {
              const metaKg = Number(r.meta_kg) || 0;
              const ejecutadoKg = Number(r.ejecutado_kg) || 0;
              return {
                id: String(r.id),
                sku: r.sku,
                skuId: r.sku,
                articulo: r.articulo,
                categoria: r.categoria,
                vendedorId: r.vendedor_id,
                vendedorNombre: r.vendedor_nombre,
                vendedorEmail: undefined,
                cliente: r.vendedor_nombre || 'General',
                meta: metaKg,
                metaKg: metaKg,
                ejecutado: ejecutadoKg,
                ejecutadoKg: ejecutadoKg,
                zona: r.zona || 'General'
              };
            });
            return res.json(mapped);
          }
        } catch (e) {}
      }

      if (!force && cachedVolumenParsed && (Date.now() - lastVolumenParsedTime < PARSED_DATA_TTL)) {
        return res.json(filterByVendor(cachedVolumenParsed));
      }

      const workbook = await getWorkbook(force);
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
                sku: sku,
                skuId: sku,
                articulo: articulo,
                cliente: finalVendedorNombre,
                categoria: cat,
                meta: metaKg,
                metaKg: metaKg,
                ejecutado: ejecutadoKg,
                ejecutadoKg: ejecutadoKg,
                zona: "General",
                lat: 10.6427, 
                lng: -71.6125
              });
            }
          }
        }
      }

      cachedVolumenParsed = volumenData;
      lastVolumenParsedTime = Date.now();
      res.json(filterByVendor(volumenData));
    } catch (err: any) {
      console.error("Error parsing volume data:", err);
      res.status(500).json([]);
    }
  });

  app.get("/api/data/activacion", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user;
      const force = req.query.force === 'true';
      let vendorFilter: string | null = null;
      let allowedAliases: string[] = [];

      if (user.role === 'VENDEDOR') {
        const prof = getVendorProfile(user.username || '');
        allowedAliases = prof.routes.flatMap(r => [r.id, ...r.aliases]);
        vendorFilter = (user.username || '').toUpperCase().trim();
      } else if (req.query.vendedor) {
        vendorFilter = String(req.query.vendedor).toUpperCase().trim();
        if (vendorFilter && vendorFilter !== 'ADMIN' && vendorFilter !== 'TODOS') {
          const prof = getVendorProfile(vendorFilter);
          allowedAliases = prof.routes.flatMap(r => [r.id, ...r.aliases]);
        }
      }

      const filterByVendor = (list: any[]) => {
        if (!vendorFilter || vendorFilter === 'ADMIN' || vendorFilter === 'TODOS') return list;
        return list.filter(d => {
          const vNombre = (d.vendedorNombre || '').toUpperCase();
          const vId = (d.vendedorId || '').toUpperCase();
          if (vendorFilter && !/^\d+$/.test(vendorFilter)) {
            if (vNombre.includes(vendorFilter) || vId.includes(vendorFilter)) return true;
          }
          return allowedAliases.some(a => {
            const aU = a.toUpperCase();
            return vNombre.includes(aU) || vId.includes(aU) || aU.includes(vNombre) || aU.includes(vId);
          });
        });
      };

      if (!force && supabase) {
        try {
          const searchTerms = (vendorFilter && vendorFilter !== 'ADMIN' && vendorFilter !== 'TODOS')
            ? Array.from(new Set([vendorFilter, ...allowedAliases]))
                .filter(Boolean)
                .map(t => t.trim())
                .filter(t => t.length > 0 && !/^\d+$/.test(t))
            : [];
          const orClauses = searchTerms.flatMap(t => [
            `vendedor_nombre.ilike.%${t}%`,
            `vendedor_id.ilike.%${t}%`
          ]).join(',');

          let supaRows: any[] = [];
          let from = 0;
          const pageSize = 1000;
          while (from < 10000) {
            let q = supabase.from('activacion_clientes').select('*').range(from, from + pageSize - 1);
            if (orClauses) q = q.or(orClauses);
            const { data, error } = await q;
            if (error || !data || data.length === 0) break;
            supaRows.push(...data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
          if (Array.isArray(supaRows) && supaRows.length > 0) {
            const mapped = supaRows.map(r => ({
              id: r.cliente_codigo,
              cliente: r.cliente_nombre,
              vendedorId: r.vendedor_id,
              vendedorNombre: r.vendedor_nombre,
              status: r.status,
              cajas: {
                ACEITE: Number(r.cajas_aceite) || 0,
                AZUCAR: Number(r.cajas_azucar) || 0,
                POLLO: Number(r.cajas_pollo) || 0,
                ESTANDAR_ASTURIAS: Number(r.cajas_estandar_asturias) || 0,
                MORTADELA_SALPICAO: Number(r.cajas_mortadela_salpicao) || 0
              },
              cats: {
                ACEITE: Boolean(r.has_aceite),
                AZUCAR: Boolean(r.has_azucar),
                POLLO: Boolean(r.has_pollo),
                ESTANDAR_ASTURIAS: Boolean(r.has_estandar_asturias),
                MORTADELA_SALPICAO: Boolean(r.has_mortadela_salpicao)
              }
            }));
            return res.json(mapped);
          }
        } catch (e) {}
      }

      if (!force && cachedActivacionParsed && (Date.now() - lastActivacionParsedTime < PARSED_DATA_TTL)) {
        return res.json(filterByVendor(cachedActivacionParsed));
      }

      const workbook = await getWorkbook(force);
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

      cachedActivacionParsed = activacionData;
      lastActivacionParsedTime = Date.now();
      res.json(filterByVendor(activacionData));
    } catch (err) {
      console.error("Error in /api/data/activacion:", err);
      res.status(500).json([]);
    }
  });

  app.get("/api/data/metas-activacion", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user;
      const force = req.query.force === 'true';
      let vendorFilter: string | null = null;
      if (user.role === 'VENDEDOR') {
        vendorFilter = (user.vendorId || user.username || '').toUpperCase().trim();
      } else if (req.query.vendedor) {
        vendorFilter = String(req.query.vendedor).toUpperCase().trim();
      }

      const filterByVendor = (list: any[]) => {
        if (!vendorFilter || vendorFilter === 'ADMIN' || vendorFilter === 'TODOS') return list;
        return list.filter(d => (d.vendedorId || '').toUpperCase().includes(vendorFilter));
      };

      if (!force && cachedMetasParsed && (Date.now() - lastMetasParsedTime < PARSED_DATA_TTL)) {
        return res.json(filterByVendor(cachedMetasParsed));
      }

      const workbook = await getWorkbook(force);
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

      cachedMetasParsed = metasData;
      lastMetasParsedTime = Date.now();
      res.json(filterByVendor(metasData));
    } catch(err) {
      console.error("Error in /api/data/metas-activacion:", err);
      res.status(500).json([]);
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

  const tryListen = (portToTry: number) => {
    const serverInstance = app.listen(portToTry, "0.0.0.0", () => {
      console.log(`Server running on port ${portToTry}`);

      // Auto-sincronización periódica y de inicio desde Google Sheets (1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg)
      const runAutoSync = async () => {
        try {
          console.log("[SYNC AUTO] Sincronizando datos en vivo desde Google Sheet...");
          const wb = await getWorkbook(true);
          cachedWorkbook = wb;
          cachedVolumenParsed = null;
          cachedActivacionParsed = null;
          cachedMetasParsed = null;
          const res = await syncWorkbookToSupabase(wb);
          console.log(`[SYNC AUTO] Sincronización exitosa con Google Sheet y Supabase. Volumen: ${res.countVolumen}, Activación: ${res.countActivacion}`);
        } catch (err: any) {
          console.warn("[SYNC AUTO] Error en sincronización periódica desde Google Sheet:", err?.message);
        }
      };

      // Disparar sincronización 3 segundos después del arranque
      setTimeout(runAutoSync, 3000);
      // Mantener sincronizado cada 5 minutos
      setInterval(runAutoSync, 5 * 60 * 1000);
    });

    serverInstance.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        const altPort = portToTry === 3000 ? 3005 : portToTry + 1;
        console.warn(`[SERVER] Puerto ${portToTry} ocupado por otra instancia. Intentando en puerto alternativo ${altPort}...`);
        tryListen(altPort);
      } else {
        console.error('[SERVER] Error en servidor HTTP:', err);
      }
    });
  };

  tryListen(PORT);
}

startServer().catch((err) => {
  console.error('[SERVER] Fallo al iniciar startServer:', err);
});
