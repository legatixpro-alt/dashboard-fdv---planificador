import { describe, it, expect } from 'vitest';
import { construirSerie, sumarSerie, normTexto, normCodigo } from '../../src/lib/volumenHistorial';
import type { HistVolumenRow } from '../../src/services/historialService';

const row = (ano: number, mes: number, sku: string, articulo: string, kgs: number, cajas: number, clientes = 1): HistVolumenRow => ({
  ano, mes, sku, articulo, rubro: 'OTROS', cajas, unidades: 0, kgs, monto: 0, clientes
});

const HIST: HistVolumenRow[] = [
  row(2026, 1, '001461', 'MORT ESTANDAR ASTURIAS X KG', 100, 10, 3),
  row(2026, 2, '001461', 'MORT ESTANDAR ASTURIAS X KG', 150, 15, 4),
  row(2026, 1, '000028', 'HUEVOS DE CONSUMO TUNAL TIPO A 1X12UNI', 40, 4, 2),
  row(2026, 1, '000922', 'HUEVOS DE CONSUMO TUNAL TIPO B 1X12UNI', 60, 6, 3),
  row(2026, 2, '000922', 'HUEVOS DE CONSUMO TUNAL TIPO B 1X12UNI', 20, 2, 1),
  row(2026, 1, '001360', 'PATATAS FRESCAS MARQUISE 4X2.5KG', 25, 5, 2),
  row(2026, 1, '001548', 'POLLO KIKI POR KG', 500, 50, 5),
  row(2026, 1, '000021', 'MORTADELA ESP D/POLLO CORRAL 1X12UNI', 70, 7, 2)
];

describe('Unit: cruce Volumen por SKU (Sheet) vs historial', () => {
  it('normaliza códigos y textos (ceros, acentos, Ñ mal codificada)', () => {
    expect(normCodigo('001461')).toBe('1461');
    expect(normCodigo('0')).toBe('0');
    expect(normTexto('  Azúcar  Blanca ')).toBe('AZUCAR BLANCA');
    expect(normTexto('DO\u00C3\u2018A ALICIA')).toBe('DONA ALICIA');
  });

  it('código numérico: coincidencia exacta ignorando ceros a la izquierda', () => {
    const s = construirSerie('1461', 'MORT ESTANDAR ASTURIAS X KG', HIST);
    expect(s.criterio).toBe('SKU');
    expect(s.porMes['2026-1']).toEqual({ kgs: 100, cajas: 10, clientes: 3 });
    expect(s.porMes['2026-2'].kgs).toBe(150);
    expect(s.totalKgs).toBe(250);
    expect(s.articulos).toHaveLength(1);
  });

  it('código numérico inexistente: sin historial (no inventa)', () => {
    const s = construirSerie('9999', 'ALGO', HIST);
    expect(s.criterio).toBe('NINGUNO');
    expect(s.totalKgs).toBe(0);
    expect(Object.keys(s.porMes)).toHaveLength(0);
  });

  it('código de texto: nombre exacto del artículo', () => {
    const s = construirSerie('PATATAS', 'PATATAS FRESCAS MARQUISE 4X2.5KG', HIST);
    expect(s.criterio).toBe('NOMBRE');
    expect(s.totalKgs).toBe(25);
  });

  it('fila agrupadora: suma los artículos de la familia y no suma clientes entre artículos', () => {
    const s = construirSerie('HUEVOS', 'HUEVOS TODAS LAS PRESENTACIONES', HIST);
    expect(s.criterio).toBe('FAMILIA');
    expect(s.porMes['2026-1'].kgs).toBe(100);
    expect(s.porMes['2026-1'].clientes).toBeNull();
    expect(s.porMes['2026-2'].kgs).toBe(20);
    expect(s.articulos).toHaveLength(2);
  });

  it('familia POLLO solo toma artículos que inician con POLLO (no mortadelas «D/POLLO»)', () => {
    const s = construirSerie('POLLO', 'POLLO TODAS LAS MARCAS', HIST);
    expect(s.criterio).toBe('FAMILIA');
    expect(s.totalKgs).toBe(500);
    expect(s.articulos.map((a) => a.sku)).toEqual(['1548']);
  });

  it('fila sin criterio confiable queda sin historial', () => {
    const s = construirSerie('LECHE UTH', 'LECHE LIQUIDA', HIST);
    expect(s.criterio).toBe('NINGUNO');
    expect(s.totalKgs).toBe(0);
  });

  it('sumarSerie respeta el filtro de meses', () => {
    const s = construirSerie('1461', 'MORT ESTANDAR ASTURIAS X KG', HIST);
    expect(sumarSerie(s, [], 'kgs')).toBe(250);
    expect(sumarSerie(s, ['2026-2'], 'kgs')).toBe(150);
    expect(sumarSerie(s, ['2026-2'], 'cajas')).toBe(15);
    expect(sumarSerie(s, ['2026-7'], 'kgs')).toBe(0);
  });
});
