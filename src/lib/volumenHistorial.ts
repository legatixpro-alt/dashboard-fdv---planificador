import type { HistVolumenRow } from '../services/historialService';

/**
 * Cruce entre las filas de "Volumen por SKU" del mes en curso (Google Sheet) y el historial real
 * (ventas_historial). Nunca se estima nada: si no hay un criterio fiable la fila queda "sin historial".
 *
 *  - SKU      : código numérico idéntico (se ignoran ceros a la izquierda) → coincidencia exacta.
 *  - NOMBRE   : mismo nombre de artículo (filas del Sheet con código tipo texto, p. ej. «PATATAS»).
 *  - FAMILIA  : filas agrupadoras del Sheet («HUEVOS TODAS LAS PRESENTACIONES», «AZUCAR…»).
 *               Se suman los artículos del historial cuyo nombre cumple la regla de la familia.
 *               La cuota del Sheet puede estar definida con otros criterios, por eso se informa
 *               siempre qué artículos se sumaron.
 *  - NINGUNO  : sin criterio confiable → no se muestra historial.
 */
export type CriterioCruce = 'SKU' | 'NOMBRE' | 'FAMILIA' | 'NINGUNO';

export const normTexto = (s: any): string =>
  String(s ?? '')
    .replace(/\u00C3\u2018/g, 'N') // "Ñ" mal codificada (UTF-8 leído como cp1252) presente en parte del historial
    .replace(/\u00C3\u00B1/g, 'N') // "ñ" mal codificada
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

export const normCodigo = (s: any): string => String(s ?? '').trim().replace(/^0+(?=\d)/, '');

interface ReglaFamilia {
  re: RegExp;
  descripcion: string;
}

/** Claves = código de la fila agrupadora en el Sheet (normalizado). */
export const FAMILIAS: Record<string, ReglaFamilia> = {
  POLLO: { re: /^POLLO\b/, descripcion: 'artículos cuyo nombre inicia con «POLLO»' },
  AZUCAR: { re: /AZUCAR/, descripcion: 'artículos cuyo nombre contiene «AZUCAR»' },
  ACEITE: { re: /ACEITE/, descripcion: 'artículos cuyo nombre contiene «ACEITE»' },
  HUEVOS: { re: /HUEVO/, descripcion: 'artículos cuyo nombre contiene «HUEVO»' },
  ARROZ: { re: /^ARROZ\b/, descripcion: 'artículos cuyo nombre inicia con «ARROZ»' },
  FILET: { re: /^FILET/, descripcion: 'artículos cuyo nombre inicia con «FILET»' },
  QUESO: { re: /^QUESO/, descripcion: 'artículos cuyo nombre inicia con «QUESO»' },
  'LECHE EN POLVO': { re: /LECHE EN POLVO/, descripcion: 'artículos cuyo nombre contiene «LECHE EN POLVO»' },
  'CREMA DE LECHE': { re: /CREMA DE LECHE/, descripcion: 'artículos cuyo nombre contiene «CREMA DE LECHE»' },
  BEBIDAS: { re: /^(JUGO|NECTAR)\b/, descripcion: 'artículos cuyo nombre inicia con «JUGO» o «NECTAR»' }
};

export interface MesVolumen {
  kgs: number;
  cajas: number;
  /** Clientes con compra ese mes: solo cuando la serie es un único artículo (no se suman entre artículos). */
  clientes: number | null;
}

export interface SerieVolumen {
  codigo: string;
  articulo: string;
  criterio: CriterioCruce;
  criterioTexto: string;
  articulos: { sku: string; articulo: string }[];
  /** Claves "ano-mes" (ej. "2026-3"). */
  porMes: Record<string, MesVolumen>;
  totalKgs: number;
  totalCajas: number;
}

export function construirSerie(codigo: string, articulo: string, rows: HistVolumenRow[]): SerieVolumen {
  const code = String(codigo ?? '').trim();
  let matched: HistVolumenRow[] = [];
  let criterio: CriterioCruce = 'NINGUNO';
  let criterioTexto = 'Sin historial: no existe un criterio confiable para cruzar esta fila del Sheet con las ventas históricas.';

  if (/^\d+$/.test(code)) {
    const n = normCodigo(code);
    matched = rows.filter((r) => normCodigo(r.sku) === n);
    if (matched.length > 0) {
      criterio = 'SKU';
      criterioTexto = `Historial exacto del código ${n}.`;
    } else {
      criterioTexto = `El código ${n} no tiene ventas en el historial cargado.`;
    }
  } else {
    const nombre = normTexto(articulo);
    const exacto = rows.filter((r) => normTexto(r.articulo) === nombre);
    if (nombre && exacto.length > 0) {
      matched = exacto;
      criterio = 'NOMBRE';
      criterioTexto = 'Historial exacto por nombre de artículo.';
    } else {
      const regla = FAMILIAS[normTexto(code)];
      if (regla) {
        const fam = rows.filter((r) => regla.re.test(normTexto(r.articulo)));
        if (fam.length > 0) {
          matched = fam;
          criterio = 'FAMILIA';
          criterioTexto = `Agrupado por nombre: ${regla.descripcion}. La cuota del Sheet puede incluir otros criterios.`;
        }
      }
    }
  }

  const porMes: Record<string, MesVolumen> = {};
  const articulos = new Map<string, string>();
  const unico = new Set(matched.map((r) => normCodigo(r.sku))).size === 1;
  matched.forEach((r) => {
    articulos.set(normCodigo(r.sku), r.articulo);
    const k = `${r.ano}-${r.mes}`;
    const cur = porMes[k] || { kgs: 0, cajas: 0, clientes: unico ? 0 : null };
    cur.kgs += Number(r.kgs) || 0;
    cur.cajas += Number(r.cajas) || 0;
    if (cur.clientes !== null) cur.clientes += Number(r.clientes) || 0;
    porMes[k] = cur;
  });
  Object.values(porMes).forEach((m) => {
    m.kgs = +m.kgs.toFixed(2);
    m.cajas = +m.cajas.toFixed(2);
  });
  const vals = Object.values(porMes);
  return {
    codigo: code,
    articulo,
    criterio,
    criterioTexto,
    articulos: [...articulos.entries()].map(([sku, art]) => ({ sku, articulo: art })).sort((a, b) => a.articulo.localeCompare(b.articulo)),
    porMes,
    totalKgs: +vals.reduce((a, m) => a + m.kgs, 0).toFixed(2),
    totalCajas: +vals.reduce((a, m) => a + m.cajas, 0).toFixed(2)
  };
}

/** Suma de una métrica de la serie sobre los meses indicados (claves "ano-mes"); vacío = todos. */
export function sumarSerie(serie: SerieVolumen, meses: string[], metrica: 'kgs' | 'cajas'): number {
  const keys = meses.length > 0 ? meses : Object.keys(serie.porMes);
  return +keys.reduce((a, k) => a + (serie.porMes[k]?.[metrica] || 0), 0).toFixed(2);
}
