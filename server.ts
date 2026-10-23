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
import {
  VENDOR_PROFILES,
  SUPERVISOR_SUMMARY_COLUMNS,
  getVendorProfile,
  getSupervisorProfile,
  getSupervisedAliases,
  getSupervisedRoutes,
  matchesVendorAlias,
  normalizeVendorName
} from './src/utils/vendorRoutes';
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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.GERENCIA_SUPABASE_ANON_KEY || process.env.VITE_GERENCIA_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx0Ymd5ZXd5aWtscWR5dWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgzMDA3OCwiZXhwIjoyMTA3NDA2MDc4fQ.k92vdZiuVkTzAWNK8Fq71m1Xi_MoWtpx_eRQcZTw1cA';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// Periodo (YYYY-MM) del mes en curso: las metas de cada mes se guardan bajo su propio periodo
// para que el historial de metas se conserve y no se sobrescriba al cambiar de mes.
export const metasPeriodoActual = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

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
  const VENDOR_SERVER_CREDENTIALS: Record<string, { password: string; role: 'ADMIN' | 'SUPERVISOR' | 'VENDEDOR'; vendorId: string }> = {
    'ADMIN': { password: process.env.ADMIN_PASSWORD || '123', role: 'ADMIN', vendorId: 'ADMIN' },
    'MARIA BRICEÑO': { password: '15937615', role: 'VENDEDOR', vendorId: '1' },
    'MARIANA CHACIN': { password: '15260049', role: 'VENDEDOR', vendorId: '2' },
    'MIKELANGELO DIAZ': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'MIKELANGELODIAZ@GMAIL.COM': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'MIKELANGELO': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'MIKELANGELO DIAZ1': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'MIKELANGELO DIAZ - VILLA DEL ROS': { password: '20863632', role: 'VENDEDOR', vendorId: '37' },
    'MIKELANGELO DIAZ VILLA DEL ROS': { password: '20863632', role: 'VENDEDOR', vendorId: '37' },
    'MIKELANGELO VILLA DEL ROS': { password: '20863632', role: 'VENDEDOR', vendorId: '37' },
    'JOHNATAN SOTO': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'JOHNATAN': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'JONATHAN': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'JHONATAN': { password: '20863632', role: 'VENDEDOR', vendorId: '3' },
    'HERNAN PAZ': { password: '15405797', role: 'VENDEDOR', vendorId: '4' },
    'OSWALDO CHURION': { password: '13754472', role: 'VENDEDOR', vendorId: '7' },
    'CARLOS FUENMAYOR': { password: '18741545', role: 'VENDEDOR', vendorId: '12' },
    'SARAH REYES': { password: '18663070', role: 'VENDEDOR', vendorId: '14' },
    'J PABLO ARAUJO - CAB/OJE': { password: '15239697', role: 'VENDEDOR', vendorId: '15' },
    'JOSE G. GONZALEZ': { password: '13262058', role: 'VENDEDOR', vendorId: '16' },
    'FOOD SERVICE SUR': { password: '19', role: 'VENDEDOR', vendorId: '19' },
    'JAIDER MEDINA - FOOD SERVICE NORTE': { password: '20', role: 'VENDEDOR', vendorId: '20' },
    'JAIDER MEDINA': { password: '20', role: 'VENDEDOR', vendorId: '20' },
    'ANGELICA MORENO': { password: '14682378', role: 'VENDEDOR', vendorId: '21' },
    'ADEL JARABA': { password: '11719291', role: 'VENDEDOR', vendorId: '22' },
    'JUAN HERNANDEZ': { password: '14658122', role: 'VENDEDOR', vendorId: '24' },
    'YOLEIDA LUGO': { password: '10083900', role: 'VENDEDOR', vendorId: '25' },
    'SAIRU VALLES': { password: '18383237', role: 'VENDEDOR', vendorId: '26' },
    'ELISA SOLER': { password: '12330043', role: 'VENDEDOR', vendorId: '28' },
    'ALI PEREZ': { password: '19117934', role: 'SUPERVISOR', vendorId: 'SUPERVISOR_ALI_PEREZ' },
    'ANGEL NAVARRO': { password: '25468939', role: 'VENDEDOR', vendorId: '29' },
    'MARIANGEL GONZALEZ': { password: '20552780', role: 'VENDEDOR', vendorId: '47' },
    'VICTOR CAMPOS': { password: '19944329', role: 'VENDEDOR', vendorId: '48' },
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
      let matchedCanonicalKey = usuarioUpper;
      if (!creds) {
        for (const [key, val] of Object.entries(VENDOR_SERVER_CREDENTIALS)) {
          if (normalizeForAuth(key) === usuarioNorm) {
            creds = val;
            matchedCanonicalKey = key;
            break;
          }
        }
      }

      const isNewFalconVendor = ['ANGEL NAVARRO', 'MARIANGEL GONZALEZ', 'VICTOR CAMPOS'].includes(matchedCanonicalKey);

      // 1. Intentar autenticación contra Supabase si la tabla existe
      if (supabase) {
        try {
          const { data: supaUser, error: supaErr } = await supabase
            .from('usuarios')
            .select('*')
            .in('username', [usuarioUpper, matchedCanonicalKey])
            .maybeSingle();

          if (!supaErr && supaUser) {
            const isBcrypt = supaUser.password_hash && supaUser.password_hash.startsWith('$2');
            let isValid = false;
            if (isBcrypt) {
              isValid = await bcrypt.compare(pwd, supaUser.password_hash) || await bcrypt.compare(pwdClean, supaUser.password_hash);
            } else {
              isValid =
                pwd === supaUser.password_hash ||
                pwdClean === supaUser.password_hash ||
                (creds && (pwd === creds.password || pwdClean === creds.password)) ||
                (matchedCanonicalKey === 'ANGEL NAVARRO' && pwdClean === '25468939') ||
                (isNewFalconVendor && (pwdClean === '19117934' || pwd === '123' || pwdClean === String(supaUser.vendor_id || '')));
            }
            if (!isValid && creds && (pwd === creds.password || pwdClean === creds.password)) {
              isValid = true;
            }

            if (isValid) {
              const supProfile = getSupervisorProfile(supaUser.username);
              const resolvedRole = supProfile ? 'SUPERVISOR' : supaUser.role;
              const token = jwt.sign(
                {
                  username: matchedCanonicalKey || supaUser.username,
                  role: resolvedRole,
                  vendorId: supaUser.vendor_id
                },
                JWT_SECRET,
                { expiresIn: '7d' }
              );

              return res.json({
                success: true,
                token,
                user: {
                  username: matchedCanonicalKey || supaUser.username,
                  role: resolvedRole,
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

      if (!creds) {
        return res.status(401).json({ success: false, error: 'Usuario no autorizado o no encontrado en la base de datos' });
      }

      const isMikel = matchedCanonicalKey.includes('MIKELANGELO') || matchedCanonicalKey.includes('SOTO') || matchedCanonicalKey.includes('JOHNATAN');
      const isValidPwd =
        pwd === creds.password ||
        pwdClean === creds.password ||
        (matchedCanonicalKey === 'ANGEL NAVARRO' && pwdClean === '25468939') ||
        (isMikel && (pwdClean === '20863632' || pwdClean === '18395226')) ||
        (isNewFalconVendor && (pwdClean === '19117934' || pwd === '123' || pwdClean === creds.vendorId));

      if (!isValidPwd) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
      }

      const token = jwt.sign(
        {
          username: matchedCanonicalKey,
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
          username: matchedCanonicalKey,
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
    const supProfile = getSupervisorProfile(req.user?.username);
    const resolvedRole = supProfile ? 'SUPERVISOR' : req.user.role;
    return res.json({
      success: true,
      user: {
        username: req.user.username,
        role: resolvedRole,
        vendorId: req.user.vendorId
      }
    });
  });

  // ==============================================================
  // ENDPOINTS DE DEGUSTACIONES Y TRADE MARKETING
  // Permite sincronización directa con https://dashboardgerencia01.ai.studio/
  // ==============================================================
  const EXCLUDED_TEST_DEG_IDS = new Set([
    'deg-001', 'deg-002', 'deg-003', 'deg-mupk8tih-e3wf', 'deg-muplzpkm-ncuu', 'test-ping-01'
  ]);

  function normalizeDegustacionRecord(raw: any): any {
    const cleanId = String(raw.id || raw.degustacionId || '').replace(/^DEG-/, '');
    return {
      id: cleanId,
      clienteCodigo: raw.clienteCodigo || raw.cliente_codigo || 'PDV',
      clienteNombre: raw.clienteNombre || raw.cliente_nombre || raw.client || 'Punto de Venta',
      vendedorNombre: raw.vendedorNombre || raw.vendedor_nombre || raw.vendedor || 'Vendedor',
      vendedorId: raw.vendedorId || raw.vendedor_id || raw.ruta || '1',
      vendedorEmail: raw.vendedorEmail || raw.vendedor_email || undefined,
      ruta: raw.ruta || raw.zone || raw.vendedorId || raw.vendedor_id || '',
      fecha: raw.fecha || raw.date || '',
      turno: raw.turno || 'MAÑANA',
      hora: raw.hora || raw.time || '',
      productos: Array.isArray(raw.productos)
        ? raw.productos
        : (typeof raw.productos === 'string' && raw.productos ? raw.productos.split(',').map((s: string) => s.trim()) : []),
      kilosEstimados: Number(raw.kilosEstimados ?? raw.kilos_estimados) || 0,
      personasEstimadas: Number(raw.personasEstimadas ?? raw.personas_estimadas) || 150,
      requierePromotora: Boolean(raw.requierePromotora ?? raw.requiere_promotora ?? true),
      promotoraAsignada: raw.promotoraAsignada || raw.promotora_asignada || '',
      materialPop: Boolean(raw.materialPop ?? raw.material_pop ?? true),
      contactoPunto: raw.contactoPunto || raw.contacto_punto || '',
      telefonoContacto: raw.telefonoContacto || raw.telefono_contacto || '',
      observaciones: raw.observaciones || '',
      estado: raw.estado || 'SOLICITADA',
      notasTradeMarketing: raw.notasTradeMarketing || raw.notas_trade_marketing || '',
      resultado: raw.resultado || null,
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString()
    };
  }

  function sortDegustacionesServer(list: any[], ascending: boolean = false): any[] {
    const shiftRank = (turno?: string, hora?: string): number => {
      const t = String(turno || '').toUpperCase().trim();
      const h = String(hora || '').toUpperCase().trim();
      if (t === 'MAÑANA' || t === 'MANANA' || h.includes('09:') || h.includes('9:') || h.includes('AM')) return 1;
      if (t === 'TARDE' || h.includes('02:') || h.includes('14:') || h.includes('04:') || h.includes('PM')) return 2;
      return 3;
    };

    const toIsoDate = (raw?: string): string => {
      const s = String(raw || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        const [d, m, y] = s.split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      return s;
    };

    return [...list].sort((a, b) => {
      const dateA = toIsoDate(a.fecha || a.date);
      const dateB = toIsoDate(b.fecha || b.date);
      if (dateA !== dateB) {
        return ascending ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      }

      const rankA = shiftRank(a.turno, a.hora || a.time);
      const rankB = shiftRank(b.turno, b.hora || b.time);
      if (rankA !== rankB) {
        return ascending ? rankB - rankA : rankA - rankB;
      }

      const vendA = String(a.vendedorNombre || a.vendedor || '').toUpperCase().trim();
      const vendB = String(b.vendedorNombre || b.vendedor || '').toUpperCase().trim();
      if (vendA !== vendB) {
        return ascending ? vendB.localeCompare(vendA, 'es') : vendA.localeCompare(vendB, 'es');
      }

      const cliA = String(a.clienteNombre || a.client || '').toUpperCase().trim();
      const cliB = String(b.clienteNombre || b.client || '').toUpperCase().trim();
      if (cliA !== cliB) {
        return ascending ? cliB.localeCompare(cliA, 'es') : cliA.localeCompare(cliB, 'es');
      }

      return ascending
        ? String(b.id || '').localeCompare(String(a.id || ''))
        : String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  async function loadAllMergedDegustaciones(): Promise<any[]> {
    const mapById = new Map<string, any>();

    if (supabase) {
      try {
        const { data: supaList, error: supaErr } = await supabase
          .from('degustaciones')
          .select('*')
          .order('fecha', { ascending: false });
        if (!supaErr && Array.isArray(supaList)) {
          for (const row of supaList) {
            const norm = normalizeDegustacionRecord(row);
            if (norm.id && !EXCLUDED_TEST_DEG_IDS.has(norm.id) && !norm.id.startsWith('test-')) {
              mapById.set(norm.id, norm);
            }
          }
        }
      } catch (_) {}
    }

    try {
      const snapshot = await getDocs(collection(db, 'degustaciones'));
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.clienteNombre) {
          const norm = normalizeDegustacionRecord({ id: docSnap.id, ...data });
          if (norm.id && !EXCLUDED_TEST_DEG_IDS.has(norm.id) && !norm.id.startsWith('test-')) {
            mapById.set(norm.id, norm);
          }
        }
      });
    } catch (_) {}

    return sortDegustacionesServer(Array.from(mapById.values()), false);
  }

  app.get("/api/degustaciones", async (req, res) => {
    try {
      let list = await loadAllMergedDegustaciones();

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

      res.json({
        success: true,
        count: list.length,
        data: list,
        source: 'merged_ordered'
      });
    } catch (err: any) {
      console.error("Error fetching degustaciones via API:", err);
      res.status(500).json({ error: "Error al consultar degustaciones", details: err?.message });
    }
  });

  const GOOGLE_SCRIPT_WEBHOOK_URL = process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbx6JMUR1IubQuZ97Ics7emw_I0G9UAy-5vig4Vl8zPwW8yMBbZldvQGeGOPNiNbUmVTaQ/exec';
  const GERENCIA_TRADE_API_URL = process.env.GERENCIA_TRADE_API_URL || 'https://codizulca-dashboard-4.onrender.com/api/degustaciones';
  const GERENCIA_UTERIO_SURVEYS_URL = 'https://uterioexpfweghxfbvoa.supabase.co/rest/v1/surveys';
  const GERENCIA_UTERIO_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZXJpb2V4cGZ3ZWdoeGZidm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTg3ODYsImV4cCI6MjEwMzUzNDc4Nn0.bZnN4vrXUDlcoIaI7l39O-bU4GQp05SvJdio_cn6niI';
  const GERENCIA_SUPABASE_SURVEYS_URL = process.env.GERENCIA_SUPABASE_SURVEYS_URL || process.env.VITE_GERENCIA_SUPABASE_SURVEYS_URL || 'https://nudltbgyewyiklqdyujk.supabase.co/rest/v1/surveys';
  const GERENCIA_SUPABASE_ANON_KEY = process.env.GERENCIA_SUPABASE_ANON_KEY || process.env.VITE_GERENCIA_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx0Ymd5ZXd5aWtscWR5dWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgzMDA3OCwiZXhwIjoyMTA3NDA2MDc4fQ.k92vdZiuVkTzAWNK8Fq71m1Xi_MoWtpx_eRQcZTw1cA';

  // Configuración de Supabase para el Programa de Pedidos Manuales (gestor-de-pedidos-pro)
  const PEDIDOS_MANUALES_SUPABASE_URL = process.env.PEDIDOS_MANUALES_SUPABASE_URL || 'https://vxduxyrbeybhhbpdyqoc.supabase.co';
  const PEDIDOS_MANUALES_SUPABASE_KEY = process.env.PEDIDOS_MANUALES_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZHV4eXJiZXliaGhicGR5cW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzUxNTgsImV4cCI6MjEwNjY1MTE1OH0.sOgUaTLZ0NhlVYSLukAysyxRzggAicjM4n-u4H8NrQ4';

  function buildTradeMarketingItemServer(rawItem: any, existingRemote?: any) {
    const item = normalizeDegustacionRecord(rawItem);
    const recordId = `DEG-${item.id}`;

    let dmyDate = String(item.fecha || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dmyDate)) {
      const [y, m, day] = dmyDate.split('-');
      dmyDate = `${day}/${m}/${y}`;
    }

    const timeStr = (item.hora && item.hora.trim())
      ? item.hora.trim()
      : (item.turno === 'TARDE' ? '02:00 PM - 07:00 PM' : '09:00 AM - 01:00 PM');

    const productStr = Array.isArray(item.productos) && item.productos.length > 0
      ? item.productos.join(', ')
      : (item.productos || 'MORTADELA');

    const vendedorName = String(item.vendedorNombre || 'VENDEDOR COMERCIAL').trim();
    const clientName = String(item.clienteNombre || 'Punto de Venta').trim();
    const zoneName = String(item.ruta || item.vendedorId || vendedorName || 'Ruta Comercial').trim();
    const kilosNum = Number(item.kilosEstimados) || 5;
    const targetNum = Number(item.personasEstimadas) || 150;

    let status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' = 'scheduled';
    const norm = String(item.estado || 'SOLICITADA').toUpperCase().trim();
    if (norm === 'REALIZADA' || norm === 'COMPLETED') status = 'completed';
    else if (norm === 'CANCELADA' || norm === 'RECHAZADA' || norm === 'CANCELLED') status = 'cancelled';

    if (existingRemote && existingRemote.status && existingRemote.status !== 'scheduled' && status === 'scheduled') {
      status = existingRemote.status;
    }

    const rawPromoter = String(item.promotoraAsignada || '').trim();
    const hasLocalAssigned = rawPromoter && !rawPromoter.toUpperCase().includes('POR ASIGNAR');
    const hasRemoteAssigned = existingRemote?.promoter && !String(existingRemote.promoter).toUpperCase().includes('POR ASIGNAR');

    const promoter = hasLocalAssigned
      ? rawPromoter
      : (hasRemoteAssigned ? existingRemote.promoter : 'POR ASIGNAR (Trade Marketing)');

    const promoterEmail = hasRemoteAssigned ? (existingRemote.promoterEmail || '') : '';
    const promoterId = hasRemoteAssigned ? (existingRemote.promoterId || '') : '';
    const promoterRole = hasRemoteAssigned && existingRemote.promoterRole ? existingRemote.promoterRole : 'Impulsadora';

    const contactPrefix = item.contactoPunto
      ? `Contacto en tienda: ${item.contactoPunto.trim()}${item.telefonoContacto ? ` (${item.telefonoContacto.trim()})` : ''}. `
      : '';
    const obsClean = String(item.observaciones || '').trim();
    const bodyNote = obsClean
      ? obsClean
      : `Agendada por ${vendedorName}. Kilos: ${kilosNum}. Personas: ${targetNum}.`;
    const fullComments = `${contactPrefix}${bodyNote}`.trim();

    return {
      id: recordId,
      date: dmyDate,
      time: timeStr,
      activity: `Degustación ${productStr} - Solicitada por ${vendedorName}`,
      product: productStr,
      promoter,
      ...(promoterEmail ? { promoterEmail } : {}),
      ...(promoterId ? { promoterId } : {}),
      promoterRole,
      client: clientName,
      zone: zoneName,
      vendedor: vendedorName,
      source: 'vendedor_app',
      status,
      delivered: Number(item.resultado?.personasAlcanzadas || existingRemote?.delivered || 0),
      target: targetNum,
      acceptanceRate: Number(existingRemote?.acceptanceRate || (status === 'completed' ? 95 : 0)),
      comments: fullComments
    };
  }

  // Sincronizador bidireccional exacto para los archivos data_degustaciones.json de Trade Marketing
  function syncToTradeMarketingJson(itemOrList: any | any[]) {
    try {
      const items = sortDegustacionesServer(Array.isArray(itemOrList) ? itemOrList : [itemOrList], false);
      const gerencia3Path = path.resolve(process.cwd(), '../codizulca-dashboard (3)/data_degustaciones.json');
      const gerencia4Path = path.resolve(process.cwd(), '../codizulca-dashboard (4)/data_degustaciones.json');
      const localPath = path.resolve(process.cwd(), 'data_degustaciones.json');

      const targetPaths = [localPath];
      if (fs.existsSync(path.dirname(gerencia3Path))) targetPaths.push(gerencia3Path);
      if (fs.existsSync(path.dirname(gerencia4Path))) targetPaths.push(gerencia4Path);

      for (const tPath of targetPaths) {
        let existing: any[] = [];
        try {
          if (fs.existsSync(tPath)) {
            existing = JSON.parse(fs.readFileSync(tPath, 'utf8') || '[]');
          }
        } catch (_) {}

        const existingMap = new Map<string, any>();
        const historicalItems: any[] = [];
        existing.forEach(e => {
          if (!e || !e.id) return;
          const normId = String(e.id).startsWith('DEG-') ? String(e.id) : `DEG-${e.id}`;
          existingMap.set(normId, e);
          if (String(e.id).startsWith('DEG-HIST-')) {
            historicalItems.push(e);
          }
        });

        const updatedVendorMap = new Map<string, any>();
        // Si es actualización unitaria, mantener las demás degustaciones existentes ordenadas
        if (!Array.isArray(itemOrList)) {
          existing.forEach(e => {
            if (e && e.id && !String(e.id).startsWith('DEG-HIST-')) {
              const normId = String(e.id).startsWith('DEG-') ? String(e.id) : `DEG-${e.id}`;
              updatedVendorMap.set(normId, e);
            }
          });
        }

        for (const rawItem of items) {
          if (!rawItem || (!rawItem.id && !rawItem.degustacionId)) continue;
          const cleanId = String(rawItem.id || rawItem.degustacionId).replace(/^DEG-/, '');
          const degId = `DEG-${cleanId}`;
          const built = buildTradeMarketingItemServer(rawItem, existingMap.get(degId));
          updatedVendorMap.set(degId, built);
        }

        const vendorItems = Array.from(updatedVendorMap.values());
        // Ordenar degustaciones activas de vendedores por fecha DD/MM/YYYY descendente y turno
        vendorItems.sort((a, b) => {
          const toIso = (s: string) => {
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(s || '')) {
              const [d, m, y] = s.split('/');
              return `${y}-${m}-${d}`;
            }
            return s || '';
          };
          const dA = toIso(a.date);
          const dB = toIso(b.date);
          if (dA !== dB) return dB.localeCompare(dA);
          const tA = String(a.time || '').includes('09:') ? 1 : 2;
          const tB = String(b.time || '').includes('09:') ? 1 : 2;
          if (tA !== tB) return tA - tB;
          return String(a.vendedor || '').localeCompare(String(b.vendedor || ''), 'es');
        });

        const finalJsonList = [...vendorItems, ...historicalItems];

        try {
          fs.writeFileSync(tPath, JSON.stringify(finalJsonList, null, 2), 'utf8');
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
      const cleanId = String(id).replace(/^DEG-/, '');
      const degId = `DEG-${cleanId}`;
      const gerencia3Path = path.resolve(process.cwd(), '../codizulca-dashboard (3)/data_degustaciones.json');
      const gerencia4Path = path.resolve(process.cwd(), '../codizulca-dashboard (4)/data_degustaciones.json');
      const localPath = path.resolve(process.cwd(), 'data_degustaciones.json');

      const targetPaths = [localPath];
      if (fs.existsSync(path.dirname(gerencia3Path))) targetPaths.push(gerencia3Path);
      if (fs.existsSync(path.dirname(gerencia4Path))) targetPaths.push(gerencia4Path);

      for (const tPath of targetPaths) {
        if (!fs.existsSync(tPath)) continue;
        const existing: any[] = JSON.parse(fs.readFileSync(tPath, 'utf8') || '[]');
        const filtered = existing.filter(e => e.id !== id && e.id !== cleanId && e.id !== degId);
        fs.writeFileSync(tPath, JSON.stringify(filtered, null, 2), 'utf8');
      }
    } catch (e: any) {
      console.warn("[SYNC TRADE] Error eliminando de json Trade Marketing:", e?.message);
    }
  }

  function buildGerenciaDirectPayload(rawItem: any) {
    const item = normalizeDegustacionRecord(rawItem);
    const normEstado = (item.estado || 'SOLICITADA').toUpperCase();
    let status = 'Solicitada';
    if (normEstado === 'APROBADA') status = 'Aprobada';
    else if (normEstado === 'RECHAZADA') status = 'Rechazada';
    else if (normEstado === 'CANCELADA') status = 'Cancelada';
    else if (normEstado === 'REALIZADA') status = 'Realizada';

    let shift = 'Mañana (9:00 AM - 1:00 PM)';
    if (item.turno === 'TARDE') shift = 'Tarde (2:00 PM - 7:00 PM)';
    else if (item.turno === 'COMPLETO') shift = 'Día Completo';

    const productListStr = Array.isArray(item.productos) && item.productos.length > 0
      ? item.productos.join(', ')
      : (item.productos || 'MORTADELA');

    const rawPromoter = String(item.promotoraAsignada || '').trim();
    const promoterAssigned = (rawPromoter && !rawPromoter.toUpperCase().includes('POR ASIGNAR'))
      ? rawPromoter
      : '';

    const commentsObj = {
      isTasting: true,
      source: 'vendedor_app',
      degustacionId: item.id,
      id: item.id,
      client: item.clienteNombre,
      cliente: item.clienteNombre,
      clienteCodigo: item.clienteCodigo || 'PDV',
      store: item.clienteNombre,
      vendedor: item.vendedorNombre,
      salesRep: item.vendedorNombre,
      promoter: promoterAssigned || 'POR ASIGNAR (Trade Marketing)',
      promotoraAsignada: promoterAssigned,
      ruta: item.ruta || item.vendedorId || '',
      date: item.fecha || new Date().toISOString().split('T')[0],
      turno: item.turno || 'MAÑANA',
      shift: shift,
      time: item.hora || (item.turno === 'MAÑANA' ? '09:00 AM - 01:00 PM' : '02:00 PM - 07:00 PM'),
      products: productListStr,
      product: productListStr,
      kilos: Number(item.kilosEstimados) || 0,
      kg: Number(item.kilosEstimados) || 0,
      personas: Number(item.personasEstimadas) || 150,
      personasEstimadas: Number(item.personasEstimadas) || 150,
      estado: normEstado,
      status: status,
      requierePromotora: Boolean(item.requierePromotora),
      promoterType: item.requierePromotora ? 'Fija' : 'Vendedor / Impulso',
      materialPop: item.materialPop ? 'SI' : 'NO',
      contactoPunto: item.contactoPunto || '',
      telefonoContacto: item.telefonoContacto || '',
      address: `Ruta: ${item.ruta || item.vendedorNombre || ''} | Contacto: ${item.contactoPunto || ''} (${item.telefonoContacto || ''})`,
      notes: item.observaciones || `Agendada por ${item.vendedorNombre}. Kilos: ${item.kilosEstimados || 5}. Personas: ${item.personasEstimadas || 150}.`,
      originalComments: item.observaciones || `Agendada por ${item.vendedorNombre}. Kilos: ${item.kilosEstimados || 5}. Personas: ${item.personasEstimadas || 150}.`,
      notasTradeMarketing: item.notasTradeMarketing || '',
      resultado: item.resultado || null
    };

    return {
      type: 'Degustacion',
      date: item.fecha || new Date().toISOString().split('T')[0],
      store: item.clienteNombre,
      promoter: promoterAssigned || item.vendedorNombre || 'Vendedor',
      product: productListStr,
      comments: JSON.stringify(commentsObj)
    };
  }

  async function upsertSurveyAtSupabase(url: string, apiKey: string, cleanId: string, payload: any) {
    try {
      const searchUrl = `${url}?comments=like.*${encodeURIComponent(cleanId)}*&select=id&limit=5`;
      const searchRes = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (searchRes.ok) {
        const records = await searchRes.json();
        if (Array.isArray(records) && records.length > 0 && records[0].id) {
          const updateUrl = `${url}?id=eq.${records[0].id}`;
          await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
              'apikey': apiKey,
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
          });
          return;
        }
      }

      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      });
    } catch (_) {}
  }

  async function syncToGerenciaDirect(item: any, existingRemote?: any) {
    try {
      const norm = normalizeDegustacionRecord(item);
      if (!norm.id || EXCLUDED_TEST_DEG_IDS.has(norm.id)) return;

      // 1. Sincronizar en data_degustaciones.json (Local y Gerencia Trade Marketing)
      syncToTradeMarketingJson(norm);

      // 2. Construir payloads para el API de Render y tablas surveys de Supabase
      const tradeItem = buildTradeMarketingItemServer(norm, existingRemote);
      const surveyPayload = buildGerenciaDirectPayload(norm);

      await Promise.all([
        // Enviar en vivo a https://codizulca-dashboard-4.onrender.com/api/degustaciones
        fetch(GERENCIA_TRADE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeItem)
        }).catch(() => {}),

        // Sincronizar en Supabase de Gerencia (uterioexpfweghxfbvoa)
        upsertSurveyAtSupabase(GERENCIA_UTERIO_SURVEYS_URL, GERENCIA_UTERIO_ANON_KEY, norm.id, surveyPayload),

        // Sincronizar en Supabase del Planificador (nudltbgyewyiklqdyujk)
        upsertSurveyAtSupabase(GERENCIA_SUPABASE_SURVEYS_URL, GERENCIA_SUPABASE_ANON_KEY, norm.id, surveyPayload)
      ]);
    } catch (err) {
      console.warn("Failed to sync directly to Gerencia:", err);
    }
  }

  async function deleteFromGerenciaDirect(id: string) {
    try {
      const cleanId = String(id).replace(/^DEG-/, '');
      const degId = `DEG-${cleanId}`;
      deleteFromTradeMarketingJson(cleanId);

      await Promise.all([
        fetch(`${GERENCIA_TRADE_API_URL}/${encodeURIComponent(degId)}`, { method: 'DELETE' }).catch(() => {}),
        fetch(`${GERENCIA_UTERIO_SURVEYS_URL}?comments=like.*${encodeURIComponent(cleanId)}*`, {
          method: 'DELETE',
          headers: {
            'apikey': GERENCIA_UTERIO_ANON_KEY,
            'Authorization': `Bearer ${GERENCIA_UTERIO_ANON_KEY}`
          }
        }).catch(() => {}),
        fetch(`${GERENCIA_SUPABASE_SURVEYS_URL}?comments=like.*${encodeURIComponent(cleanId)}*`, {
          method: 'DELETE',
          headers: {
            'apikey': GERENCIA_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`
          }
        }).catch(() => {})
      ]);
    } catch (err) {
      console.warn("Failed to delete from Gerencia:", err);
    }
  }

  // ENDPOINT DE SINCRONIZACIÓN INTEGRAL DE DEGUSTACIONES CON TRADE MARKETING
  app.post("/api/degustaciones/sync-gerencia", async (req, res) => {
    try {
      console.log("[SYNC TRADE] Sincronizando todas las degustaciones en orden cronológico con Trade Marketing (codizulca-dashboard-4)...");
      const mergedDesc = await loadAllMergedDegustaciones();

      // 1. Asegurar que todas las degustaciones estén en la tabla degustaciones de Supabase
      if (supabase && mergedDesc.length > 0) {
        const supaRows = mergedDesc.map(record => ({
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
          personas_estimadas: Number(record.personasEstimadas) || 150,
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
        }));
        await supabase.from('degustaciones').upsert(supaRows);
      }

      // 2. Consultar estado actual en Render para preservar promotoras asignadas en Trade Marketing
      const remoteById = new Map<string, any>();
      try {
        const remRes = await fetch(GERENCIA_TRADE_API_URL);
        if (remRes.ok) {
          const remJson = await remRes.json();
          if (Array.isArray(remJson)) {
            remJson.forEach((r: any) => {
              if (r && r.id) remoteById.set(String(r.id), r);
            });
          }
        }
      } catch (_) {}

      // 3. Sincronizar en data_degustaciones.json (Local y Gerencia Trade Marketing)
      syncToTradeMarketingJson(mergedDesc);

      // 4. Ordenar de más antigua a más reciente para hacer POST secuencial a Render,
      // de modo que Render deje la más reciente en el tope (orden cronológico descendente exacto)
      const orderedAsc = sortDegustacionesServer(mergedDesc, true);
      let countSynced = 0;
      for (const item of orderedAsc) {
        const degId = `DEG-${item.id}`;
        await syncToGerenciaDirect(item, remoteById.get(degId));
        countSynced++;
      }

      res.json({
        success: true,
        message: "Degustaciones sincronizadas y ordenadas correctamente en Trade Marketing",
        total: mergedDesc.length,
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

6. "rif": Cédula de Identidad o RIF del pagador/emisor (ej: "V-18293041", "J-30192834-0").

7. "metodo_pago": Clasifica el método de pago en una de estas opciones exactas:
   - "Pago Móvil"
   - "Transferencia Bancaria"
   - "Zelle / Divisas"
   - "Efectivo Divisas"
   - "Biopago / Punto"`;

      const cobroSchema = {
        type: Type.OBJECT,
        properties: {
          banco: { type: Type.STRING },
          metodo_pago: { type: Type.STRING },
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

      let metodoClean = String(parsed.metodo_pago || '').trim();
      if (/zelle/i.test(metodoClean) || /zelle/i.test(bancoClean)) metodoClean = 'Zelle / Divisas';
      else if (/transferencia/i.test(metodoClean)) metodoClean = 'Transferencia Bancaria';
      else if (/efectivo/i.test(metodoClean)) metodoClean = 'Efectivo Divisas';
      else if (/biopago|punto/i.test(metodoClean)) metodoClean = 'Biopago / Punto';
      else metodoClean = 'Pago Móvil';

      const sinReferencia = !refClean || /^(NO[_ ]?ENCONTRADA|NULL|N\/A)$/i.test(refClean);
      if (montoNum <= 0 && sinReferencia) {
        return res.status(422).json({
          error: "No se pudo leer el comprobante. Toma la foto de frente, con buena luz y sin recortes, o ingresa los datos manualmente.",
          code: 'OCR_EMPTY'
        });
      }

      return res.json({
        banco: bancoClean || '',
        metodo_pago: metodoClean,
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

  // ==============================================================
  // ALMACENAMIENTO EN LA NUBE (SUPABASE STORAGE) Y REGISTRO DE COBROS
  // ==============================================================
  const COBROS_BUCKET = 'comprobantes-cobros';
  const COBROS_LOCAL_DB_PATH = path.join(process.cwd(), 'cobros_registrados.json');
  let cobrosBucketInitialized = false;

  async function ensureCobrosBucket() {
    if (cobrosBucketInitialized || !supabase) return;
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = Array.isArray(buckets) && buckets.some((b: any) => b.name === COBROS_BUCKET);
      if (!exists) {
        await supabase.storage.createBucket(COBROS_BUCKET, {
          public: true,
          fileSizeLimit: 15728640,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'application/json']
        });
      }
      cobrosBucketInitialized = true;
    } catch (err: any) {
      console.warn('[COBROS STORAGE] Advertencia verificando bucket:', err?.message);
    }
  }

  app.post("/api/cobros/sync", authenticateToken, async (req: any, res: any) => {
    try {
      const {
        id,
        vendedor,
        vendedorEmail,
        ruta,
        metodo_pago = 'Pago Móvil',
        banco = 'No especificado',
        monto = 0,
        referencia = '',
        fecha_pago,
        titular = '',
        rif = '',
        tasa = 0,
        codigo_cliente = 'N/A',
        nombre_cliente = '',
        factura = 'N/A',
        fileDataUrl,
        fileName,
        fileMimeType,
        createdAt
      } = req.body || {};

      if (!referencia || Number(monto) <= 0) {
        return res.status(400).json({ error: 'Referencia y monto mayor a 0 son obligatorios para sincronizar el cobro.' });
      }

      const cobroId = String(id || `pago-${Date.now()}`);
      const safeVendedor = String(vendedor || req.user?.username || 'VENDEDOR')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      const safeRef = String(referencia).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'ref';
      const fechaStr = String(fecha_pago || new Date().toISOString().split('T')[0]).replace(/[^0-9-]/g, '');

      let comprobante_url = '';
      let uploadedMime = String(fileMimeType || 'image/jpeg');

      // 1. Subir archivo del comprobante (JPG/PNG/WEBP o PDF) a Supabase Storage
      if (fileDataUrl && typeof fileDataUrl === 'string' && supabase) {
        await ensureCobrosBucket();
        let base64Part = fileDataUrl.trim();
        if (base64Part.startsWith('data:')) {
          const m = base64Part.match(/^data:([^;]+);base64,(.+)$/);
          if (m) {
            uploadedMime = m[1];
            base64Part = m[2];
          }
        }
        const fileBuffer = Buffer.from(base64Part, 'base64');
        if (fileBuffer.length > 0) {
          let ext = 'jpg';
          if (uploadedMime === 'application/pdf' || String(fileName || '').toLowerCase().endsWith('.pdf')) {
            ext = 'pdf';
            uploadedMime = 'application/pdf';
          } else if (uploadedMime === 'image/png') {
            ext = 'png';
          } else if (uploadedMime === 'image/webp') {
            ext = 'webp';
          }

          const storagePath = `soportes/${safeVendedor}/${fechaStr}_${safeRef}_${cobroId}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from(COBROS_BUCKET)
            .upload(storagePath, fileBuffer, {
              contentType: uploadedMime,
              upsert: true
            });

          if (!uploadErr) {
            const { data: pubData } = supabase.storage.from(COBROS_BUCKET).getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
              comprobante_url = pubData.publicUrl;
            }
          } else {
            console.warn('[COBROS STORAGE] Error subiendo archivo a Supabase Storage:', uploadErr.message);
          }
        }
      }

      const syncedAt = new Date().toISOString();
      const cobroMetadata = {
        id: cobroId,
        vendedor: String(vendedor || req.user?.username || 'ADMIN'),
        vendedorEmail: vendedorEmail || null,
        ruta: String(ruta || 'Ruta 1'),
        metodo_pago: String(metodo_pago || 'Pago Móvil'),
        banco: String(banco || 'No especificado'),
        monto: Number(monto) || 0,
        referencia: String(referencia).trim(),
        fecha_pago: fechaStr,
        titular: String(titular || ''),
        rif: String(rif || ''),
        tasa: Number(tasa) || 0,
        codigo_cliente: String(codigo_cliente || 'N/A'),
        nombre_cliente: String(nombre_cliente || ''),
        factura: String(factura || 'N/A'),
        fileName: fileName || null,
        fileMimeType: uploadedMime,
        comprobante_url: comprobante_url || null,
        createdAt: createdAt || syncedAt,
        syncedAt
      };

      // 2. Guardar registro JSON estructurado en Supabase Storage (vinculando comprobante_url al cobro)
      if (supabase) {
        try {
          await ensureCobrosBucket();
          const jsonBuffer = Buffer.from(JSON.stringify(cobroMetadata, null, 2), 'utf-8');
          await supabase.storage
            .from(COBROS_BUCKET)
            .upload(`registros/${safeVendedor}/${cobroId}.json`, jsonBuffer, {
              contentType: 'application/json',
              upsert: true
            });
        } catch (e: any) {
          console.warn('[COBROS STORAGE] Advertencia guardando JSON en Storage:', e?.message);
        }
      }

      // 3. Guardar en Firestore (colección cobros_registrados) si está disponible
      try {
        await setDoc(doc(db, 'cobros_registrados', cobroId), cobroMetadata, { merge: true });
      } catch (_fsErr) {}

      // 4. Guardar en respaldo local del servidor (cobros_registrados.json)
      try {
        let existingList: any[] = [];
        if (fs.existsSync(COBROS_LOCAL_DB_PATH)) {
          existingList = JSON.parse(fs.readFileSync(COBROS_LOCAL_DB_PATH, 'utf-8')) || [];
        }
        const filtered = existingList.filter((item: any) => item && item.id !== cobroId);
        filtered.unshift(cobroMetadata);
        fs.writeFileSync(COBROS_LOCAL_DB_PATH, JSON.stringify(filtered.slice(0, 1000), null, 2), 'utf-8');
      } catch (_localErr) {}

      return res.json({
        success: true,
        comprobante_url,
        syncedAt,
        cobro: cobroMetadata
      });
    } catch (err: any) {
      console.error('[COBROS SYNC] Error sincronizando cobro:', err);
      return res.status(500).json({ error: err?.message || 'Error interno al sincronizar el cobro en la nube.' });
    }
  });

  app.get("/api/cobros", authenticateToken, async (req: any, res: any) => {
    try {
      let list: any[] = [];
      if (fs.existsSync(COBROS_LOCAL_DB_PATH)) {
        list = JSON.parse(fs.readFileSync(COBROS_LOCAL_DB_PATH, 'utf-8')) || [];
      }
      return res.json({ success: true, cobros: list });
    } catch (err: any) {
      return res.status(500).json({ error: 'Error consultando cobros sincronizados' });
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
          // Omitir columnas de totales de supervisor al final de la hoja (ej. ALI PEREZ, NELSON FINOL, JOHNATAN SOTO)
          if (c >= 89 || SUPERVISOR_SUMMARY_COLUMNS.has(vendorName.toUpperCase())) continue;
          
          const metaKg = parseFloat(row[c]) || 0;
          const ejecutadoKg = parseFloat(row[c+1]) || 0;
          
          if (metaKg > 0 || ejecutadoKg > 0) {
            volumenRows.push({
              periodo: metasPeriodoActual(),
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

    // 2. Extraer Metas del Grid de Activación por Vendedor
    const metasRows: any[] = [];
    const gridVendorsSeen = new Set<string>();
    const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
    if (gridSheet) {
      const gridJson = XLSX.utils.sheet_to_json(gridSheet, { header: 1 });
      for (let i = 2; i < gridJson.length; i++) {
        const row = gridJson[i] as any[];
        if (!row || !row[0]) continue;
        const vName = String(row[0]).replace(/\s+/g, ' ').trim();
        if (SUPERVISOR_SUMMARY_COLUMNS.has(vName.toUpperCase())) continue;
        gridVendorsSeen.add(vName.toUpperCase().replace(/\s*-\s*/g, ' - '));
        const cats = [
          { name: 'ACEITE', metaIdx: 2, actIdx: 3 },
          { name: 'AZÚCAR', metaIdx: 4, actIdx: 5 },
          { name: 'POLLO', metaIdx: 6, actIdx: 7 },
          { name: 'ESTANDAR Y SUPERIOR ASTURIAS', metaIdx: 8, actIdx: 9 },
          { name: 'MORTADELA SALPICAO Y ASTURIAS', metaIdx: 10, actIdx: 11 },
        ];
        cats.forEach(c => {
          metasRows.push({
            periodo: metasPeriodoActual(),
            vendedor_id: vName,
            categoria: c.name,
            meta: parseInt(row[c.metaIdx]) || 0,
            activados: parseInt(row[c.actIdx]) || 0
          });
        });
      }
    }

    // 3. Extraer compras operativas desde hojas de producto
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

    // 4. Sincronizar volumen en Supabase
    try {
      if (volumenRows.length > 0) {
        await supabase.from('ventas_volumen').delete().eq('periodo', metasPeriodoActual());
        for (let i = 0; i < volumenRows.length; i += 100) {
          const batch = volumenRows.slice(i, i + 100);
          const { error: insVolErr } = await supabase.from('ventas_volumen').insert(batch);
          if (insVolErr) throw new Error(`insert lote ${i}: ${insVolErr.message}`);
        }
      }
    } catch (vErr: any) {
      console.warn("[SERVER] Error sincronizando ventas_volumen:", vErr?.message);
    }

    // 5. Sincronizar compras en activacion_clientes de Supabase preservando asignaciones maestras
    let allClients: any[] = [];
    const clientActByVendor = new Map<string, Record<string, number>>();
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
        const seenCodes = new Map<string, any>();
        const duplicateIds: number[] = [];
        for (const c of allClients) {
          const codKey = String(c.cliente_codigo || '').trim();
          if (!codKey) continue;
          if (!seenCodes.has(codKey)) {
            seenCodes.set(codKey, c);
          } else {
            const prev = seenCodes.get(codKey);
            prev.has_aceite = Boolean(prev.has_aceite || c.has_aceite);
            prev.has_azucar = Boolean(prev.has_azucar || c.has_azucar);
            prev.has_pollo = Boolean(prev.has_pollo || c.has_pollo);
            prev.has_estandar_asturias = Boolean(prev.has_estandar_asturias || c.has_estandar_asturias);
            prev.has_mortadela_salpicao = Boolean(prev.has_mortadela_salpicao || c.has_mortadela_salpicao);
            duplicateIds.push(c.id);
          }
        }
        if (duplicateIds.length > 0) {
          for (let i = 0; i < duplicateIds.length; i += 200) {
            await supabase.from('activacion_clientes').delete().in('id', duplicateIds.slice(i, i + 200));
          }
        }

        const uniqueClients = Array.from(seenCodes.values());
        const updateBatch: any[] = [];
        for (const c of uniqueClients) {
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

          const vNorm = normalizeVendorName(c.vendedor_nombre || c.vendedor_id || '');
          if (!clientActByVendor.has(vNorm)) {
            clientActByVendor.set(vNorm, {
              'ACEITE': 0,
              'AZUCAR': 0,
              'POLLO': 0,
              'ESTANDAR Y SUPERIOR ASTURIAS': 0,
              'MORTADELA SALPICAO Y ASTURIAS': 0,
            });
          }
          const vCounts = clientActByVendor.get(vNorm)!;
          if (hasAceite) vCounts['ACEITE']++;
          if (hasAzucar) vCounts['AZUCAR']++;
          if (hasPollo) vCounts['POLLO']++;
          if (hasAsturias) vCounts['ESTANDAR Y SUPERIOR ASTURIAS']++;
          if (hasSalpicao) vCounts['MORTADELA SALPICAO Y ASTURIAS']++;

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

    // 6. Sincronizar metas_activacion en Supabase (completando activados reales cuando el Grid tiene '-')
    try {
      for (const m of metasRows) {
        if (m.activados === 0) {
          const vNorm = normalizeVendorName(m.vendedor_id);
          const vCounts = clientActByVendor.get(vNorm);
          if (vCounts && vCounts[m.categoria] !== undefined) {
            m.activados = vCounts[m.categoria];
          }
        }
      }
      if (!metasRows.some((m) => normalizeVendorName(m.vendedor_id).includes('ANGEL NAVARRO'))) {
        const angelCounts = clientActByVendor.get('ANGEL NAVARRO') || {};
        for (const cat of ['ACEITE', 'AZUCAR', 'POLLO', 'ESTANDAR Y SUPERIOR ASTURIAS', 'MORTADELA SALPICAO Y ASTURIAS']) {
          metasRows.push({
            periodo: metasPeriodoActual(),
            vendedor_id: 'ANGEL NAVARRO',
            categoria: cat,
            meta: 0,
            activados: angelCounts[cat] || 0,
          });
        }
      }
      if (metasRows.length > 0) {
        await supabase.from('metas_activacion').delete().eq('periodo', metasPeriodoActual());
        for (let i = 0; i < metasRows.length; i += 100) {
          const batch = metasRows.slice(i, i + 100);
          const { error: insMetaErr } = await supabase.from('metas_activacion').insert(batch);
          if (insMetaErr) throw new Error(`insert lote ${i}: ${insMetaErr.message}`);
        }
      }
    } catch (mErr: any) {
      console.warn("[SERVER] Error sincronizando metas_activacion:", mErr?.message);
    }

    return {
      countVolumen: volumenRows.length,
      countActivacion: allClients.length,
      countMetas: metasRows.length
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
        countMetas: result.countMetas,
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
  const normHist = (s: any) => String(s || '').replace(/Ã‘|Ã±/g, 'N').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const normalizeHistRubroCode = (raw: any): string | null => {
    const s = normHist(raw);
    if (!s) return null;
    if (s.includes('ACEITE')) return 'ACEITE';
    if (s.includes('AZUCAR')) return 'AZUCAR';
    if (s.includes('POLLO') || s.includes('ARROZ')) return 'POLLO';
    if (s.includes('ESTANDAR') || s.includes('SUPERIOR') || s.includes('ENTERO')) return 'ESTANDAR_ASTURIAS';
    if (s.includes('MORTADELA') || s.includes('SALPICAO') || s.includes('LIGEROS')) return 'MORTADELA_SALPICAO';
    return null;
  };

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

  let histCarteraCache: { rows: { cod: string; vend: string }[]; time: number } | null = null;
  async function histGetCarteraVendorMap(): Promise<{ cod: string; vend: string }[]> {
    if (histCarteraCache && Date.now() - histCarteraCache.time < 300000) return histCarteraCache.rows;
    const raw = await histFetchAll((a, b) => supabase!.from('activacion_clientes').select('cliente_codigo,vendedor_nombre').order('id').range(a, b));
    const rows = raw
      .map((r: any) => ({
        cod: String(r.cliente_codigo || '').trim().replace(/^#/, '').replace(/^0+/, ''),
        vend: normHist(r.vendedor_nombre)
      }))
      .filter((r) => r.cod && r.vend);
    histCarteraCache = { rows, time: Date.now() };
    return rows;
  }

  interface HistScope {
    all: boolean;
    names: string[];
    aliases: string[];
    clientIds?: Set<string>;
  }

  // Devuelve los nombres de vendedor que el usuario autenticado puede ver.
  // ADMIN: todo o la ruta/supervisor pedido. SUPERVISOR: su equipo o un vendedor de su equipo. VENDEDOR: únicamente sus propias rutas.
  async function histResolveScope(req: any): Promise<HistScope> {
    const user = req.user || {};
    const supProfile = getSupervisorProfile(user.username);
    const role = supProfile ? 'SUPERVISOR' : String(user.role || '').toUpperCase();
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

    const enrichNewVendorScope = async (names: string[], aliases: string[], isSupervisorScope = false): Promise<HistScope> => {
      if (names.length > 0) return { all: false, names, aliases };
      // Para el supervisor Alí Pérez consolidado, en ventas_historial los registros están bajo "ALI PEREZ"
      if (isSupervisorScope) {
        const supHistNames = toNames([...aliases, 'ALI PEREZ']);
        return { all: false, names: supHistNames, aliases };
      }
      // Para vendedores nuevos de la zona de Alí Pérez (Ángel Navarro, Mariangel González, Víctor Campos),
      // filtramos el historial real de sus clientes asignados actualmente en activacion_clientes.
      const aliasSet = new Set(aliases);
      const carteraRows = await histGetCarteraVendorMap();
      const clientIds = new Set<string>();
      carteraRows.forEach((r) => {
        if (aliasSet.has(r.vend)) clientIds.add(r.cod);
      });
      if (clientIds.size > 0) {
        const aliHistNames = toNames(['ALI PEREZ', ...aliases]);
        if (aliHistNames.length > 0) {
          return { all: false, names: aliHistNames, aliases, clientIds };
        }
      }
      return { all: false, names, aliases };
    };

    if (role === 'ADMIN') {
      if (!q || qU === 'ADMIN' || qU === 'TODOS' || qU === 'TODOS LOS VENDEDORES') return { all: true, names: [], aliases: [] };
      if (qU.startsWith('SUPERVISOR:')) {
        const supName = q.slice('SUPERVISOR:'.length);
        const supAliases = getSupervisedAliases(supName);
        return enrichNewVendorScope(toNames([...supAliases, supName]), supAliases.map(normHist), true);
      }
      if (qU.startsWith('CONSOLIDATED:')) {
        const prof = getVendorProfile(q.slice('CONSOLIDATED:'.length));
        const aliases = prof.routes.flatMap(r => [r.id, ...r.aliases]).map(normHist);
        return enrichNewVendorScope(toNames(prof.routes.flatMap(r => r.aliases)), aliases);
      }
      const r = findRoute(q);
      const aliases = (r ? [r.id, ...r.aliases] : [q]).map(normHist);
      return enrichNewVendorScope(toNames(r ? r.aliases : [q]), aliases);
    }

    if (role === 'SUPERVISOR') {
      const mySup = supProfile || getSupervisorProfile(String(user.username || ''));
      const supName = mySup?.canonicalUsername || String(user.username || '');
      const allSupAliases = getSupervisedAliases(supName);
      if (!q || qU === 'SUPERVISOR_ALL' || qU === 'ALL_MY_ROUTES' || qU.startsWith('SUPERVISOR:')) {
        return enrichNewVendorScope(toNames([...allSupAliases, supName]), allSupAliases.map(normHist), true);
      }
      const targetVendor = q.replace(/^CONSOLIDATED:/i, '');
      const supRoutes = getSupervisedRoutes(supName);
      const matchedRoute = supRoutes.find(r => r.id === targetVendor || r.aliases.some(a => normHist(a) === normHist(targetVendor)));
      if (matchedRoute) {
        const aliases = [matchedRoute.id, ...matchedRoute.aliases].map(normHist);
        return enrichNewVendorScope(toNames(matchedRoute.aliases), aliases);
      }
      if (mySup?.supervisedVendors.some(v => normHist(v) === normHist(targetVendor))) {
        const prof = getVendorProfile(targetVendor);
        const aliases = prof.routes.flatMap(r => [r.id, ...r.aliases]).map(normHist);
        return enrichNewVendorScope(toNames(prof.routes.flatMap(r => r.aliases)), aliases);
      }
      return enrichNewVendorScope(toNames([...allSupAliases, supName]), allSupAliases.map(normHist), true);
    }

    const profile = getVendorProfile(String(user.username || ''));
    let routes = profile.routes;
    if (q && qU !== 'ALL_MY_ROUTES') {
      const mine = routes.find(r => r.id === q || r.aliases.some(a => normHist(a) === normHist(q)));
      if (mine) routes = [mine];
    }
    const aliases = routes.flatMap(r => [r.id, ...r.aliases]).map(normHist);
    return enrichNewVendorScope(toNames(routes.flatMap(r => r.aliases)), aliases);
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
  const scopeKey = (s: HistScope) => (s.all ? 'ALL' : [...s.names, ...(s.aliases || [])].sort().join('|'));
  const nz = (v: any) => Number(v) || 0;

  async function histLoadVolumen(scope: HistScope) {
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
      } else if (scope.clientIds && scope.clientIds.size > 0) {
        const rawRows = await histFetchAll((a, b) =>
          supabase!.from('ventas_historial')
            .select('ano,mes,id_cliente,id_articulo,articulo,rubro,cajas,unidades,kgs,monto')
            .in('vendedor', scope.names)
            .order('ano').order('mes').order('id_articulo').order('id_cliente')
            .range(a, b)
        );
        const cliSets = new Map<string, Set<string>>();
        rawRows.forEach((r: any) => {
          const cid = String(r.id_cliente || '').trim().replace(/^#/, '').replace(/^0+/, '');
          if (!scope.clientIds!.has(cid)) return;
          const k = `${r.ano}|${r.mes}|${r.id_articulo}`;
          let m = merged.get(k);
          if (!m) { m = { ano: r.ano, mes: r.mes, sku: r.id_articulo, articulo: r.articulo, rubro: r.rubro, cajas: 0, unidades: 0, kgs: 0, monto: 0, clientes: 0 }; merged.set(k, m); }
          m.cajas += nz(r.cajas); m.unidades += nz(r.unidades); m.kgs += nz(r.kgs); m.monto += nz(r.monto);
          if (nz(r.cajas) > 0 && cid) {
            let cs = cliSets.get(k);
            if (!cs) { cs = new Set(); cliSets.set(k, cs); }
            cs.add(cid);
          }
        });
        cliSets.forEach((cs, k) => {
          const m = merged.get(k);
          if (m) m.clientes = cs.size;
        });
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

        const cart = await histFetchAll((a, b) => supabase!.from('activacion_clientes').select('cliente_codigo,vendedor_nombre').order('id').range(a, b));
        const allowed = new Set([...scope.names.map(normHist), ...(scope.aliases || [])]);
        const seen = new Set<string>();
        cart.forEach((c: any) => {
          if (!scope.all && !allowed.has(normHist(c.vendedor_nombre))) return;
          seen.add(String(c.cliente_codigo || '').trim().replace(/^#/, '').replace(/^0+/, ''));
        });

        if (scope.clientIds && scope.clientIds.size > 0) {
          const clientRows = await histFetchAll((a, b) =>
            supabase!.from('ventas_historial')
              .select('ano,mes,id_cliente,rubro,cajas')
              .in('vendedor', scope.names)
              .order('ano').order('mes').order('id_cliente').order('id_articulo')
              .range(a, b)
          );
          const byMesCliRub = new Map<string, Record<string, number>>();
          clientRows.forEach((r: any) => {
            const cid = String(r.id_cliente || '').trim().replace(/^#/, '').replace(/^0+/, '');
            if (!scope.clientIds!.has(cid)) return;
            const mk = `${r.ano}|${r.mes}|${cid}`;
            let obj = byMesCliRub.get(mk);
            if (!obj) { obj = {}; byMesCliRub.set(mk, obj); }
            obj[r.rubro] = (obj[r.rubro] || 0) + nz(r.cajas);
            obj._ANY = (obj._ANY || 0) + nz(r.cajas);
          });
          byMesCliRub.forEach((obj, mk) => {
            const [anoS, mesS] = mk.split('|');
            const m = mesRow(Number(anoS), Number(mesS));
            let anyKeyRub = false;
            for (const rub of ['ACEITE', 'AZUCAR', 'POLLO', 'ESTANDAR_ASTURIAS', 'MORTADELA_SALPICAO']) {
              if ((obj[rub] || 0) > 0) {
                m.activos[rub] = (m.activos[rub] || 0) + 1;
                anyKeyRub = true;
              }
            }
            if (anyKeyRub) m.activos.TOTAL += 1;
            if ((obj._ANY || 0) > 0) m.clientesConMovimiento += 1;
          });
        } else {
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
            m.activos.TOTAL += nz(r.act_total ?? r.clientes_con_compra);
            m.clientesConMovimiento += nz(r.clientes_con_movimiento ?? r.clientes_con_compra);
            m.fueraCartera += nz(r.clientes_fuera_cartera);
          });

          // Si las vistas en Supabase tenían filtro legacy para ESTANDAR_ASTURIAS / MORTADELA_SALPICAO,
          // calculamos los clientes activos exactos directamente desde ventas_historial.
          const needsEmFix = [...meses.values()].every(
            (m: any) => m.activos.ESTANDAR_ASTURIAS === 0 && m.activos.MORTADELA_SALPICAO === 0 && ((m.cajas.ESTANDAR_ASTURIAS || 0) > 0 || (m.cajas.MORTADELA_SALPICAO || 0) > 0)
          );
          if (needsEmFix) {
            const emRows = await histFetchAll((a, b) => {
              let q = supabase!.from('ventas_historial').select('ano,mes,id_cliente,rubro,cajas').in('rubro', ['ESTANDAR_ASTURIAS', 'MORTADELA_SALPICAO']);
              if (!scope.all) q = q.in('vendedor', scope.names);
              return q.order('ano').order('mes').order('id_cliente').order('id_articulo').range(a, b);
            });
            const byMesRubCli = new Map<string, number>();
            emRows.forEach((r: any) => {
              const k = `${r.ano}|${r.mes}|${r.rubro}|${String(r.id_cliente || '').replace(/^0+/, '')}`;
              byMesRubCli.set(k, (byMesRubCli.get(k) || 0) + nz(r.cajas));
            });
            byMesRubCli.forEach((cajasSum, key) => {
              if (cajasSum <= 0) return;
              const [anoS, mesS, rub] = key.split('|');
              const m = mesRow(Number(anoS), Number(mesS));
              if (rub === 'ESTANDAR_ASTURIAS' || rub === 'MORTADELA_SALPICAO') {
                m.activos[rub] = (m.activos[rub] || 0) + 1;
              }
            });
          }
        }

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
        const [data, emData, cart] = await Promise.all([
          histFetchAll((a, b) => {
            let q = supabase!.from('hist_activacion_cliente_mes').select('*').eq('ano', ano).eq('mes', mes);
            if (!scope.all) q = q.in('vendedor', scope.names);
            return q.order('id_cliente').range(a, b);
          }),
          histFetchAll((a, b) => {
            let q = supabase!.from('ventas_historial').select('id_cliente,rubro,cajas').eq('ano', ano).eq('mes', mes).in('rubro', ['ESTANDAR_ASTURIAS', 'MORTADELA_SALPICAO']);
            if (!scope.all) q = q.in('vendedor', scope.names);
            return q.order('id_cliente').order('id_articulo').range(a, b);
          }),
          histFetchAll((a, b) => supabase!.from('activacion_clientes').select('cliente_codigo,vendedor_nombre').order('id').range(a, b))
        ]);

        const allowed = new Set([...scope.names.map(normHist), ...(scope.aliases || [])]);
        const carteraSet = new Set<string>();
        cart.forEach((c: any) => {
          if (!scope.all && !allowed.has(normHist(c.vendedor_nombre))) return;
          carteraSet.add(String(c.cliente_codigo || '').trim().replace(/^#/, '').replace(/^0+/, ''));
        });

        const emByClient = new Map<string, { ESTANDAR_ASTURIAS: number; MORTADELA_SALPICAO: number }>();
        emData.forEach((r: any) => {
          const cid = String(r.id_cliente || '').trim().replace(/^#/, '').replace(/^0+/, '');
          if (scope.clientIds && scope.clientIds.size > 0 && !scope.clientIds.has(cid)) return;
          let cur = emByClient.get(cid);
          if (!cur) { cur = { ESTANDAR_ASTURIAS: 0, MORTADELA_SALPICAO: 0 }; emByClient.set(cid, cur); }
          if (r.rubro === 'ESTANDAR_ASTURIAS') cur.ESTANDAR_ASTURIAS += nz(r.cajas);
          if (r.rubro === 'MORTADELA_SALPICAO') cur.MORTADELA_SALPICAO += nz(r.cajas);
        });

        const filteredData = (scope.clientIds && scope.clientIds.size > 0)
          ? data.filter((r: any) => scope.clientIds!.has(String(r.id_cliente || '').trim().replace(/^#/, '').replace(/^0+/, '')))
          : data;

        return filteredData.map((r: any) => {
          const cid = String(r.id_cliente || '').trim().replace(/^#/, '').replace(/^0+/, '');
          const em = emByClient.get(cid);
          return {
            id: r.id_cliente,
            cliente: r.cliente,
            vendedor: r.vendedor,
            enCartera: r.en_cartera !== undefined ? !!r.en_cartera : carteraSet.has(cid),
            cajas: {
              ACEITE: nz(r.cajas_aceite),
              AZUCAR: nz(r.cajas_azucar),
              POLLO: nz(r.cajas_pollo),
              ESTANDAR_ASTURIAS: nz(r.cajas_estandar_asturias) || +(em?.ESTANDAR_ASTURIAS || 0).toFixed(2),
              MORTADELA_SALPICAO: nz(r.cajas_mortadela_salpicao) || +(em?.MORTADELA_SALPICAO || 0).toFixed(2)
            },
            kgs: nz(r.kgs ?? r.kgs_total),
            monto: nz(r.monto ?? r.monto_total)
          };
        });
      });
      res.json({ rows });
    } catch (e) { histFail(res, e); }
  });

  app.get('/api/historial/cliente/:id', authenticateToken, async (req: any, res: any) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const rawId = String(req.params.id || '').trim().replace(/^#/, '');
      const id = rawId.replace(/^0+/, '');
      if (!/^[A-Za-z0-9._-]{1,24}$/.test(id)) return res.status(400).json({ error: 'Código de cliente inválido' });
      const candidateIds = Array.from(new Set([rawId, id, id.padStart(6, '0'), id.padStart(5, '0'), id.padStart(4, '0')])).filter(Boolean);
      const scope = await histResolveScope(req);
      if (!scope.all && scope.names.length === 0) return res.status(404).json({ error: 'Sin acceso' });
      if (scope.clientIds && scope.clientIds.size > 0 && !scope.clientIds.has(id)) {
        return res.json({ meses: [], productos: [] });
      }

      const meses = await histFetchAll((a, b) => {
        let q = supabase!.from('hist_activacion_cliente_mes').select('*').in('id_cliente', candidateIds);
        if (!scope.all) q = q.in('vendedor', scope.names);
        return q.order('ano').order('mes').range(a, b);
      });
      // Si el cliente no pertenece al alcance del usuario no se devuelve nada (ni sus productos).
      if (meses.length === 0) return res.json({ meses: [], productos: [] });

      const prods = await histFetchAll((a, b) => {
        let q = supabase!.from('ventas_historial').select('ano,mes,id_articulo,articulo,rubro,cajas,kgs,monto').in('id_cliente', candidateIds);
        if (!scope.all) q = q.in('vendedor', scope.names);
        return q.order('ano').order('mes').order('id_articulo').range(a, b);
      });
      const pm = new Map<string, any>();
      const cajasByMesRubro = new Map<string, Record<string, number>>();
      prods.forEach((r: any) => {
        const k = `${r.ano}|${r.mes}|${r.id_articulo}`;
        let m = pm.get(k);
        if (!m) { m = { ano: r.ano, mes: r.mes, sku: r.id_articulo, articulo: r.articulo, rubro: r.rubro, cajas: 0, kgs: 0, monto: 0 }; pm.set(k, m); }
        m.cajas += nz(r.cajas); m.kgs += nz(r.kgs); m.monto += nz(r.monto);

        const mk = `${r.ano}|${r.mes}`;
        let cm = cajasByMesRubro.get(mk);
        if (!cm) { cm = {}; cajasByMesRubro.set(mk, cm); }
        cm[r.rubro] = (cm[r.rubro] || 0) + nz(r.cajas);
      });

      res.json({
        meses: meses.map((r: any) => {
          const cm = cajasByMesRubro.get(`${r.ano}|${r.mes}`) || {};
          return {
            ano: r.ano, mes: r.mes, cliente: r.cliente, vendedor: r.vendedor,
            cajas: {
              ACEITE: nz(r.cajas_aceite) || +(cm.ACEITE || 0).toFixed(2),
              AZUCAR: nz(r.cajas_azucar) || +(cm.AZUCAR || 0).toFixed(2),
              POLLO: nz(r.cajas_pollo) || +(cm.POLLO || 0).toFixed(2),
              ESTANDAR_ASTURIAS: nz(r.cajas_estandar_asturias) || +(cm.ESTANDAR_ASTURIAS || 0).toFixed(2),
              MORTADELA_SALPICAO: nz(r.cajas_mortadela_salpicao) || +(cm.MORTADELA_SALPICAO || 0).toFixed(2)
            },
            kgs: nz(r.kgs ?? r.kgs_total),
            monto: nz(r.monto ?? r.monto_total)
          };
        }),
        productos: [...pm.values()].map(p => ({ ...p, cajas: +p.cajas.toFixed(2), kgs: +p.kgs.toFixed(2), monto: +p.monto.toFixed(2) }))
      });
    } catch (e) { histFail(res, e); }
  });

  // ==============================================================
  // DASHBOARD 360° HISTÓRICO POR RUBRO (Específico y Personal por Vendedor)
  // ==============================================================
  app.get('/api/historial/rubro-360', authenticateToken, async (req: any, res: any) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const rubroCode = normalizeHistRubroCode(req.query.rubro);
      if (!rubroCode) {
        return res.status(400).json({ error: 'Rubro inválido o no especificado' });
      }
      const scope = await histResolveScope(req);
      if (!scope.all && scope.names.length === 0) {
        return res.json({
          rubro: rubroCode,
          periodos: [],
          carteraTotal: 0,
          activadosMesActual: 0,
          metaMesActual: 0,
          periodoMetaActual: null,
          metasPorMes: [],
          periodosDisponibles: [],
          meses: [],
          skus: [],
          clientes: [],
          resumen: {
            totalMeses: 0, promedioClientesMes: 0, promedioCajasMes: 0, promedioKgsMes: 0,
            mejorMes: null, peorMes: null, totalCajasHistorico: 0, totalKgsHistorico: 0,
            clientesUnicosHistorico: 0, clientesHabituales: 0, oportunidadRecuperacion: 0, reactivadosEsteMes: 0, nuevosEsteMes: 0
          }
        });
      }

      // Filtro opcional de meses (?meses=2026-3,2026-5). Vacío = todos los meses con historial.
      const mesesFiltro: Set<string> | null = (() => {
        const raw = String(req.query.meses || '').trim();
        if (!raw) return null;
        if (raw === 'none') return new Set<string>(); // ningún mes histórico seleccionado (solo mes actual)
        const set = new Set<string>();
        raw.split(',').forEach(tok => {
          const m = tok.trim().match(/^(\d{4})-(\d{1,2})$/);
          if (m) set.add(`${Number(m[1])}-${Number(m[2])}`);
        });
        return set.size > 0 ? set : null;
      })();
      const filtroKey = mesesFiltro ? [...mesesFiltro].sort().join(',') : 'ALL';

      // Datos crudos (se consultan una vez por rubro+alcance; cambiar el filtro de meses no vuelve a consultar la BD)
      const base = await histCached(`rub360base:${rubroCode}:${scopeKey(scope)}`, async () => {
        const [periodos, rawRows, cart, metas] = await Promise.all([
          histCached('periodos', () =>
            histFetchAll((a, b) => supabase!.from('hist_periodos').select('ano,mes').order('ano').order('mes').range(a, b))
          ),
          histFetchAll((a, b) => {
            let q = supabase!
              .from('ventas_historial')
              .select('ano,mes,id_cliente,cliente,vendedor,id_articulo,articulo,cajas,unidades,kgs')
              .eq('rubro', rubroCode);
            if (!scope.all) q = q.in('vendedor', scope.names);
            return q.order('ano').order('mes').order('id_cliente').order('id_articulo').range(a, b);
          }),
          histFetchAll((a, b) =>
            supabase!.from('activacion_clientes').select('*').order('id').range(a, b)
          ),
          histFetchAll((a, b) =>
            supabase!.from('metas_activacion').select('*').order('id').range(a, b)
          )
        ]);
        const rows = (scope.clientIds && scope.clientIds.size > 0)
          ? rawRows.filter((r: any) => scope.clientIds!.has(String(r.id_cliente || '').trim().replace(/^#/, '').replace(/^0+/, '')))
          : rawRows;
        return { periodos, rows, cart, metas };
      });

      const result = await histCached(`rub360:${rubroCode}:${scopeKey(scope)}:${filtroKey}`, async () => {
        const { periodos, cart, metas } = base;
        const rows = mesesFiltro ? base.rows.filter((r: any) => mesesFiltro.has(`${r.ano}-${r.mes}`)) : base.rows;

        const allowed = new Set((scope.aliases && scope.aliases.length > 0) ? scope.aliases : scope.names.map(normHist));
        // activacion_clientes guarda el estado del mes en curso en has_<rubro> / cajas_<rubro>
        const isClientActiveInRubro = (c: any, rub: string): boolean => {
          switch (rub) {
            case 'ACEITE': return !!c.has_aceite || nz(c.cajas_aceite) > 0;
            case 'AZUCAR': return !!c.has_azucar || nz(c.cajas_azucar) > 0;
            case 'POLLO': return !!c.has_pollo || nz(c.cajas_pollo) > 0;
            case 'ESTANDAR_ASTURIAS': return !!c.has_estandar_asturias || nz(c.cajas_estandar_asturias) > 0;
            case 'MORTADELA_SALPICAO': return !!c.has_mortadela_salpicao || nz(c.cajas_mortadela_salpicao) > 0;
            default: return false;
          }
        };

        // 1. Construir mapa de cartera actual del vendedor
        const carteraMap = new Map<string, { rawId: string; nombre: string; vendedor: string; activoActual: boolean }>();
        cart.forEach((c: any) => {
          if (!scope.all && !allowed.has(normHist(c.vendedor_nombre))) return;
          const normId = String(c.cliente_codigo || '').trim().replace(/^#/, '').replace(/^0+/, '');
          if (!normId) return;
          const activoActual = isClientActiveInRubro(c, rubroCode);
          const prev = carteraMap.get(normId);
          carteraMap.set(normId, {
            rawId: String(c.cliente_codigo || normId).trim(),
            nombre: String(c.cliente_nombre || prev?.nombre || '').trim(),
            vendedor: String(c.vendedor_nombre || prev?.vendedor || '').trim(),
            activoActual: prev ? (prev.activoActual || activoActual) : activoActual
          });
        });

        const carteraTotal = carteraMap.size;
        const activadosClientesActual = [...carteraMap.values()].filter(c => c.activoActual).length;

        // 2. Metas reales guardadas por periodo (metas_activacion). Solo existen los periodos que
        //    fueron sincronizados desde el Grid; los meses sin registro quedan como null (nunca se inventan).
        const aliasSet = new Set(scope.aliases || []);
        const metasPeriodoMap = new Map<string, { meta: number; activados: number }>();
        metas.forEach((m: any) => {
          if (!scope.all && !aliasSet.has(normHist(m.vendedor_id))) return;
          if (normalizeHistRubroCode(m.categoria) !== rubroCode) return;
          const per = String(m.periodo || '');
          if (!/^\d{4}-\d{2}$/.test(per)) return;
          const cur = metasPeriodoMap.get(per) || { meta: 0, activados: 0 };
          cur.meta += nz(m.meta);
          cur.activados += nz(m.activados);
          metasPeriodoMap.set(per, cur);
        });
        const metasPorMes = [...metasPeriodoMap.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([periodo, v]) => ({ periodo, ano: Number(periodo.slice(0, 4)), mes: Number(periodo.slice(5, 7)), meta: v.meta, activados: v.activados }));
        const periodoMetaActual = metasPorMes.length > 0 ? metasPorMes[metasPorMes.length - 1].periodo : null;
        const metaActualRow = metasPorMes.length > 0 ? metasPorMes[metasPorMes.length - 1] : null;
        const metaMesActual = metaActualRow ? metaActualRow.meta : 0;
        const activadosGridActual = metaActualRow ? metaActualRow.activados : 0;
        const activadosMesActual = activadosGridActual > 0 ? activadosGridActual : activadosClientesActual;

        // 3. Estructuras de agregación histórica
        const periodosDisponibles = [...periodos].sort((a: any, b: any) => a.ano - b.ano || a.mes - b.mes);
        const sortedPeriodos = mesesFiltro
          ? periodosDisponibles.filter((p: any) => mesesFiltro.has(`${p.ano}-${p.mes}`))
          : periodosDisponibles;
        const mesAggMap = new Map<string, {
          ano: number;
          mes: number;
          clientCajas: Map<string, number>;
          skusSet: Set<string>;
          cajas: number;
          unidades: number;
          kgs: number;
        }>();

        sortedPeriodos.forEach((p: any) => {
          mesAggMap.set(`${p.ano}-${p.mes}`, {
            ano: p.ano,
            mes: p.mes,
            clientCajas: new Map(),
            skusSet: new Set(),
            cajas: 0,
            unidades: 0,
            kgs: 0
          });
        });

        const skuAggMap = new Map<string, {
          sku: string;
          articulo: string;
          totalCajas: number;
          totalUnidades: number;
          totalKgs: number;
          allClients: Map<string, number>;
          porMes: Map<string, { cajas: number; kgs: number; clientCajas: Map<string, number> }>;
        }>();

        const cliAggMap = new Map<string, {
          id: string;
          cliente: string;
          vendedor: string;
          totalCajas: number;
          totalKgs: number;
          porMes: Map<string, { cajas: number; kgs: number }>;
        }>();

        // Inicializar clientes de cartera en cliAggMap para tener visión 360 completa
        carteraMap.forEach((cInfo, normId) => {
          cliAggMap.set(normId, {
            id: cInfo.rawId.padStart(6, '0'),
            cliente: cInfo.nombre,
            vendedor: cInfo.vendedor,
            totalCajas: 0,
            totalKgs: 0,
            porMes: new Map()
          });
        });

        rows.forEach((r: any) => {
          const pKey = `${r.ano}-${r.mes}`;
          let mAgg = mesAggMap.get(pKey);
          if (!mAgg) {
            mAgg = { ano: r.ano, mes: r.mes, clientCajas: new Map(), skusSet: new Set(), cajas: 0, unidades: 0, kgs: 0 };
            mesAggMap.set(pKey, mAgg);
          }

          const normCid = String(r.id_cliente || '').trim().replace(/^#/, '').replace(/^0+/, '');
          const cajas = nz(r.cajas);
          const unidades = nz(r.unidades);
          const kgs = nz(r.kgs);
          const sku = String(r.id_articulo || '').trim();

          mAgg.cajas += cajas;
          mAgg.unidades += unidades;
          mAgg.kgs += kgs;
          if (normCid) {
            mAgg.clientCajas.set(normCid, (mAgg.clientCajas.get(normCid) || 0) + cajas);
          }
          if (sku && cajas > 0) {
            mAgg.skusSet.add(sku);
          }

          // SKU Aggregation
          if (sku) {
            let sAgg = skuAggMap.get(sku);
            if (!sAgg) {
              sAgg = {
                sku,
                articulo: String(r.articulo || sku).trim(),
                totalCajas: 0,
                totalUnidades: 0,
                totalKgs: 0,
                allClients: new Map(),
                porMes: new Map()
              };
              skuAggMap.set(sku, sAgg);
            }
            sAgg.totalCajas += cajas;
            sAgg.totalUnidades += unidades;
            sAgg.totalKgs += kgs;
            if (normCid) {
              sAgg.allClients.set(normCid, (sAgg.allClients.get(normCid) || 0) + cajas);
            }
            let sm = sAgg.porMes.get(pKey);
            if (!sm) {
              sm = { cajas: 0, kgs: 0, clientCajas: new Map() };
              sAgg.porMes.set(pKey, sm);
            }
            sm.cajas += cajas;
            sm.kgs += kgs;
            if (normCid) {
              sm.clientCajas.set(normCid, (sm.clientCajas.get(normCid) || 0) + cajas);
            }
          }

          // Client Aggregation
          if (normCid) {
            let cAgg = cliAggMap.get(normCid);
            if (!cAgg) {
              cAgg = {
                id: String(r.id_cliente || normCid).trim(),
                cliente: String(r.cliente || '').trim(),
                vendedor: String(r.vendedor || '').trim(),
                totalCajas: 0,
                totalKgs: 0,
                porMes: new Map()
              };
              cliAggMap.set(normCid, cAgg);
            } else {
              if (!cAgg.cliente && r.cliente) cAgg.cliente = String(r.cliente).trim();
              if (!cAgg.vendedor && r.vendedor) cAgg.vendedor = String(r.vendedor).trim();
            }
            cAgg.totalCajas += cajas;
            cAgg.totalKgs += kgs;
            let cm = cAgg.porMes.get(pKey);
            if (!cm) {
              cm = { cajas: 0, kgs: 0 };
              cAgg.porMes.set(pKey, cm);
            }
            cm.cajas += cajas;
            cm.kgs += kgs;
          }
        });

        // 4. Construir arreglo mensual ordenado con variaciones
        const mesesList: any[] = [];
        const orderedMesAggs = [...mesAggMap.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
        orderedMesAggs.forEach((mAgg, idx) => {
          let clientesActivados = 0;
          let clientesEnCartera = 0;
          let clientesFueraCartera = 0;
          mAgg.clientCajas.forEach((netCajas, cid) => {
            if (netCajas > 0) {
              clientesActivados++;
              if (carteraMap.has(cid)) clientesEnCartera++;
              else clientesFueraCartera++;
            }
          });
          // La variación solo se calcula contra el mes calendario inmediatamente anterior (si está visible)
          const prevCand = idx > 0 ? mesesList[idx - 1] : null;
          const prev = prevCand && (mAgg.ano * 12 + mAgg.mes) - (prevCand.ano * 12 + prevCand.mes) === 1 ? prevCand : null;
          const variacionClientes = prev !== null ? clientesActivados - prev.clientesActivados : null;
          const variacionPct = prev !== null && prev.clientesActivados > 0
            ? +(((clientesActivados - prev.clientesActivados) / prev.clientesActivados) * 100).toFixed(1)
            : null;
          const porcentajeCartera = carteraTotal > 0 ? +((clientesActivados / carteraTotal) * 100).toFixed(1) : 0;
          const metaReg = metasPeriodoMap.get(`${mAgg.ano}-${String(mAgg.mes).padStart(2, '0')}`);

          mesesList.push({
            ano: mAgg.ano,
            mes: mAgg.mes,
            clientesActivados,
            clientesEnCartera,
            clientesFueraCartera,
            porcentajeCartera,
            variacionClientes,
            variacionPct,
            cajas: +mAgg.cajas.toFixed(2),
            unidades: +mAgg.unidades.toFixed(2),
            kgs: +mAgg.kgs.toFixed(2),
            skusActivos: mAgg.skusSet.size,
            kgsPorCliente: clientesActivados > 0 ? +(mAgg.kgs / clientesActivados).toFixed(2) : 0,
            meta: metaReg ? metaReg.meta : null
          });
        });

        // 5. Construir arreglo de SKUs del rubro
        const skusList = [...skuAggMap.values()]
          .map(s => {
            const porMesObj: Record<string, { cajas: number; kgs: number; clientes: number }> = {};
            let mesesActivos = 0;
            s.porMes.forEach((sm, pk) => {
              let cliAct = 0;
              sm.clientCajas.forEach(c => { if (c > 0) cliAct++; });
              if (sm.cajas > 0) mesesActivos++;
              porMesObj[pk] = {
                cajas: +sm.cajas.toFixed(2),
                kgs: +sm.kgs.toFixed(2),
                clientes: cliAct
              };
            });
            let clientesUnicos = 0;
            s.allClients.forEach(c => { if (c > 0) clientesUnicos++; });
            return {
              sku: s.sku,
              articulo: s.articulo,
              totalCajas: +s.totalCajas.toFixed(2),
              totalUnidades: +s.totalUnidades.toFixed(2),
              totalKgs: +s.totalKgs.toFixed(2),
              clientesUnicos,
              mesesActivos,
              porMes: porMesObj
            };
          })
          .sort((a, b) => b.totalKgs - a.totalKgs || b.totalCajas - a.totalCajas);

        // 6. Construir matriz 360° de clientes en este rubro
        const totalMesesDisponibles = mesesList.length || 1;
        let clientesUnicosHistorico = 0;
        let clientesHabituales = 0;
        let oportunidadRecuperacion = 0;
        let reactivadosEsteMes = 0;
        let nuevosEsteMes = 0;

        const allClientesList = [...cliAggMap.entries()].map(([normId, c]) => {
          const cartInfo = carteraMap.get(normId);
          const enCartera = !!cartInfo;
          const activoMesActual = !!cartInfo?.activoActual;
          const porMesObj: Record<string, { cajas: number; kgs: number; activo: boolean }> = {};
          let mesesActivados = 0;
          let ultimoMesCompra: { ano: number; mes: number } | null = null;

          orderedMesAggs.forEach(mAgg => {
            const pk = `${mAgg.ano}-${mAgg.mes}`;
            const cm = c.porMes.get(pk);
            const cajas = cm ? +cm.cajas.toFixed(2) : 0;
            const kgs = cm ? +cm.kgs.toFixed(2) : 0;
            const activo = cajas > 0;
            if (activo) {
              mesesActivados++;
              ultimoMesCompra = { ano: mAgg.ano, mes: mAgg.mes };
            }
            if (cajas !== 0 || kgs !== 0) {
              porMesObj[pk] = { cajas, kgs, activo };
            }
          });

          if (mesesActivados > 0) clientesUnicosHistorico++;
          if (mesesActivados >= Math.max(1, Math.min(3, totalMesesDisponibles))) clientesHabituales++;

          let estado360: 'REACTIVADO_ESTE_MES' | 'NUEVO_ESTE_MES' | 'OPORTUNIDAD_RECUPERACION' | 'SIN_HISTORIAL' | 'FUERA_CARTERA';
          if (mesesActivados > 0 && activoMesActual) {
            estado360 = 'REACTIVADO_ESTE_MES';
            reactivadosEsteMes++;
          } else if (mesesActivados === 0 && activoMesActual) {
            estado360 = 'NUEVO_ESTE_MES';
            nuevosEsteMes++;
          } else if (mesesActivados > 0 && !activoMesActual && enCartera) {
            estado360 = 'OPORTUNIDAD_RECUPERACION';
            oportunidadRecuperacion++;
          } else if (!enCartera) {
            estado360 = 'FUERA_CARTERA';
          } else {
            estado360 = 'SIN_HISTORIAL';
          }

          return {
            id: c.id,
            cliente: c.cliente,
            vendedor: c.vendedor,
            enCartera,
            activoMesActual,
            mesesActivados,
            totalMesesDisponibles,
            frecuenciaPct: +((mesesActivados / totalMesesDisponibles) * 100).toFixed(0),
            ultimoMesCompra,
            totalCajas: +c.totalCajas.toFixed(2),
            totalKgs: +c.totalKgs.toFixed(2),
            estado360,
            porMes: porMesObj
          };
        });

        // Ordenar priorizando oportunidades de recuperación y mayor frecuencia histórica
        const estadoPriority: Record<string, number> = {
          OPORTUNIDAD_RECUPERACION: 1,
          REACTIVADO_ESTE_MES: 2,
          NUEVO_ESTE_MES: 3,
          FUERA_CARTERA: 4,
          SIN_HISTORIAL: 5
        };
        allClientesList.sort((a, b) =>
          (estadoPriority[a.estado360] || 9) - (estadoPriority[b.estado360] || 9) ||
          b.mesesActivados - a.mesesActivados ||
          b.totalKgs - a.totalKgs
        );

        // Si es ADMIN global (miles de clientes), enviar todos los que tienen actividad histórica o actual + primeros 300 sin historial
        const clientesList = scope.all
          ? allClientesList.filter((c, i) => c.mesesActivados > 0 || c.activoMesActual || i < 600)
          : allClientesList;

        // 7. Resumen ejecutivo 360°
        const totalCajasHistorico = +mesesList.reduce((acc, m) => acc + m.cajas, 0).toFixed(2);
        const totalKgsHistorico = +mesesList.reduce((acc, m) => acc + m.kgs, 0).toFixed(2);
        const nMeses = mesesList.length || 1;
        const promedioClientesMes = +(mesesList.reduce((acc, m) => acc + m.clientesActivados, 0) / nMeses).toFixed(1);
        const promedioCajasMes = +(totalCajasHistorico / nMeses).toFixed(1);
        const promedioKgsMes = +(totalKgsHistorico / nMeses).toFixed(1);

        const sortedByCli = [...mesesList].sort((a, b) => b.clientesActivados - a.clientesActivados || b.kgs - a.kgs);
        const mejorMes = sortedByCli.length > 0 ? sortedByCli[0] : null;
        const peorMes = sortedByCli.length > 0 ? sortedByCli[sortedByCli.length - 1] : null;

        return {
          rubro: rubroCode,
          periodos: sortedPeriodos,
          periodosDisponibles,
          carteraTotal,
          activadosMesActual,
          metaMesActual,
          periodoMetaActual,
          metasPorMes,
          meses: mesesList,
          skus: skusList,
          clientes: clientesList,
          resumen: {
            totalMeses: mesesList.length,
            promedioClientesMes,
            promedioCajasMes,
            promedioKgsMes,
            mejorMes: mejorMes ? { ano: mejorMes.ano, mes: mejorMes.mes, clientesActivados: mejorMes.clientesActivados, kgs: mejorMes.kgs, cajas: mejorMes.cajas } : null,
            peorMes: peorMes ? { ano: peorMes.ano, mes: peorMes.mes, clientesActivados: peorMes.clientesActivados, kgs: peorMes.kgs, cajas: peorMes.cajas } : null,
            totalCajasHistorico,
            totalKgsHistorico,
            clientesUnicosHistorico,
            clientesHabituales,
            oportunidadRecuperacion,
            reactivadosEsteMes,
            nuevosEsteMes
          }
        };
      });

      res.json(result);
    } catch (e) { histFail(res, e); }
  });

  let cachedVolumenParsed: any[] | null = null;
  let lastVolumenParsedTime = 0;
  let cachedActivacionParsed: any[] | null = null;
  let lastActivacionParsedTime = 0;
  let cachedMetasParsed: any[] | null = null;
  let lastMetasParsedTime = 0;
  const PARSED_DATA_TTL = 60000; // 60 seconds

  const resolveDataFilter = (user: any, queryVendedor: any) => {
    const supProfile = getSupervisorProfile(user?.username);
    const effectiveRole = supProfile ? 'SUPERVISOR' : String(user?.role || '').toUpperCase();
    const rawQuery = String(queryVendedor || '').trim();
    const rawUpper = rawQuery.toUpperCase();

    if (effectiveRole === 'SUPERVISOR') {
      const supName = supProfile?.canonicalUsername || String(user?.username || '').toUpperCase().trim();
      if (!rawUpper || rawUpper === 'SUPERVISOR_ALL' || rawUpper === 'ALL_MY_ROUTES' || rawUpper.startsWith('SUPERVISOR:')) {
        return {
          vendorFilter: `SUPERVISOR:${supName}`,
          allowedAliases: getSupervisedAliases(supName)
        };
      }
      const target = rawUpper.replace(/^CONSOLIDATED:/i, '').trim();
      const supRoutes = getSupervisedRoutes(supName);
      const matchedRoute = supRoutes.find(r => matchesVendorAlias([r.id, ...r.aliases], target));
      if (matchedRoute) {
        return {
          vendorFilter: matchedRoute.id,
          allowedAliases: [matchedRoute.id, ...matchedRoute.aliases]
        };
      }
      if (supProfile?.supervisedVendors.some(v => matchesVendorAlias([v], target))) {
        const prof = getVendorProfile(target);
        return {
          vendorFilter: target,
          allowedAliases: prof.routes.flatMap(r => [r.id, ...r.aliases, prof.canonicalUsername, prof.displayName])
        };
      }
      return {
        vendorFilter: `SUPERVISOR:${supName}`,
        allowedAliases: getSupervisedAliases(supName)
      };
    }

    if (effectiveRole === 'VENDEDOR') {
      const prof = getVendorProfile(user?.username || '');
      return {
        vendorFilter: (user?.username || '').toUpperCase().trim(),
        allowedAliases: prof.routes.flatMap(r => [r.id, ...r.aliases, prof.canonicalUsername, prof.displayName])
      };
    }

    // ADMIN
    if (!rawUpper || rawUpper === 'ADMIN' || rawUpper === 'TODOS' || rawUpper === 'ALL_MY_ROUTES') {
      return { vendorFilter: null, allowedAliases: [] as string[] };
    }
    if (rawUpper.startsWith('SUPERVISOR:')) {
      const supName = rawUpper.slice('SUPERVISOR:'.length).trim();
      return {
        vendorFilter: rawUpper,
        allowedAliases: getSupervisedAliases(supName)
      };
    }
    const cleanParam = rawUpper.replace(/^CONSOLIDATED:/i, '').trim();
    const prof = getVendorProfile(cleanParam);
    return {
      vendorFilter: cleanParam,
      allowedAliases: prof.routes.flatMap(r => [r.id, ...r.aliases, prof.canonicalUsername, prof.displayName])
    };
  };

  app.get("/api/data/volumen", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user;
      const force = req.query.force === 'true';
      const { vendorFilter, allowedAliases } = resolveDataFilter(user, req.query.vendedor);

      const filterByVendor = (list: any[]) => {
        const nonSupervisorList = list.filter(d => !SUPERVISOR_SUMMARY_COLUMNS.has(String(d.vendedorId || '').toUpperCase().trim()));
        if (!vendorFilter || vendorFilter === 'ADMIN' || vendorFilter === 'TODOS') return nonSupervisorList;
        return nonSupervisorList.filter(d => {
          const vNombre = (d.vendedorNombre || '').toUpperCase();
          const vId = (d.vendedorId || '').toUpperCase();
          if (matchesVendorAlias([vendorFilter, ...allowedAliases], vId) || matchesVendorAlias([vendorFilter, ...allowedAliases], vNombre)) {
            return true;
          }
          if (vendorFilter && !vendorFilter.startsWith('SUPERVISOR:') && !/^\d+$/.test(vendorFilter)) {
            if (vNombre.includes(vendorFilter) || vId.includes(vendorFilter)) return true;
          }
          return allowedAliases.some(a => {
            const aU = a.toUpperCase();
            return vNombre.includes(aU) || vId.includes(aU) || aU.includes(vNombre) || aU.includes(vId);
          });
        });
      };

      if (!force && cachedVolumenParsed && (Date.now() - lastVolumenParsedTime < PARSED_DATA_TTL)) {
        return res.json(filterByVendor(cachedVolumenParsed));
      }

      if (!force && supabase) {
        try {
          let supaRows: any[] = [];
          let from = 0;
          const pageSize = 1000;
          while (from < 10000) {
            const { data, error } = await supabase.from('ventas_volumen').select('*').eq('periodo', metasPeriodoActual()).order('id').range(from, from + pageSize - 1);
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
            cachedVolumenParsed = mapped;
            lastVolumenParsedTime = Date.now();
            return res.json(filterByVendor(mapped));
          }
        } catch (e) {}
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
            if (c >= 89 || SUPERVISOR_SUMMARY_COLUMNS.has(vendorName.toUpperCase())) continue;
            
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
      const { vendorFilter, allowedAliases } = resolveDataFilter(user, req.query.vendedor);

      const filterByVendor = (list: any[]) => {
        if (!vendorFilter || vendorFilter === 'ADMIN' || vendorFilter === 'TODOS') return list;
        return list.filter(d => {
          const vNombre = (d.vendedorNombre || '').toUpperCase();
          const vId = (d.vendedorId || '').toUpperCase();
          if (matchesVendorAlias([vendorFilter, ...allowedAliases], vId) || matchesVendorAlias([vendorFilter, ...allowedAliases], vNombre)) {
            return true;
          }
          if (vendorFilter && !vendorFilter.startsWith('SUPERVISOR:') && !/^\d+$/.test(vendorFilter)) {
            if (vNombre.includes(vendorFilter) || vId.includes(vendorFilter)) return true;
          }
          return allowedAliases.some(a => {
            const aU = a.toUpperCase();
            return vNombre.includes(aU) || vId.includes(aU) || aU.includes(vNombre) || aU.includes(vId);
          });
        });
      };

      if (!force && cachedActivacionParsed && (Date.now() - lastActivacionParsedTime < PARSED_DATA_TTL)) {
        return res.json(filterByVendor(cachedActivacionParsed));
      }

      if (!force && supabase) {
        try {
          let supaRows: any[] = [];
          let from = 0;
          const pageSize = 1000;
          while (from < 10000) {
            const { data, error } = await supabase.from('activacion_clientes').select('*').range(from, from + pageSize - 1);
            if (error || !data || data.length === 0) break;
            supaRows.push(...data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
          if (Array.isArray(supaRows) && supaRows.length > 0) {
            const byClientMap = new Map<string, any>();
            for (const r of supaRows) {
              const cid = String(r.cliente_codigo || '').trim();
              if (!cid) continue;
              const hasAceite = Boolean(r.has_aceite) || (Number(r.cajas_aceite) || 0) > 0;
              const hasAzucar = Boolean(r.has_azucar) || (Number(r.cajas_azucar) || 0) > 0;
              const hasPollo = Boolean(r.has_pollo) || (Number(r.cajas_pollo) || 0) > 0;
              const hasAsturias = Boolean(r.has_estandar_asturias) || (Number(r.cajas_estandar_asturias) || 0) > 0;
              const hasSalpicao = Boolean(r.has_mortadela_salpicao) || (Number(r.cajas_mortadela_salpicao) || 0) > 0;

              if (!byClientMap.has(cid)) {
                byClientMap.set(cid, {
                  id: cid,
                  cliente: r.cliente_nombre,
                  vendedorId: r.vendedor_id,
                  vendedorNombre: r.vendedor_nombre,
                  status: (hasAceite || hasAzucar || hasPollo || hasAsturias || hasSalpicao || r.status === 'ACTIVO') ? 'ACTIVO' : 'INACTIVO',
                  cajas: {
                    ACEITE: Number(r.cajas_aceite) || 0,
                    AZUCAR: Number(r.cajas_azucar) || 0,
                    POLLO: Number(r.cajas_pollo) || 0,
                    ESTANDAR_ASTURIAS: Number(r.cajas_estandar_asturias) || 0,
                    MORTADELA_SALPICAO: Number(r.cajas_mortadela_salpicao) || 0
                  },
                  cats: {
                    ACEITE: hasAceite,
                    AZUCAR: hasAzucar,
                    POLLO: hasPollo,
                    ESTANDAR_ASTURIAS: hasAsturias,
                    MORTADELA_SALPICAO: hasSalpicao
                  }
                });
              } else {
                const prev = byClientMap.get(cid);
                prev.cats.ACEITE = prev.cats.ACEITE || hasAceite;
                prev.cats.AZUCAR = prev.cats.AZUCAR || hasAzucar;
                prev.cats.POLLO = prev.cats.POLLO || hasPollo;
                prev.cats.ESTANDAR_ASTURIAS = prev.cats.ESTANDAR_ASTURIAS || hasAsturias;
                prev.cats.MORTADELA_SALPICAO = prev.cats.MORTADELA_SALPICAO || hasSalpicao;
                prev.cajas.ACEITE = Math.max(prev.cajas.ACEITE, Number(r.cajas_aceite) || 0);
                prev.cajas.AZUCAR = Math.max(prev.cajas.AZUCAR, Number(r.cajas_azucar) || 0);
                prev.cajas.POLLO = Math.max(prev.cajas.POLLO, Number(r.cajas_pollo) || 0);
                prev.cajas.ESTANDAR_ASTURIAS = Math.max(prev.cajas.ESTANDAR_ASTURIAS, Number(r.cajas_estandar_asturias) || 0);
                prev.cajas.MORTADELA_SALPICAO = Math.max(prev.cajas.MORTADELA_SALPICAO, Number(r.cajas_mortadela_salpicao) || 0);
                if (prev.cats.ACEITE || prev.cats.AZUCAR || prev.cats.POLLO || prev.cats.ESTANDAR_ASTURIAS || prev.cats.MORTADELA_SALPICAO) {
                  prev.status = 'ACTIVO';
                }
              }
            }
            const mapped = Array.from(byClientMap.values());
            cachedActivacionParsed = mapped;
            lastActivacionParsedTime = Date.now();
            return res.json(filterByVendor(mapped));
          }
        } catch (e) {}
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

      let activacionData: any[] = [];
      const clientSheet = workbook.Sheets['Activación por Cliente'];
      if (clientSheet) {
        const clientJson = XLSX.utils.sheet_to_json(clientSheet, { header: 1 });
        for (let i = 1; i < clientJson.length; i++) {
          const row = clientJson[i] as any[];
          if (!row || row.length < 3 || !row[0]) continue;
          
          const codigo = String(row[0]).trim();
          const cleanCodigo = codigo.replace(/^0+/, '') || codigo;
          const razonSocial = String(row[1] || '').trim();
          const vendedor = String(row[2] || '').replace(/\s+/g, ' ').trim();
          if (vendedor.toUpperCase() === 'ALI PEREZ') continue;
          
          const cAceite = mapAceite.get(codigo) || mapAceite.get(cleanCodigo) || 0;
          const cAzucar = mapAzucar.get(codigo) || mapAzucar.get(cleanCodigo) || 0;
          const cPollo = mapPollo.get(codigo) || mapPollo.get(cleanCodigo) || 0;
          const cAsturias = mapAsturias.get(codigo) || mapAsturias.get(cleanCodigo) || 0;
          const cSalpicao = mapSalpicao.get(codigo) || mapSalpicao.get(cleanCodigo) || 0;

          const hasAceite = cAceite > 0 || Boolean(row[3] && String(row[3]).trim().toUpperCase() === 'SI');
          const hasAzucar = cAzucar > 0 || Boolean(row[4] && String(row[4]).trim().toUpperCase() === 'SI');
          const hasPollo = cPollo > 0 || Boolean(row[5] && String(row[5]).trim().toUpperCase() === 'SI');
          const hasAsturias = cAsturias > 0 || Boolean(row[6] && String(row[6]).trim().toUpperCase() === 'SI');
          const hasSalpicao = cSalpicao > 0 || Boolean(row[7] && String(row[7]).trim().toUpperCase() === 'SI');

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
              ACEITE: hasAceite,
              AZUCAR: hasAzucar,
              POLLO: hasPollo,
              ESTANDAR_ASTURIAS: hasAsturias,
              MORTADELA_SALPICAO: hasSalpicao,
              ARROZ: hasPollo,
              ENTERO: hasAsturias,
              LIGEROS: hasSalpicao,
            },
            cajas: {
              ACEITE: cAceite,
              AZUCAR: cAzucar,
              POLLO: cPollo,
              ESTANDAR_ASTURIAS: cAsturias,
              MORTADELA_SALPICAO: cSalpicao,
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

  app.post("/api/data/activacion/toggle-rubro", authenticateToken, async (req: any, res: any) => {
    try {
      const { clienteCodigo, rubro, active } = req.body || {};
      const cleanCod = String(clienteCodigo || '').replace(/^[#\s]+/, '').trim();
      const normRubro = normalizeHistRubroCode(rubro);
      if (!cleanCod || !normRubro) {
        return res.status(400).json({ error: "clienteCodigo y rubro son requeridos" });
      }
      const boolActive = Boolean(active);

      const colMap: Record<string, string> = {
        ACEITE: 'has_aceite',
        AZUCAR: 'has_azucar',
        POLLO: 'has_pollo',
        ESTANDAR_ASTURIAS: 'has_estandar_asturias',
        MORTADELA_SALPICAO: 'has_mortadela_salpicao',
      };
      const dbCol = colMap[normRubro];

      if (supabase && dbCol) {
        const { data: rows } = await supabase
          .from('activacion_clientes')
          .select('*')
          .eq('cliente_codigo', cleanCod);

        if (Array.isArray(rows) && rows.length > 0) {
          for (const r of rows) {
            const nextState = {
              has_aceite: normRubro === 'ACEITE' ? boolActive : Boolean(r.has_aceite),
              has_azucar: normRubro === 'AZUCAR' ? boolActive : Boolean(r.has_azucar),
              has_pollo: normRubro === 'POLLO' ? boolActive : Boolean(r.has_pollo),
              has_estandar_asturias: normRubro === 'ESTANDAR_ASTURIAS' ? boolActive : Boolean(r.has_estandar_asturias),
              has_mortadela_salpicao: normRubro === 'MORTADELA_SALPICAO' ? boolActive : Boolean(r.has_mortadela_salpicao),
            };
            const isActivo = Object.values(nextState).some(Boolean);
            await supabase
              .from('activacion_clientes')
              .update({
                ...nextState,
                status: isActivo ? 'ACTIVO' : 'INACTIVO',
              })
              .eq('id', r.id);
          }
        }
      }

      if (cachedActivacionParsed && Array.isArray(cachedActivacionParsed)) {
        cachedActivacionParsed.forEach((c: any) => {
          const cid = String(c.id || '').replace(/^[#\s]+/, '').trim();
          if (cid === cleanCod) {
            if (!c.cats) c.cats = {};
            c.cats[normRubro] = boolActive;
            const anyActive = Boolean(
              c.cats.ACEITE || c.cats.AZUCAR || c.cats.POLLO || c.cats.ESTANDAR_ASTURIAS || c.cats.MORTADELA_SALPICAO
            );
            c.status = anyActive ? 'ACTIVO' : 'INACTIVO';
          }
        });
      }

      return res.json({ success: true, clienteCodigo: cleanCod, rubro: normRubro, active: boolActive });
    } catch (err: any) {
      console.error("[SERVER] Error en /api/data/activacion/toggle-rubro:", err);
      return res.status(500).json({ error: "Error actualizando rubro del cliente", details: err?.message });
    }
  });

  app.get("/api/data/metas-activacion", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user;
      const force = req.query.force === 'true';
      const { vendorFilter, allowedAliases } = resolveDataFilter(user, req.query.vendedor);

      const filterByVendor = (list: any[]) => {
        if (!vendorFilter || vendorFilter === 'ADMIN' || vendorFilter === 'TODOS') return list;
        return list.filter(d => {
          const vId = (d.vendedorId || '').toUpperCase();
          if (matchesVendorAlias([vendorFilter, ...allowedAliases], vId)) {
            return true;
          }
          if (vendorFilter && !vendorFilter.startsWith('SUPERVISOR:') && !/^\d+$/.test(vendorFilter)) {
            if (vId.includes(vendorFilter) || vendorFilter.includes(vId)) return true;
          }
          return allowedAliases.some(a => {
            const aU = a.toUpperCase();
            return vId.includes(aU) || aU.includes(vId);
          });
        });
      };

      if (!force && cachedMetasParsed && (Date.now() - lastMetasParsedTime < PARSED_DATA_TTL)) {
        return res.json(filterByVendor(cachedMetasParsed));
      }

      if (!force && supabase) {
        try {
          const { data, error } = await supabase.from('metas_activacion').select('*').eq('periodo', metasPeriodoActual());
          if (!error && data && data.length > 0) {
            const mapped = data.map((r: any) => ({
              vendedorId: r.vendedor_id,
              categoria: r.categoria,
              meta: Number(r.meta) || 0,
              activados: Number(r.activados) || 0
            }));
            cachedMetasParsed = mapped;
            lastMetasParsedTime = Date.now();
            return res.json(filterByVendor(mapped));
          }
        } catch (e) {}
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

  // Almacén temporal en memoria para comprobantes compartidos desde WhatsApp (soporta archivos de hasta 10MB+ sin romper localStorage)
  const sharedReceiptsMemoryStore = new Map<string, {
    dataUrl: string;
    name: string;
    type: string;
    size: number;
    timestamp: number;
  }>();

  app.get('/api/shared-receipt-temp/:id', (req: any, res: any) => {
    const id = String(req.params.id || '').trim();
    const entry = sharedReceiptsMemoryStore.get(id);
    if (!entry) {
      return res.status(404).json({ error: 'Comprobante temporal expirado o ya consumido' });
    }
    sharedReceiptsMemoryStore.delete(id);
    return res.json(entry);
  });

  // Fallback Web Share Target endpoint (en caso de que el navegador envíe el POST directo al servidor antes de que el Service Worker lo intercepte)
  app.post('/share-target-cobro', express.raw({ type: '*/*', limit: '25mb' }), (req: any, res: any) => {
    try {
      const contentType = String(req.headers['content-type'] || '');
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

      let dataUrl = '';
      let fileName = 'soporte_whatsapp.jpg';
      let mimeType = 'image/jpeg';
      let fileSize = 0;

      if (boundaryMatch && rawBody.length > 0) {
        const boundary = '--' + (boundaryMatch[1] || boundaryMatch[2]).trim();
        const latin = rawBody.toString('latin1');
        const parts = latin.split(boundary);
        for (const part of parts) {
          if (part.includes('filename=')) {
            const fnMatch = part.match(/filename="([^"]+)"/i);
            const ctMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
            const headerEnd = part.indexOf('\r\n\r\n');
            if (headerEnd !== -1) {
              if (fnMatch && fnMatch[1]) fileName = fnMatch[1];
              if (ctMatch && ctMatch[1]) mimeType = ctMatch[1].trim();
              let bodyLatin = part.slice(headerEnd + 4);
              if (bodyLatin.endsWith('\r\n')) bodyLatin = bodyLatin.slice(0, -2);
              const fileBuf = Buffer.from(bodyLatin, 'latin1');
              if (fileBuf.length > 0) {
                fileSize = fileBuf.length;
                const lowerFn = fileName.toLowerCase();
                if (lowerFn.endsWith('.pdf') || fileBuf.subarray(0, 4).toString('ascii') === '%PDF') {
                  mimeType = 'application/pdf';
                } else if (lowerFn.endsWith('.png')) {
                  mimeType = 'image/png';
                } else if (lowerFn.endsWith('.webp')) {
                  mimeType = 'image/webp';
                } else if (lowerFn.endsWith('.heic') || lowerFn.endsWith('.heif')) {
                  mimeType = 'image/heic';
                } else if (!mimeType || mimeType === 'application/octet-stream') {
                  mimeType = 'image/jpeg';
                }
                dataUrl = `data:${mimeType};base64,${fileBuf.toString('base64')}`;
                break;
              }
            }
          }
        }
      }

      const tempReceiptId = `rcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (dataUrl) {
        // Limpiar entradas antiguas (> 10 min)
        const now = Date.now();
        for (const [k, v] of sharedReceiptsMemoryStore.entries()) {
          if (now - v.timestamp > 10 * 60 * 1000) sharedReceiptsMemoryStore.delete(k);
        }
        sharedReceiptsMemoryStore.set(tempReceiptId, {
          dataUrl,
          name: fileName,
          type: mimeType,
          size: fileSize,
          timestamp: now,
        });
      }

      const payloadJson = JSON.stringify({
        dataUrl,
        name: fileName,
        type: mimeType,
        size: fileSize,
        receiptId: tempReceiptId,
        timestamp: Date.now(),
      });

      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibiendo comprobante de WhatsApp...</title></head>
<body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;gap:12px">
<div style="width:32px;height:32px;border:3px solid #10b981;border-top-color:transparent;border-radius:50%;animation:s 0.8s linear infinite"></div>
<style>@keyframes s{to{transform:rotate(360deg)}}</style>
<div style="font-size:14px;font-weight:bold;color:#10b981">Procesando soporte desde WhatsApp...</div>
<script>
(async function() {
  var payload = ${payloadJson};
  var targetUrl = '/?shared-receipt=1&receiptId=' + encodeURIComponent(payload.receiptId || '') + '#cobros';
  try {
    sessionStorage.setItem('fdv_pending_whatsapp_share', '1');
    if (payload.receiptId) {
      sessionStorage.setItem('fdv_shared_receipt_id', payload.receiptId);
    }
  } catch (e) {}

  try {
    if (payload && payload.dataUrl && payload.dataUrl.length < 3500000) {
      localStorage.setItem('fdv_shared_whatsapp_payload', JSON.stringify(payload));
    }
  } catch (e) {}

  try {
    if (payload && payload.dataUrl && window.indexedDB) {
      var res = await fetch(payload.dataUrl);
      var blob = await res.blob();
      await new Promise(function(resolve) {
        var req = indexedDB.open('fdv_whatsapp_share_db', 1);
        req.onupgradeneeded = function() {
          var db = req.result;
          if (!db.objectStoreNames.contains('shared_receipts')) {
            db.createObjectStore('shared_receipts', { keyPath: 'id' });
          }
        };
        req.onsuccess = function() {
          try {
            var db = req.result;
            var tx = db.transaction('shared_receipts', 'readwrite');
            tx.objectStore('shared_receipts').put({
              id: 'latest_shared_receipt',
              blob: blob,
              name: payload.name || 'soporte_whatsapp.jpg',
              type: payload.type || blob.type || 'image/jpeg',
              size: payload.size || blob.size || 0,
              timestamp: Date.now()
            });
            tx.oncomplete = function() { db.close(); resolve(true); };
            tx.onerror = function() { db.close(); resolve(false); };
          } catch (err) { resolve(false); }
        };
        req.onerror = function() { resolve(false); };
      });
    }
  } catch (e) {}

  window.location.replace(targetUrl);
})();
</script>
</body></html>`);
    } catch (err) {
      console.error('[SHARE TARGET] Error procesando archivo compartido:', err);
      res.redirect(303, '/?shared-receipt=error#cobros');
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
