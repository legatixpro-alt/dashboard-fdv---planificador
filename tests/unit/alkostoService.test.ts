import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizarCodigoProducto,
  resolverProductoPorCodigoODescripcion,
  calcularSiguienteCorrelativo,
  getSucursalByTag,
  detectCadenaFromTagOrName,
  SUCURSALES_ALKOSTO,
  SUCURSALES_FAMILIA_CENTER,
  CATALOGO_ALKOSTO,
  transmitirPedidoAlkosto
} from '../../src/services/alkostoService';
import { AlkostoOrder } from '../../src/types';

describe('Unit: alkostoService', () => {
  describe('normalizarCodigoProducto', () => {
    it('should strip spaces, hyphens, underscores and dots', () => {
      expect(normalizarCodigoProducto('14-61')).toBe('1461');
      expect(normalizarCodigoProducto(' 14_96 ')).toBe('1496');
      expect(normalizarCodigoProducto('759.0377.000077')).toBe('7590377000077');
      expect(normalizarCodigoProducto('AK - 01')).toBe('AK01');
    });

    it('should handle edge cases: empty string, null, undefined', () => {
      expect(normalizarCodigoProducto('')).toBe('');
      expect(normalizarCodigoProducto(null as any)).toBe('');
      expect(normalizarCodigoProducto(undefined as any)).toBe('');
    });
  });

  describe('getSucursalByTag', () => {
    it('should find Alkosto branches by valid tag (case-insensitive and trimmed)', () => {
      const ak01 = getSucursalByTag('AK01');
      expect(ak01).toBeDefined();
      expect(ak01?.codigo).toBe('7498');
      expect(ak01?.nombre).toBe('Alkosto 1 san Felipe');

      const ak02Lower = getSucursalByTag('  ak02  ');
      expect(ak02Lower).toBeDefined();
      expect(ak02Lower?.codigo).toBe('7499');
      expect(ak02Lower?.nombre).toBe('Alkosto 2 - Plaza baral');

      const ak03 = getSucursalByTag('AK03');
      expect(ak03).toBeDefined();
      expect(ak03?.codigo).toBe('7497');
      expect(ak03?.nombre).toBe('Alkosto 3 - Delicias');
    });

    it('should find Familia Center branches by tag', () => {
      const fc01 = getSucursalByTag('FC01');
      expect(fc01).toBeDefined();
      expect(fc01?.codigo).toBe('7490');
      expect(fc01?.nombre).toBe('Familia Center 1 - Plaza lago');

      const fc05 = getSucursalByTag('fc05');
      expect(fc05).toBeDefined();
      expect(fc05?.codigo).toBe('7489');
      expect(fc05?.nombre).toBe('Familia Center 5 - La lago');
    });

    it('should return undefined for non-existent tags or empty inputs', () => {
      expect(getSucursalByTag('NONEXISTENT')).toBeUndefined();
      expect(getSucursalByTag('')).toBeUndefined();
      expect(getSucursalByTag(null as any)).toBeUndefined();
      expect(getSucursalByTag(undefined as any)).toBeUndefined();
    });
  });

  describe('detectCadenaFromTagOrName', () => {
    it('should identify FAMILIA_CENTER when containing FC or FAMILIA', () => {
      expect(detectCadenaFromTagOrName('FC01')).toBe('FAMILIA_CENTER');
      expect(detectCadenaFromTagOrName('fc03')).toBe('FAMILIA_CENTER');
      expect(detectCadenaFromTagOrName('Familia Center La Limpia')).toBe('FAMILIA_CENTER');
      expect(detectCadenaFromTagOrName('FCOP')).toBe('FAMILIA_CENTER');
    });

    it('should default to ALKOSTO for Alkosto branches or other strings', () => {
      expect(detectCadenaFromTagOrName('AK01')).toBe('ALKOSTO');
      expect(detectCadenaFromTagOrName('Alkosto Curva de Molina')).toBe('ALKOSTO');
      expect(detectCadenaFromTagOrName('')).toBe('ALKOSTO');
      expect(detectCadenaFromTagOrName(null as any)).toBe('ALKOSTO');
    });
  });

  describe('resolverProductoPorCodigoODescripcion', () => {
    it('Level 1: matches exact SKU', () => {
      const product = resolverProductoPorCodigoODescripcion('1496', '');
      expect(product).toBeDefined();
      expect(product?.sku).toBe('1496');
      expect(product?.producto).toContain('ASTURIAS');
    });

    it('Level 2: matches by barcode EAN-13', () => {
      const product = resolverProductoPorCodigoODescripcion('7590377000077', '');
      expect(product).toBeDefined();
      expect(product?.sku).toBe('1496');
    });

    it('Level 3: matches by chain-specific code (codigosCadena)', () => {
      // 100929 is a chain code for Jamon Superior / Mort. Superior Asturias (1463)
      const product = resolverProductoPorCodigoODescripcion('100929', '');
      expect(product).toBeDefined();
      expect(['1463', '171']).toContain(product?.sku);
    });

    it('Level 4: matches by synonym in code', () => {
      const product = resolverProductoPorCodigoODescripcion('SHOULDER ASTURIAS', '');
      expect(product).toBeDefined();
      expect(product?.sku).toBe('1561');
    });

    it('Level 5: matches by description fuzzy/tokens when code is missing or unmapped', () => {
      const product = resolverProductoPorCodigoODescripcion('UNKNOWN999', 'MORTADELA ESPECIAL COCIDA ASTURIAS');
      expect(product).toBeDefined();
      expect(product?.sku).toBe('1462');

      const chicken = resolverProductoPorCodigoODescripcion('', 'POLLO ENTERO BENEFICIADO');
      expect(chicken).toBeDefined();
      expect(chicken?.sku).toBe('101');
    });

    it('Edge cases: returns undefined for empty, null, or garbage inputs', () => {
      expect(resolverProductoPorCodigoODescripcion('', '')).toBeUndefined();
      expect(resolverProductoPorCodigoODescripcion(null as any, null as any)).toBeUndefined();
      expect(resolverProductoPorCodigoODescripcion('   ', '   ')).toBeUndefined();
      expect(resolverProductoPorCodigoODescripcion('XYZ999999NOTFOUND', 'PRODUCTO QUE NO EXISTE EN EL MUNDO')).toBeUndefined();
    });
  });

  describe('calcularSiguienteCorrelativo', () => {
    it('should return 0001 when order list is empty', () => {
      expect(calcularSiguienteCorrelativo([])).toBe('0001');
    });

    it('should increment maximum numeric correlativo with 4-digit zero padding', () => {
      const orders: Partial<AlkostoOrder>[] = [
        { id: '1', correlativo: '0001', numeroPedido: '0001' } as any,
        { id: '2', correlativo: '0005', numeroPedido: '0005' } as any,
        { id: '3', correlativo: '0002', numeroPedido: '0002' } as any
      ];
      expect(calcularSiguienteCorrelativo(orders as AlkostoOrder[])).toBe('0006');
    });

    it('should extract digits from complex order numbers like ALK-0012', () => {
      const orders: Partial<AlkostoOrder>[] = [
        { id: '1', correlativo: 'ALK-0012', numeroPedido: 'ALK-0012' } as any
      ];
      expect(calcularSiguienteCorrelativo(orders as AlkostoOrder[])).toBe('0013');
    });

    it('should ignore extreme numbers (>= 100000) such as timestamps and use length fallback', () => {
      const orders: Partial<AlkostoOrder>[] = [
        { id: '1', correlativo: '179183000000', numeroPedido: '179183000000' } as any,
        { id: '2', correlativo: '179183000001', numeroPedido: '179183000001' } as any
      ];
      // num >= 100000 are ignored, so next falls back to orders.length + 1 = 3 -> '0003'
      expect(calcularSiguienteCorrelativo(orders as AlkostoOrder[])).toBe('0003');
    });

    it('should handle orders with missing or malformed fields safely', () => {
      const orders: Partial<AlkostoOrder>[] = [
        { id: '1' } as any,
        { id: '2', correlativo: '', numeroPedido: undefined } as any,
        { id: '3', correlativo: '0004' } as any
      ];
      expect(calcularSiguienteCorrelativo(orders as AlkostoOrder[])).toBe('0005');
    });
  });

  describe('transmitirPedidoAlkosto - Happy path and Error Handling', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return success when backend endpoint responds 200 OK', async () => {
      const mockOrder: AlkostoOrder = {
        id: 'test-order-1',
        numeroPedido: '0042',
        correlativo: '0042',
        ordenCompraAlkosto: 'OC-1234',
        sucursalCodigo: '7497',
        sucursalNombre: 'Alkosto 01 - Zona Industrial',
        direccionEntrega: 'Zona Ind',
        vendedora: 'SAIRU VALLES',
        ruta: 'CUENTAS CLAVE 2',
        fechaPedido: '2026-10-16',
        fechaEntregaEstimada: '2026-10-18',
        condicionPago: 'Crédito 15 días',
        items: [],
        totalBultos: 5,
        totalKilos: 50,
        totalUSD: 150,
        estado: 'BORRADOR',
        createdAt: '2026-10-16T10:00:00Z',
        updatedAt: '2026-10-16T10:00:00Z'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true, message: 'Pedido transmitido al programa de pedidos manuales' }))
      } as any);

      const result = await transmitirPedidoAlkosto(mockOrder);
      expect(result.success).toBe(true);
      expect(result.message).toContain('transmitido');
      expect(global.fetch).toHaveBeenCalledWith('/api/alkosto/pedidos/transmitir', expect.anything());
    });

    it('should trigger fallback when backend responds with 500 error', async () => {
      const mockOrder: AlkostoOrder = {
        id: 'test-order-2',
        numeroPedido: '0043',
        sucursalCodigo: '7497',
        sucursalNombre: 'Alkosto 01',
        vendedora: 'SAIRU VALLES',
        ruta: 'CUENTAS CLAVE 2',
        fechaPedido: '2026-10-16',
        fechaEntregaEstimada: '2026-10-18',
        condicionPago: 'Crédito 15 días',
        items: [],
        totalBultos: 1,
        totalKilos: 10,
        totalUSD: 25,
        estado: 'BORRADOR',
        createdAt: '2026-10-16T10:00:00Z',
        updatedAt: '2026-10-16T10:00:00Z'
      };

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          // Backend API fails
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve(JSON.stringify({ error: 'Internal Server Error' }))
          });
        }
        // Fallback webhook succeeds
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true }))
        });
      });

      const result = await transmitirPedidoAlkosto(mockOrder);
      expect(result.success).toBe(true);
      expect(result.message).toContain('modo directo');
    });

    it('should throw Error if both backend and fallback fail completely', async () => {
      const mockOrder = { id: 'test-order-fail' } as AlkostoOrder;

      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline or DNS failure'));

      await expect(transmitirPedidoAlkosto(mockOrder)).rejects.toThrow();
    });
  });
});
