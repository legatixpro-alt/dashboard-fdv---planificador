import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query,
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AlkostoOrder, EstadoPedidoAlkosto, AlkostoOrderItem, ParsedOrdenCompraAlkosto } from '../types';
import { getAuthHeaders } from './authService';

export const ALKOSTO_COLLECTION = 'alkosto_orders';
const STORAGE_KEY = 'dashboard_fdv_alkosto_orders_cache';

export interface AlkostoSucursal {
  codigo: string;
  razonSocial: string;
  tag?: string;
  nombre: string;
  zona: string;
  direccion: string;
  contacto?: string;
  telefono?: string;
}

export const SUCURSALES_ALKOSTO: AlkostoSucursal[] = [
  { codigo: '001560', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AKOP', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.' },
  { codigo: '007497', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK01', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (AV DELICIAS)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (AV DELICIAS)' },
  { codigo: '007498', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK02', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (SAN FELIPE)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (SAN FELIPE)' },
  { codigo: '007499', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK03', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (PLAZA BARALT)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (PLAZA BARALT)' },
  { codigo: '007500', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK04', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LA COROMOTO)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LA COROMOTO)' },
  { codigo: '007501', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK05', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (DR. PORTILLO)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (DR. PORTILLO)' },
  { codigo: '007502', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK06', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (CABIMAS)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (CABIMAS)' },
  { codigo: '007503', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK07', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LOS CACTUS)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LOS CACTUS)' },
  { codigo: '007680', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK08', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.' },
  { codigo: '007905', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK09', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (TRUJILLO)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (TRUJILLO)' },
  { codigo: '008160', razonSocial: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', tag: 'AK10', nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (ZONA INDUSTRIAL)', zona: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.', direccion: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (ZONA INDUSTRIAL)' }
];

export const SUCURSALES_FAMILIA_CENTER: AlkostoSucursal[] = [
  { codigo: '005373', razonSocial: 'FAMILIA CENTER, C.A', tag: 'FCOP', nombre: 'FAMILIA CENTER, C.A', zona: 'FAMILIA CENTER, C.A', direccion: 'FAMILIA CENTER, C.A' },
  { codigo: '007489', razonSocial: 'FAMILIA CENTER, C.A', tag: 'FC01', nombre: 'FAMILIA CENTER, C.A (LA LAGO)', zona: 'FAMILIA CENTER, C.A', direccion: 'FAMILIA CENTER, C.A (LA LAGO)' },
  { codigo: '007490', razonSocial: 'FAMILIA CENTER, C.A', tag: 'FC02', nombre: 'FAMILIA CENTER, C.A  (CENTRO PLAZA LAGO)', zona: 'FAMILIA CENTER, C.A', direccion: 'FAMILIA CENTER, C.A  (CENTRO PLAZA LAGO)' },
  { codigo: '007491', razonSocial: 'FAMILIA CENTER, C.A', tag: 'FC03', nombre: 'FAMILIA CENTER, C.A (5 DE JULIO)', zona: 'FAMILIA CENTER, C.A', direccion: 'FAMILIA CENTER, C.A (5 DE JULIO)' },
  { codigo: '007492', razonSocial: 'FAMILIA CENTER, C.A', tag: 'FC04', nombre: 'FAMILIA CENTER, C.A (URB MONTE CLARO)', zona: 'FAMILIA CENTER, C.A', direccion: 'FAMILIA CENTER, C.A (URB MONTE CLARO)' },
  { codigo: '007493', razonSocial: 'FAMILIA CENTER, C.A', tag: 'FC05', nombre: 'FAMILIA CENTER, C.A (LOS OLIVOS)', zona: 'FAMILIA CENTER, C.A', direccion: 'FAMILIA CENTER, C.A (LOS OLIVOS)' },
  { codigo: '007494', razonSocial: 'FAMILIA CENTER, C.A.', tag: 'FC06', nombre: 'FAMILIA CENTER, C.A.', zona: 'FAMILIA CENTER, C.A.', direccion: 'FAMILIA CENTER, C.A.' },
  { codigo: '008144', razonSocial: 'FAMILIA CENTER, C.A.', tag: 'FC08', nombre: 'FAMILIA CENTER, C.A. (PANIFICADORAS)', zona: 'FAMILIA CENTER, C.A.', direccion: 'FAMILIA CENTER, C.A. (PANIFICADORAS)' },
  { codigo: '008229', razonSocial: 'FAMILIA CENTER, C.A.', tag: 'FC07', nombre: 'FAMILIA CENTER, C.A. ( SAN FRANCISCO)', zona: 'FAMILIA CENTER, C.A.', direccion: 'FAMILIA CENTER, C.A. ( SAN FRANCISCO)' }
];

