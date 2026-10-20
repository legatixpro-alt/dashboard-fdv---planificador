import { describe, it, expect } from 'vitest';
import { clasificarRubro, RUBROS_CLAVE, RUBROS_ACTIVACION, RUBRO_LABEL, RubroCodigo } from '../../src/lib/rubros';
import { categoryToRubroCode } from '../../src/services/historialService';

describe('Unit: clasificarRubro & Rubros Constants', () => {
  describe('Happy Paths - Categorization by SKU and Name', () => {
    it('should classify ESTANDAR_ASTURIAS by exact SKU (1461, 1463)', () => {
      expect(clasificarRubro('1461', 'PRODUCTO CUALQUIERA')).toBe('ESTANDAR_ASTURIAS');
      expect(clasificarRubro('1463', 'OTRO PRODUCTO')).toBe('ESTANDAR_ASTURIAS');
    });

    it('should classify ESTANDAR_ASTURIAS by product name match', () => {
      expect(clasificarRubro('9999', 'MORTADELA ESTANDAR ASTURIAS X KG')).toBe('ESTANDAR_ASTURIAS');
      expect(clasificarRubro('9999', 'JAMON SUPERIOR ASTURIAS')).toBe('ESTANDAR_ASTURIAS');
    });

    it('should classify MORTADELA_SALPICAO by known SKUs', () => {
      const mortadelaSkus = ['1464', '1462', '1512', '1521', '1561', '1522', '1563', '1562', '1564', '1519', '1496'];
      mortadelaSkus.forEach(sku => {
        expect(clasificarRubro(sku, 'GENERIC ITEM')).toBe('MORTADELA_SALPICAO');
      });
    });

    it('should classify MORTADELA_SALPICAO by name keyword match', () => {
      expect(clasificarRubro('0', 'MORTADELA ESPECIAL 900GR')).toBe('MORTADELA_SALPICAO');
      expect(clasificarRubro('0', 'MORT. TIPO AREPERO')).toBe('MORTADELA_SALPICAO');
      expect(clasificarRubro('0', 'SALPICAO X KG')).toBe('MORTADELA_SALPICAO');
    });

    it('should classify ACEITE by name keyword match', () => {
      expect(clasificarRubro('100', 'ACEITE VEGETAL 1L')).toBe('ACEITE');
      expect(clasificarRubro('101', 'ACEITE DE MAIZ 900ML')).toBe('ACEITE');
    });

    it('should classify AZUCAR with and without accents', () => {
      expect(clasificarRubro('200', 'AZUCAR BLANCA 1KG')).toBe('AZUCAR');
      expect(clasificarRubro('201', 'AZÚCAR REFINADA 1KG')).toBe('AZUCAR');
    });

    it('should classify POLLO by known SKUs and cuts', () => {
      expect(clasificarRubro('630', 'POLLO')).toBe('POLLO');
      expect(clasificarRubro('870', 'POLLO')).toBe('POLLO');
      expect(clasificarRubro('393', 'POLLO')).toBe('POLLO');
      expect(clasificarRubro('999', 'POLLO ENTERO BENEFICIADO')).toBe('POLLO');
      expect(clasificarRubro('999', 'FILET DE PECHUGA')).toBe('POLLO');
      expect(clasificarRubro('999', 'MUSLO DE POLLO')).toBe('POLLO');
      expect(clasificarRubro('999', 'ALAS DESPRESADAS')).toBe('POLLO');
      expect(clasificarRubro('999', 'HIGADO DE POLLO')).toBe('POLLO');
      expect(clasificarRubro('999', 'MOLLEJA DE POLLO')).toBe('POLLO');
    });

    it('should return OTROS for unrelated categories', () => {
      expect(clasificarRubro('555', 'QUESO AMARILLO')).toBe('OTROS');
      expect(clasificarRubro('777', 'CARNE DE RES')).toBe('OTROS');
      expect(clasificarRubro('888', 'PAPAS CONGELADAS')).toBe('OTROS');
    });
  });

  describe('Edge Cases & Type Safety', () => {
    it('should safely handle empty strings', () => {
      expect(clasificarRubro('', '')).toBe('OTROS');
    });

    it('should safely handle null and undefined inputs gracefully', () => {
      expect(clasificarRubro(null as any, null as any)).toBe('OTROS');
      expect(clasificarRubro(undefined as any, undefined as any)).toBe('OTROS');
    });

    it('should handle whitespace padded SKUs and lowercase strings', () => {
      expect(clasificarRubro('  1461  ', 'estandar asturias')).toBe('ESTANDAR_ASTURIAS');
      expect(clasificarRubro('  ', 'aceite de soya')).toBe('ACEITE');
      expect(clasificarRubro('1496', '   ')).toBe('MORTADELA_SALPICAO');
    });

    it('should maintain priority: ESTANDAR_ASTURIAS overrides generic mortadela keywords', () => {
      // If a product is "MORTADELA ESTANDAR ASTURIAS", rule 1 for ESTANDAR_ASTURIAS takes precedence
      expect(clasificarRubro('1461', 'MORTADELA ESTANDAR ASTURIAS X KG')).toBe('ESTANDAR_ASTURIAS');
    });
  });

  describe('Constants Integrity', () => {
    it('RUBROS_CLAVE should contain exactly 5 key rubros', () => {
      expect(RUBROS_CLAVE).toHaveLength(5);
      const codes = RUBROS_CLAVE.map(r => r.codigo);
      expect(codes).toContain('ACEITE');
      expect(codes).toContain('AZUCAR');
      expect(codes).toContain('POLLO');
      expect(codes).toContain('ESTANDAR_ASTURIAS');
      expect(codes).toContain('MORTADELA_SALPICAO');
    });

    it('RUBRO_LABEL dictionary should have human readable labels for all codes', () => {
      const allCodes: RubroCodigo[] = ['ACEITE', 'AZUCAR', 'POLLO', 'ESTANDAR_ASTURIAS', 'MORTADELA_SALPICAO', 'OTROS'];
      allCodes.forEach(code => {
        expect(RUBRO_LABEL[code]).toBeDefined();
        expect(typeof RUBRO_LABEL[code]).toBe('string');
        expect(RUBRO_LABEL[code].length).toBeGreaterThan(0);
      });
    });

    it('categoryToRubroCode should normalize all 5 activation display categories to canonical RubroCodigo', () => {
      expect(categoryToRubroCode('ACEITE')).toBe('ACEITE');
      expect(categoryToRubroCode('AZÚCAR')).toBe('AZUCAR');
      expect(categoryToRubroCode('AZUCAR')).toBe('AZUCAR');
      expect(categoryToRubroCode('POLLO')).toBe('POLLO');
      expect(categoryToRubroCode('ESTANDAR Y SUPERIOR ASTURIAS')).toBe('ESTANDAR_ASTURIAS');
      expect(categoryToRubroCode('MORTADELA SALPICAO Y ASTURIAS')).toBe('MORTADELA_SALPICAO');
      expect(RUBROS_ACTIVACION).toEqual(['ACEITE', 'AZUCAR', 'POLLO', 'ESTANDAR_ASTURIAS', 'MORTADELA_SALPICAO']);
    });
  });
});
