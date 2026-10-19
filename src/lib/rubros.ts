/**
 * Clasificación de artículos en los 5 rubros clave del mes.
 *
 * Replica EXACTAMENTE la regla que ya usa `syncWorkbookToSupabase` en server.ts
 * (hoja "Volumen por SKU") para que el historial sea comparable con el mes en curso.
 * Si el negocio cambia la definición de un rubro, se corrige aquí y se vuelve a cargar el historial.
 */

export type RubroCodigo =
  | 'ACEITE'
  | 'AZUCAR'
  | 'POLLO'
  | 'ESTANDAR_ASTURIAS'
  | 'MORTADELA_SALPICAO'
  | 'OTROS';

export const RUBROS_CLAVE: { codigo: Exclude<RubroCodigo, 'OTROS'>; label: string }[] = [
  { codigo: 'ACEITE', label: 'Aceite' },
  { codigo: 'AZUCAR', label: 'Azúcar' },
  { codigo: 'POLLO', label: 'Pollo' },
  { codigo: 'ESTANDAR_ASTURIAS', label: 'Estándar y Superior Asturias' },
  { codigo: 'MORTADELA_SALPICAO', label: 'Mortadela Salpicao y Asturias' }
];

export const RUBRO_LABEL: Record<RubroCodigo, string> = {
  ACEITE: 'Aceite',
  AZUCAR: 'Azúcar',
  POLLO: 'Pollo',
  ESTANDAR_ASTURIAS: 'Estándar y Superior Asturias',
  MORTADELA_SALPICAO: 'Mortadela Salpicao y Asturias',
  OTROS: 'Otros'
};

const SKUS_MORTADELA = new Set(['1464', '1462', '1512', '1521', '1561', '1522', '1563', '1562', '1564', '1519', '1496']);
const SKUS_POLLO = new Set(['630', '870', '393']);

export function clasificarRubro(sku: string, nombre: string): RubroCodigo {
  const s = String(sku || '').trim();
  const n = String(nombre || '').toUpperCase();

  if (s === '1461' || s === '1463' || n.includes('ESTANDAR ASTURIAS') || n.includes('SUPERIOR ASTURIAS')) {
    return 'ESTANDAR_ASTURIAS';
  }
  if (n.includes('MORTADELA') || n.includes('MORT.') || n.includes('SALPICAO') || SKUS_MORTADELA.has(s)) {
    return 'MORTADELA_SALPICAO';
  }
  if (n.includes('ACEITE')) return 'ACEITE';
  if (n.includes('AZUCAR') || n.includes('AZÚCAR')) return 'AZUCAR';
  if (
    SKUS_POLLO.has(s) ||
    n.includes('POLLO ENTERO') ||
    n.includes('FILET') ||
    n.includes('MUSLO') ||
    n.includes('ALAS DESPRESADAS') ||
    n.includes('HIGADO') ||
    n.includes('MOLLEJA')
  ) {
    return 'POLLO';
  }
  return 'OTROS';
}