export const CADENAS_ABREVIATURAS = {
  ALKOSTO: ['AK01', 'AK02', 'AK03', 'AK04', 'AK05', 'AK06', 'AK07', 'AK08', 'AK09', 'AK10'],
  FAMILIA_CENTER: ['FC01', 'FC02', 'FC03', 'FC04', 'FC05', 'FC06', 'FC07', 'FC08']
};

export const TODAS_SUCURSALES_CUENTAS_CLAVE: AlkostoSucursal[] = [
  ...SUCURSALES_ALKOSTO,
  ...SUCURSALES_FAMILIA_CENTER
];

export function getSucursalByTag(tag: string): AlkostoSucursal | undefined {
  const norm = (tag || '').trim().toUpperCase();
  if (!norm) return undefined;
  const cleanDigits = norm.replace(/^0+/, '');
  return TODAS_SUCURSALES_CUENTAS_CLAVE.find(
    s => s.tag === norm || s.codigo === norm || (cleanDigits && s.codigo.replace(/^0+/, '') === cleanDigits)
  );
}

export function detectCadenaFromTagOrName(value: string): 'ALKOSTO' | 'FAMILIA_CENTER' {
  const norm = (value || '').trim().toUpperCase();
  if (norm.includes('FC') || norm.includes('FAMILIA')) return 'FAMILIA_CENTER';
  return 'ALKOSTO';
}

export async function syncCadenasConfigToFirestore(): Promise<void> {
  try {
    const configDoc = {
      alkosto: SUCURSALES_ALKOSTO,
      familiaCenter: SUCURSALES_FAMILIA_CENTER,
      abreviaturasAlkosto: CADENAS_ABREVIATURAS.ALKOSTO,
      abreviaturasFamiliaCenter: CADENAS_ABREVIATURAS.FAMILIA_CENTER,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'cadenas_config', 'abreviaturas'), configDoc, { merge: true });
    localStorage.setItem('dashboard_fdv_cadenas_config', JSON.stringify(configDoc));
  } catch (err) {
    console.warn("Error sincronizando abreviaturas de cadenas en Firestore:", err);
  }
}

export interface CatalogoAlkostoItem {
  sku: string;
  producto: string;
  categoria: string;
  presentacion: string;
  kilosPorCaja: number;
  precioSugeridoUSD: number;
  codigoBarra?: string;
  codigosCadena?: string[];
  sinonimos?: string[];
  unidadSugerida?: 'CJ' | 'KG' | 'UND' | 'BLT';
}

export const CATALOGO_ALKOSTO: CatalogoAlkostoItem[] = [
  // --- MORTADELAS Y EMBUTIDOS ASTURIAS / SALPICAO / CORRAL ---
  {
    sku: '1496',
    producto: 'MORTADELA ESP D/POLLO ASTURIAS 10UNDX900GR',
    categoria: 'MORTADELAS',
    presentacion: 'Caja (10 und x 900g)',
    kilosPorCaja: 9.0,
    precioSugeridoUSD: 24.50,
    codigoBarra: '7590377000077',
    codigosCadena: ['1461', '1496', '7590377000077'],
    sinonimos: ['MORTADELA ESPECIAL DE POLLO 900GR ASTURIAS', 'MORTADELA 900GR ASTURIAS', 'MORTADELA ASTURIAS 10X900', '1496', '1461'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '1519',
    producto: 'MORTADELA ESP D/POLLO SALPICAO 10UNDX900GR',
    categoria: 'MORTADELAS',
    presentacion: 'Caja (10 und x 900g)',
    kilosPorCaja: 9.0,
    precioSugeridoUSD: 23.00,
    codigosCadena: ['1462', '1519'],
    sinonimos: ['MORTADELA ESPECIAL DE POLLO SALPICAO 10UNDX900GR', 'SALPICAO 10X900', '1519', '1462'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '21',
    producto: 'MORTADELA ESP D/POLLO CORRAL 1X12UNI',
    categoria: 'MORTADELAS',
    presentacion: 'Caja (12 und x 900g)',
    kilosPorCaja: 10.8,
    precioSugeridoUSD: 27.50,
    codigosCadena: ['21', '1463'],
    sinonimos: ['MORTADELA CORRAL 1X12', 'MORTADELA CORRAL 12UNI', '21'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '1464',
    producto: 'MORT. NAVIDEÑA ASTURIAS XKG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~12 kg)',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 36.00,
    codigosCadena: ['1464'],
    sinonimos: ['MORTADELA NAVIDEÑA ASTURIAS', 'NAVIDEÑA ASTURIAS', '1464'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1461',
    producto: 'MORT. ESTANDAR ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 25.00,
    codigosCadena: ['1461'],
    sinonimos: ['MORTADELA ESTANDAR ASTURIAS', 'ESTANDAR ASTURIAS', '1461'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1462',
    producto: 'MORT. ESPECIAL COCIDA ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 26.00,
    codigosCadena: ['1462'],
    sinonimos: ['MORTADELA ESPECIAL COCIDA ASTURIAS', '1462'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1463',
    producto: 'MORT. SUPERIOR ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~12 kg)',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 28.00,
    codigosCadena: ['1463', '100929'],
    sinonimos: ['MORTADELA SUPERIOR ASTURIAS', '1463'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1512',
    producto: 'MORT. PECHUGA DE PAVO ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 55.00,
    codigosCadena: ['100881', '1512'],
    sinonimos: ['PECHUGA DE PAVO ASTURIAS X KG', 'PECHUGA PAVO ASTURIAS', '100881', '1512'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1511',
    producto: 'MORT. PECHUGA DE POLLO ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 53.50,
    codigosCadena: ['100882', '1511'],
    sinonimos: ['PECHUGA DE POLLO ASTURIAS X KG', 'PECHUGA POLLO ASTURIAS', '100882', '1511'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1561',
    producto: 'MORT. PAVO TIPO SHOULDER ASTURIAS POR KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~12 kg)',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 48.00,
    codigosCadena: ['1561'],
    sinonimos: ['SHOULDER ASTURIAS', '1561'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1521',
    producto: 'MORT. ECONOM COCIDA ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 22.00,
    codigosCadena: ['1521'],
    sinonimos: ['ECONOMICA ASTURIAS', '1521'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1522',
    producto: 'MORT. TIPO AREPERO ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 23.50,
    codigosCadena: ['1522'],
    sinonimos: ['AREPERO ASTURIAS', '1522'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1564',
    producto: 'MORTADELA EXTRA ASTURIAS X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 25.50,
    codigosCadena: ['1564'],
    sinonimos: ['EXTRA ASTURIAS', '1564'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1563',
    producto: 'MORT. ESTANDAR SALPICAO X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 24.00,
    codigosCadena: ['1563'],
    sinonimos: ['ESTANDAR SALPICAO', '1563'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1562',
    producto: 'MORT. ESPECIAL COCIDA SALPICAO X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 25.00,
    codigosCadena: ['1562'],
    sinonimos: ['ESPECIAL SALPICAO', '1562'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1599',
    producto: 'MORT. NAVIDEÑA SALPICAO X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~12 kg)',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 34.00,
    codigosCadena: ['1599'],
    sinonimos: ['NAVIDEÑA SALPICAO', '1599'],
    unidadSugerida: 'KG'
  },
  {
    sku: '927',
    producto: 'MORTADELA ESP. CARACAS 10X900GRS',
    categoria: 'MORTADELAS',
    presentacion: 'Caja (10 und x 900g)',
    kilosPorCaja: 9.0,
    precioSugeridoUSD: 23.00,
    codigosCadena: ['927'],
    sinonimos: ['CARACAS 900', '927'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '1051',
    producto: 'MORTADELA ESP. CARACAS 10X500GRS',
    categoria: 'MORTADELAS',
    presentacion: 'Caja (10 und x 500g)',
    kilosPorCaja: 5.0,
    precioSugeridoUSD: 14.00,
    codigosCadena: ['1051'],
    sinonimos: ['CARACAS 500', '1051'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '1242',
    producto: 'MORT. CHORIZO ESPECIAL CDZ X KG',
    categoria: 'MORTADELAS',
    presentacion: 'Pieza por Kg (Caja ~10 kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 28.00,
    codigosCadena: ['1242'],
    sinonimos: ['CHORIZO ESPECIAL', '1242'],
    unidadSugerida: 'KG'
  },

  // --- CARNES, CHULETAS Y TOCINO ---
  {
    sku: '1446',
    producto: 'CHULETA FRESCA ASTURIAS POR KG',
    categoria: 'CARNES / CHULETA',
    presentacion: 'Caja ~15 kg al vacío',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 72.00,
    codigosCadena: ['1446'],
    sinonimos: ['CHULETA FRESCA ASTURIAS', 'CHULETA ASTURIAS', '1446'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1088',
    producto: 'CHULETA FRESCA IBERICO POR KG',
    categoria: 'CARNES / CHULETA',
    presentacion: 'Caja ~15 kg al vacío',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 69.00,
    codigosCadena: ['1088'],
    sinonimos: ['CHULETA IBERICO', '1088'],
    unidadSugerida: 'KG'
  },
  {
    sku: '1445',
    producto: 'TOCINO FRESCO ASTURIAS X KG',
    categoria: 'CARNES / CHULETA',
    presentacion: 'Caja ~15 kg',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 45.00,
    codigosCadena: ['1445'],
    sinonimos: ['TOCINO FRESCO ASTURIAS', '1445'],
    unidadSugerida: 'KG'
  },
  {
    sku: '340',
    producto: 'CHULETA AHUMADA ALIMEX X KG',
    categoria: 'CARNES / CHULETA',
    presentacion: 'Caja ~12 kg',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 65.00,
    codigosCadena: ['340'],
    sinonimos: ['CHULETA AHUMADA ALIMEX', '340'],
    unidadSugerida: 'KG'
  },

  // --- JAMONES, ESPALDAS Y SALCHICHAS ALIMEX / ITALICO ---
  {
    sku: '171',
    producto: 'JAMON COC. SUPERIOR ALIMEX 1X5.9KG',
    categoria: 'JAMONES',
    presentacion: 'Pieza (Barra ~5.9 kg)',
    kilosPorCaja: 11.8,
    precioSugeridoUSD: 68.00,
    codigosCadena: ['171', '100929'],
    sinonimos: ['JAMON COCIDO SUPERIOR ASTURIAS / ALIMEX', 'JAMON COCIDO DE PAVO AHUMADO SUPERIOR ASTURIAS', 'JAMON SUPERIOR ALIMEX', '171'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '172',
    producto: 'ESPALDA COCIDA ALIMEX 1X4.6KG',
    categoria: 'JAMONES',
    presentacion: 'Pieza (Barra ~4.6 kg)',
    kilosPorCaja: 9.2,
    precioSugeridoUSD: 54.00,
    codigosCadena: ['172'],
    sinonimos: ['ESPALDA COCIDA ALIMEX', 'ESPALDA ALIMEX', '172'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '241',
    producto: 'ESPAL. AHUM T/VISKING ALIMEX 6X3.2',
    categoria: 'JAMONES',
    presentacion: 'Caja (6 und x 3.2 kg)',
    kilosPorCaja: 19.2,
    precioSugeridoUSD: 98.00,
    codigosCadena: ['241'],
    sinonimos: ['VISKING ALIMEX', 'ESPALDA VISKING', '241'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '439',
    producto: 'ESPAL AHUM.T/AREPERO ALIMEX 12X1,6KG',
    categoria: 'JAMONES',
    presentacion: 'Caja (12 und x 1.6 kg)',
    kilosPorCaja: 19.2,
    precioSugeridoUSD: 95.00,
    codigosCadena: ['439'],
    sinonimos: ['AREPERO ALIMEX', '439'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '995',
    producto: 'ESPAL. AHUM T/VISKING ITALICO 6UNDX3.2KG',
    categoria: 'JAMONES',
    presentacion: 'Caja (6 und x 3.2 kg)',
    kilosPorCaja: 19.2,
    precioSugeridoUSD: 92.00,
    codigosCadena: ['995'],
    sinonimos: ['VISKING ITALICO', '995'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '337',
    producto: 'JAMON COCIDO ESTANDAR ITALICO X KG',
    categoria: 'JAMONES',
    presentacion: 'Pieza por Kg (Caja ~12 kg)',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 52.00,
    codigosCadena: ['337'],
    sinonimos: ['JAMON ITALICO', '337'],
    unidadSugerida: 'KG'
  },
  {
    sku: '170',
    producto: 'TOCINETA AHUM S/CUERO ALIMEX X KG',
    categoria: 'JAMONES',
    presentacion: 'Caja ~10 kg',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 58.00,
    codigosCadena: ['170'],
    sinonimos: ['TOCINETA ALIMEX', '170'],
    unidadSugerida: 'KG'
  },
  {
    sku: '177',
    producto: 'SALCHICHA VIENA ALIMEX 16 X 450 GRS',
    categoria: 'JAMONES',
    presentacion: 'Caja (16 paq x 450g)',
    kilosPorCaja: 7.2,
    precioSugeridoUSD: 28.00,
    codigosCadena: ['177'],
    sinonimos: ['SALCHICHA VIENA 450', '177'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '176',
    producto: 'SALCHICHA VIENA ALIMEX 8 X 800 GRS',
    categoria: 'JAMONES',
    presentacion: 'Caja (8 paq x 800g)',
    kilosPorCaja: 6.4,
    precioSugeridoUSD: 25.00,
    codigosCadena: ['176'],
    sinonimos: ['SALCHICHA VIENA 800', '176'],
    unidadSugerida: 'CJ'
  },

  // --- BENEFICIO DE POLLO Y DESPRESADO ---
  {
    sku: '101',
    producto: 'POLLO BENEFICIADO ENTERO',
    categoria: 'POLLO',
    presentacion: 'Cesta / Caja ~20 kg',
    kilosPorCaja: 20.0,
    precioSugeridoUSD: 56.00,
    codigosCadena: ['101', 'POLLO'],
    sinonimos: ['POLLO ENTERO', 'POLLO TODAS LAS MARCAS', 'POLLO'],
    unidadSugerida: 'KG'
  },
  {
    sku: '103',
    producto: 'FILET VARIAS PRESENTACIONES',
    categoria: 'POLLO',
    presentacion: 'Caja 15 kg congelado',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 65.00,
    codigosCadena: ['103', 'FILET'],
    sinonimos: ['FILET DE POLLO', 'FILET PECHUGA', 'FILET'],
    unidadSugerida: 'KG'
  },
  {
    sku: '629',
    producto: 'MUSLO CUADRIL DESPRESADO POR KG',
    categoria: 'POLLO',
    presentacion: 'Caja 15 kg congelado',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 39.00,
    codigosCadena: ['629', '102', 'MUSLO'],
    sinonimos: ['MUSLO CUADRIL', 'MUSLO POLLO', 'MUSLO', '629'],
    unidadSugerida: 'KG'
  },
  {
    sku: '630',
    producto: 'ALAS DESPRESADAS POR KG',
    categoria: 'POLLO',
    presentacion: 'Caja 15 kg congelado',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 42.00,
    codigosCadena: ['630', 'ALAS'],
    sinonimos: ['ALAS DE POLLO', 'ALAS', '630'],
    unidadSugerida: 'KG'
  },
  {
    sku: '870',
    producto: 'HIGADO (EMPACADO)',
    categoria: 'POLLO',
    presentacion: 'Caja 15 kg congelado',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 25.00,
    codigosCadena: ['870'],
    sinonimos: ['HIGADO DE POLLO', 'HIGADO', '870'],
    unidadSugerida: 'KG'
  },
  {
    sku: '393',
    producto: 'MOLLEJA (EMPACADA)',
    categoria: 'POLLO',
    presentacion: 'Caja 15 kg congelado',
    kilosPorCaja: 15.0,
    precioSugeridoUSD: 28.00,
    codigosCadena: ['393'],
    sinonimos: ['MOLLEJAS', '393'],
    unidadSugerida: 'KG'
  },

  // --- VÍVERES, BÁSICOS Y LÁCTEOS ---
  {
    sku: 'QS',
    producto: 'QUESO AMARILLO',
    categoria: 'LACTEOS',
    presentacion: 'Barra ~3.5 kg (Caja 14 kg)',
    kilosPorCaja: 14.0,
    precioSugeridoUSD: 72.00,
    codigosCadena: ['QS', 'QUESO'],
    sinonimos: ['QUESO AMARILLO GOUDA', 'QUESO', 'QS'],
    unidadSugerida: 'KG'
  },
  {
    sku: '301',
    producto: 'ACEITE VEGETAL COMESTIBLE 12X1LT',
    categoria: 'BASICOS',
    presentacion: 'Caja (12 botellas x 1L)',
    kilosPorCaja: 11.0,
    precioSugeridoUSD: 26.50,
    codigosCadena: ['301', 'ACEITE'],
    sinonimos: ['ACEITE VEGETAL', 'ACEITE', '301'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '302',
    producto: 'AZUCAR REFINADA BLANCA 50KG',
    categoria: 'BASICOS',
    presentacion: 'Saco 50 kg',
    kilosPorCaja: 50.0,
    precioSugeridoUSD: 48.00,
    codigosCadena: ['302', 'AZUCAR'],
    sinonimos: ['AZUCAR 50KG', 'AZUCAR', '302'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '303',
    producto: 'ARROZ BLANCO ESPECIAL 24X1KG',
    categoria: 'BASICOS',
    presentacion: 'Bulto (24 paquetes x 1kg)',
    kilosPorCaja: 24.0,
    precioSugeridoUSD: 28.80,
    codigosCadena: ['303', 'ARROZ'],
    sinonimos: ['ARROZ 900GR', 'ARROZ 24X1KG', 'ARROZ', '303'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '401',
    producto: 'HUEVOS BLANCOS SELECCIONADOS',
    categoria: 'BASICOS',
    presentacion: 'Caja (12 cartones / 360 und)',
    kilosPorCaja: 22.0,
    precioSugeridoUSD: 45.00,
    codigosCadena: ['401', 'HUEVOS'],
    sinonimos: ['HUEVOS BLANCOS', 'HUEVOS', '401'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '1360',
    producto: 'PATATAS FRESCAS MARQUISE 4X2.5KG',
    categoria: 'CONGELADOS',
    presentacion: 'Caja (4 bolsas x 2.5kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 21.00,
    codigosCadena: ['1360', 'PATATAS'],
    sinonimos: ['PAPAS MARQUISE', 'PATATAS FRESCAS', '1360'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '1569',
    producto: 'PATATAS FRESCAS DOBLE COBERTURA 4X2.5KG',
    categoria: 'CONGELADOS',
    presentacion: 'Caja (4 bolsas x 2.5kg)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 23.50,
    codigosCadena: ['1569'],
    sinonimos: ['PAPAS DOBLE COBERTURA', '1569'],
    unidadSugerida: 'CJ'
  },
  {
    sku: 'UTH',
    producto: 'LECHE LIQUIDA UHT 12X1LT',
    categoria: 'LACTEOS',
    presentacion: 'Caja (12 litros)',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 18.00,
    codigosCadena: ['UTH', 'LECHE UTH'],
    sinonimos: ['LECHE UHT', 'LECHE LIQUIDA', 'UTH'],
    unidadSugerida: 'CJ'
  },
  {
    sku: 'LPV',
    producto: 'LECHE EN POLVO VENCAMPO',
    categoria: 'LACTEOS',
    presentacion: 'Bulto (12 x 1kg / 24 x 500g)',
    kilosPorCaja: 12.0,
    precioSugeridoUSD: 54.00,
    codigosCadena: ['LPV', 'LECHE EN POLVO'],
    sinonimos: ['LECHE VENCAMPO', 'LECHE EN POLVO', 'LPV'],
    unidadSugerida: 'CJ'
  },
  {
    sku: 'JUGOS',
    producto: 'JUGOS Y NECTAR VARIOS',
    categoria: 'BEBIDAS',
    presentacion: 'Caja (24 und x 250ml)',
    kilosPorCaja: 6.0,
    precioSugeridoUSD: 16.00,
    codigosCadena: ['JUGOS', 'BEBIDAS'],
    sinonimos: ['JUGOS Y NECTAR', 'JUGOS', 'BEBIDAS'],
    unidadSugerida: 'CJ'
  },
  {
    sku: '1572',
    producto: 'CAJAS DE PIZZA 1X100',
    categoria: 'EMPAQUES',
    presentacion: 'Bulto (100 unidades)',
    kilosPorCaja: 10.0,
    precioSugeridoUSD: 25.00,
    codigosCadena: ['1572'],
    sinonimos: ['CAJA PIZZA', '1572'],
    unidadSugerida: 'BLT'
  }
];

/**
 * Normaliza y limpia códigos de productos extraídos por OCR o ingresados por el usuario.
 */
export function normalizarCodigoProducto(codigo: string): string {
  if (!codigo) return '';
  return String(codigo).trim().replace(/[\s\-_.]/g, '');
}

/**
 * Resuelve y correlaciona de manera inteligente un código (sea SKU, código de barra EAN-13,
 * o código interno de cadena como Alkosto / Familia Center) o descripción contra el catálogo oficial.
 */
export function resolverProductoPorCodigoODescripcion(
  codigoInput?: string, 
  descripcionInput?: string
): CatalogoAlkostoItem | undefined {
  const codRaw = String(codigoInput || '').trim();
  const codNorm = normalizarCodigoProducto(codRaw).toUpperCase();
  const descNorm = String(descripcionInput || '').trim().toUpperCase();

  if (!codNorm && !descNorm) return undefined;

  // 1. Coincidencia exacta por SKU
  if (codNorm) {
    let match = CATALOGO_ALKOSTO.find(p => p.sku.toUpperCase() === codNorm);
    if (match) return match;
  }

  // 2. Coincidencia por código de barra (EAN-13)
  if (codNorm) {
    let match = CATALOGO_ALKOSTO.find(p => p.codigoBarra && normalizarCodigoProducto(p.codigoBarra) === codNorm);
    if (match) return match;
  }

  // 3. Coincidencia por códigos de cadenas (ej. Alkosto / Familia Center)
  if (codNorm) {
    let match = CATALOGO_ALKOSTO.find(p => p.codigosCadena && p.codigosCadena.some(c => normalizarCodigoProducto(c).toUpperCase() === codNorm));
    if (match) return match;
  }

  // 4. Coincidencia por sinonimos en el código
  if (codNorm) {
    let match = CATALOGO_ALKOSTO.find(p => p.sinonimos && p.sinonimos.some(s => normalizarCodigoProducto(s).toUpperCase() === codNorm));
    if (match) return match;
  }

  // 5. Coincidencia por descripción si existe
  if (descNorm) {
    // Coincidencia exacta de nombre de producto
    let match = CATALOGO_ALKOSTO.find(p => p.producto.toUpperCase() === descNorm);
    if (match) return match;

    // Coincidencia por inclusión de frase
    match = CATALOGO_ALKOSTO.find(p => {
      const pNorm = p.producto.toUpperCase();
      if (descNorm.includes(pNorm) || pNorm.includes(descNorm)) return true;
      if (p.sinonimos && p.sinonimos.some(s => descNorm.includes(s.toUpperCase()))) return true;
      return false;
    });
    if (match) return match;

    // Coincidencia por tokens principales
    const tokens = descNorm.split(/\s+/).filter(t => t.length > 2 && !['POR', 'CON', 'DEL', 'LOS', 'LAS', 'PARA', 'MAS'].includes(t));
    if (tokens.length > 0) {
      match = CATALOGO_ALKOSTO.find(p => {
        const pNorm = p.producto.toUpperCase();
        const matchesCount = tokens.filter(t => pNorm.includes(t)).length;
        return matchesCount >= Math.min(2, tokens.length);
      });
      if (match) return match;
    }
  }

  return undefined;
}

function getLocalCache(): AlkostoOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Error leyendo caché local de pedidos Alkosto", e);
  }
  return [];
}

function setLocalCache(orders: AlkostoOrder[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch (e) {
    console.warn("Error guardando en caché local de pedidos Alkosto", e);
  }
}

export function calcularSiguienteCorrelativo(pedidos: AlkostoOrder[]): string {
  let max = 0;
  for (const p of pedidos) {
    const raw = p.correlativo || p.numeroPedido || '';
    const digits = raw.replace(/\D/g, '');
    if (digits) {
      const num = parseInt(digits, 10);
      if (!isNaN(num) && num < 100000 && num > max) {
        max = num;
      }
    }
  }
  const next = max > 0 ? max + 1 : (pedidos.length > 0 ? pedidos.length + 1 : 1);
  return String(next).padStart(4, '0');
}

export function subscribeAlkostoOrders(callback: (orders: AlkostoOrder[]) => void): () => void {
  // Emitir caché local de inmediato
  const cached = getLocalCache();
  callback(cached);

  try {
    const q = query(collection(db, ALKOSTO_COLLECTION));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: AlkostoOrder[] = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as Partial<AlkostoOrder>;
          if (data && data.sucursalNombre) {
            list.push({
              id: docSnap.id,
              numeroPedido: data.numeroPedido || `ALK-${docSnap.id.substring(0, 6).toUpperCase()}`,
              correlativo: data.correlativo || (data.numeroPedido && data.numeroPedido.length <= 5 ? data.numeroPedido : undefined),
              ordenCompraAlkosto: data.ordenCompraAlkosto || '',
              sucursalCodigo: data.sucursalCodigo || '7497',
              sucursalNombre: data.sucursalNombre || 'Alkosto',
              direccionEntrega: data.direccionEntrega || '',
              vendedora: data.vendedora || 'SAIRU VALLES',
              ruta: data.ruta || 'CUENTAS CLAVE 2',
              fechaPedido: data.fechaPedido || new Date().toISOString().split('T')[0],
              fechaEntregaEstimada: data.fechaEntregaEstimada || '',
              items: Array.isArray(data.items) ? data.items : [],
              totalBultos: Number(data.totalBultos) || 0,
              totalKilos: Number(data.totalKilos) || 0,
              totalUSD: Number(data.totalUSD) || 0,
              estado: (data.estado as EstadoPedidoAlkosto) || 'BORRADOR',
              condicionPago: data.condicionPago || 'Crédito 15 días',
              contactoRecepcion: data.contactoRecepcion || '',
              telefonoRecepcion: data.telefonoRecepcion || '',
              observaciones: data.observaciones || '',
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            });
          }
        });

        // Asegurar que cada pedido en la sala de espera tenga su número correlativo asignado por orden de llegada
        const sortedByArrival = [...list].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        let maxCorrelativo = 0;
        sortedByArrival.forEach(o => {
          if (o.correlativo && /^\d+$/.test(o.correlativo)) {
            const val = parseInt(o.correlativo, 10);
            if (val > maxCorrelativo) maxCorrelativo = val;
          }
        });

        sortedByArrival.forEach((order) => {
          if (!order.correlativo || !/^\d+$/.test(order.correlativo)) {
            maxCorrelativo++;
            order.correlativo = String(maxCorrelativo).padStart(4, '0');
            order.numeroPedido = order.correlativo;
          }
        });

        // Ordenar por fecha de creación descendente
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setLocalCache(list);
        callback(list);
      },
      (error) => {
        console.warn("Error en suscripción de Firestore para Alkosto:", error);
        callback(getLocalCache());
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn("Fallo inicializando listener Firestore para Alkosto:", err);
    return () => {};
  }
}

export async function saveAlkostoOrder(order: AlkostoOrder): Promise<AlkostoOrder> {
  const current = getLocalCache();

  // Asignación automática del correlativo oficial en la sala de espera
  if (!order.correlativo || order.correlativo.includes('AUTO') || order.numeroPedido.length > 5) {
    const correlativoAuto = calcularSiguienteCorrelativo(current);
    order.correlativo = correlativoAuto;
    order.numeroPedido = correlativoAuto;
  }

  const idx = current.findIndex(o => o.id === order.id);
  let updated: AlkostoOrder[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = { ...order, updatedAt: new Date().toISOString() };
  } else {
    updated = [{ ...order, updatedAt: new Date().toISOString() }, ...current];
  }
  setLocalCache(updated);

  try {
    const docRef = doc(db, ALKOSTO_COLLECTION, order.id);
    await setDoc(docRef, order, { merge: true });
  } catch (err) {
    console.warn("Error guardando pedido Alkosto en Firestore:", err);
  }

  // Sincronizar también con backend API
  try {
    fetch('/api/alkosto/pedidos', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(order)
    }).catch(() => {});
  } catch {}

  return order;
}

export async function transmitirPedidoAlkosto(order: AlkostoOrder): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/alkosto/pedidos/transmitir', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(order)
    });

    const resText = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(resText);
    } catch {}

    if (res.ok) {
      return { success: true, message: data.message || "Pedido transmitido con éxito" };
    } else {
      throw new Error(data.error || "Error transmitiendo pedido");
    }
  } catch (err: any) {
    console.warn("Fallo transmisión por backend, intentando fallback:", err);
    // Fallback directo a webhook si el servidor proxy fallara
    try {
      const webhookUrl = (import.meta as any).env?.VITE_GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbx6JMUR1IubQuZ97Ics7emw_I0G9UAy-5vig4Vl8zPwW8yMBbZldvQGeGOPNiNbUmVTaQ/exec';
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADD_PEDIDO_ALKOSTO',
          timestamp: new Date().toISOString(),
          ...order
        })
      });
      return { success: true, message: "Pedido enviado al programa externo (modo directo)" };
    } catch (e: any) {
      throw new Error(err.message || "No se pudo transmitir el pedido");
    }
  }
}

export async function updateAlkostoOrderStatus(id: string, nuevoEstado: EstadoPedidoAlkosto): Promise<void> {
  const current = getLocalCache();
  const idx = current.findIndex(o => o.id === id);
  const isEnviado = nuevoEstado === 'ENVIADO';
  const nowIso = new Date().toISOString();

  if (idx >= 0) {
    current[idx].estado = nuevoEstado;
    if (isEnviado) {
      current[idx].transmitido_a_pedidos_manuales = true;
      current[idx].fecha_transmision = nowIso;
    }
    current[idx].updatedAt = nowIso;
    setLocalCache([...current]);
  }

  try {
    const docRef = doc(db, ALKOSTO_COLLECTION, id);
    const updatePayload: any = {
      estado: nuevoEstado,
      updatedAt: nowIso
    };
    if (isEnviado) {
      updatePayload.transmitido_a_pedidos_manuales = true;
      updatePayload.fecha_transmision = nowIso;
    }
    await updateDoc(docRef, updatePayload);
  } catch (err) {
    console.warn("Error actualizando estado en Firestore:", err);
  }

  try {
    fetch(`/api/alkosto/pedidos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        status: nuevoEstado,
        transmitido_a_pedidos_manuales: isEnviado ? true : undefined,
        fecha_transmision: isEnviado ? nowIso : undefined
      })
    }).catch(() => {});
  } catch {}
}

export async function updateAlkostoOrderObservacion(id: string, nuevaObservacion: string): Promise<void> {
  const current = getLocalCache();
  const idx = current.findIndex(o => o.id === id);
  if (idx >= 0) {
    current[idx].observaciones = nuevaObservacion;
    current[idx].updatedAt = new Date().toISOString();
    setLocalCache([...current]);
  }

  try {
    const docRef = doc(db, ALKOSTO_COLLECTION, id);
    await updateDoc(docRef, {
      observaciones: nuevaObservacion,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Error actualizando observaciones en Firestore:", err);
  }
}

export async function deleteAlkostoOrder(id: string): Promise<void> {
  const current = getLocalCache().filter(o => o.id !== id);
  setLocalCache(current);

  try {
    const docRef = doc(db, ALKOSTO_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn("Error eliminando pedido Alkosto en Firestore:", err);
  }
}

export async function parseAlkostoOrderImage(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<ParsedOrdenCompraAlkosto> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s de tolerancia para análisis exhaustivo de órdenes completas

  try {
    const response = await fetch('/api/alkosto/ocr-orden', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ imageBase64, mimeType }),
      signal: controller.signal
    });

    const responseText = await response.text();
    let result: any = null;
    try {
      result = JSON.parse(responseText);
    } catch {
      if (!response.ok) {
        throw new Error(`Error en servidor (${response.status}): El servidor no devolvió una respuesta JSON válida.`);
      }
      throw new Error('Respuesta del servidor no válida (formato no reconocido).');
    }

    if (!response.ok) {
      throw new Error(result?.error || result?.details || `Error al procesar la orden de compra (${response.status})`);
    }

    if (!result?.success || !result?.data) {
      throw new Error(result?.error || 'Respuesta incompleta del servidor OCR');
    }

    return result.data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('El lector OCR excedió el tiempo límite (90s). Por favor reintenta con una imagen más nítida o liviana.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const SAMPLE_ALKOSTO_OC: ParsedOrdenCompraAlkosto | null = null;
export const SAMPLE_FAMILIA_CENTER_OC: ParsedOrdenCompraAlkosto | null = null;
