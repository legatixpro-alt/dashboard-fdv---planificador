import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWeekRange,
  getMondayDeadlineForWeek,
  countVendorDegustacionesInWeek,
  checkDateAvailability,
  buildGerenciaSurveyPayload,
  syncToGoogleSheets,
  syncToGerenciaDashboard,
  DEFAULT_CONFIG,
  formatYMD
} from '../../src/services/degustacionesService';
import { Degustacion } from '../../src/types';

describe('Unit: degustacionesService', () => {
  describe('getWeekRange', () => {
    it('should correctly calculate Monday to Sunday for mid-week dates', () => {
      // 2026-10-15 is Thursday
      const range = getWeekRange('2026-10-15');
      expect(range.startStr).toBe('2026-10-12'); // Monday
      expect(range.endStr).toBe('2026-10-18');   // Sunday
      expect(range.label).toBeDefined();
    });

    it('should correctly calculate Monday to Sunday when date is Monday', () => {
      // 2026-10-12 is Monday
      const range = getWeekRange('2026-10-12');
      expect(range.startStr).toBe('2026-10-12');
      expect(range.endStr).toBe('2026-10-18');
    });

    it('should correctly calculate Monday to Sunday when date is Sunday', () => {
      // 2026-10-18 is Sunday
      const range = getWeekRange('2026-10-18');
      expect(range.startStr).toBe('2026-10-12');
      expect(range.endStr).toBe('2026-10-18');
    });

    it('should handle month crossovers smoothly', () => {
      // 2026-11-01 is Sunday (week starts in October: 2026-10-26 to 2026-11-01)
      const range = getWeekRange('2026-11-01');
      expect(range.startStr).toBe('2026-10-26');
      expect(range.endStr).toBe('2026-11-01');
    });
  });

  describe('getMondayDeadlineForWeek', () => {
    it('should return Monday of that week at exactly 12:00:00.000', () => {
      // For any date in week 2026-10-12 to 2026-10-18:
      const deadlineThu = getMondayDeadlineForWeek('2026-10-15');
      expect(deadlineThu.getFullYear()).toBe(2026);
      expect(deadlineThu.getMonth()).toBe(9); // 0-indexed October
      expect(deadlineThu.getDate()).toBe(12);
      expect(deadlineThu.getHours()).toBe(12);
      expect(deadlineThu.getMinutes()).toBe(0);
      expect(deadlineThu.getSeconds()).toBe(0);

      const deadlineSun = getMondayDeadlineForWeek('2026-10-18');
      expect(deadlineSun.getDate()).toBe(12);
      expect(deadlineSun.getHours()).toBe(12);
    });
  });

  describe('countVendorDegustacionesInWeek', () => {
    const sampleList: Degustacion[] = [
      {
        id: 'deg-1',
        clienteCodigo: 'C01',
        clienteNombre: 'SUPERMERCADO 1',
        vendedorNombre: 'SAIRU VALLES',
        vendedorId: 'sairu',
        ruta: 'R01',
        fecha: '2026-10-15', // inside week 2026-10-12..18
        turno: 'MAÑANA',
        hora: '09:00 AM',
        productos: ['MORTADELA'],
        kilosEstimados: 5,
        personasEstimadas: 20,
        requierePromotora: true,
        materialPop: true,
        estado: 'APROBADA',
        createdAt: '2026-10-10'
      },
      {
        id: 'deg-2',
        clienteCodigo: 'C02',
        clienteNombre: 'SUPERMERCADO 2',
        vendedorNombre: 'Sairu Valles',
        vendedorId: 'sairu',
        ruta: 'R01',
        fecha: '2026-10-16', // inside week
        turno: 'TARDE',
        hora: '02:00 PM',
        productos: ['POLLO'],
        kilosEstimados: 10,
        personasEstimadas: 30,
        requierePromotora: false,
        materialPop: false,
        estado: 'SOLICITADA',
        createdAt: '2026-10-10'
      },
      {
        id: 'deg-3',
        clienteCodigo: 'C03',
        clienteNombre: 'SUPERMERCADO 3',
        vendedorNombre: 'SAIRU VALLES',
        vendedorId: 'sairu',
        ruta: 'R01',
        fecha: '2026-10-17', // inside week, BUT CANCELADA
        turno: 'MAÑANA',
        hora: '09:00 AM',
        productos: ['MORTADELA'],
        kilosEstimados: 5,
        personasEstimadas: 15,
        requierePromotora: true,
        materialPop: false,
        estado: 'CANCELADA',
        createdAt: '2026-10-10'
      },
      {
        id: 'deg-4',
        clienteCodigo: 'C04',
        clienteNombre: 'SUPERMERCADO 4',
        vendedorNombre: 'SAIRU VALLES',
        vendedorId: 'sairu',
        ruta: 'R01',
        fecha: '2026-10-17', // inside week, BUT RECHAZADA
        turno: 'TARDE',
        hora: '02:00 PM',
        productos: ['MORTADELA'],
        kilosEstimados: 5,
        personasEstimadas: 15,
        requierePromotora: true,
        materialPop: false,
        estado: 'RECHAZADA',
        createdAt: '2026-10-10'
      },
      {
        id: 'deg-5',
        clienteCodigo: 'C05',
        clienteNombre: 'SUPERMERCADO 5',
        vendedorNombre: 'OTRO VENDEDOR',
        vendedorId: 'otro',
        ruta: 'R02',
        fecha: '2026-10-15', // different vendor
        turno: 'MAÑANA',
        hora: '09:00 AM',
        productos: ['QUESO'],
        kilosEstimados: 5,
        personasEstimadas: 20,
        requierePromotora: false,
        materialPop: false,
        estado: 'APROBADA',
        createdAt: '2026-10-10'
      },
      {
        id: 'deg-6',
        clienteCodigo: 'C06',
        clienteNombre: 'SUPERMERCADO 6',
        vendedorNombre: 'SAIRU VALLES',
        vendedorId: 'sairu',
        ruta: 'R01',
        fecha: '2026-10-23', // DIFFERENT WEEK (next week)
        turno: 'MAÑANA',
        hora: '09:00 AM',
        productos: ['MORTADELA'],
        kilosEstimados: 5,
        personasEstimadas: 20,
        requierePromotora: false,
        materialPop: false,
        estado: 'APROBADA',
        createdAt: '2026-10-10'
      }
    ];

    it('should count only active degustaciones for vendor in that specific week', () => {
      // deg-1 (APROBADA) and deg-2 (SOLICITADA) match Sairu in week 2026-10-12..18.
      // deg-3 (CANCELADA) and deg-4 (RECHAZADA) must be excluded.
      // deg-5 is a different vendor. deg-6 is another week.
      const count = countVendorDegustacionesInWeek('SAIRU VALLES', '2026-10-15', sampleList);
      expect(count).toBe(2);
    });

    it('should return 0 when vendor name or date is empty/null', () => {
      expect(countVendorDegustacionesInWeek('', '2026-10-15', sampleList)).toBe(0);
      expect(countVendorDegustacionesInWeek('SAIRU', '', sampleList)).toBe(0);
      expect(countVendorDegustacionesInWeek(null as any, null as any, sampleList)).toBe(0);
    });
  });

  describe('checkDateAvailability', () => {
    it('should reject past dates', () => {
      const result = checkDateAvailability('2020-01-01', []);
      expect(result.disponible).toBe(false);
      expect(result.motivo).toContain('ha pasado');
    });

    it('should reject non-operational days: Monday, Tuesday, Wednesday, Sunday', () => {
      // Pick future dates far enough ahead
      // Let's create a future Monday:
      const futureMonday = new Date();
      futureMonday.setDate(futureMonday.getDate() + 28);
      while (futureMonday.getDay() !== 1) { // 1 = Monday
        futureMonday.setDate(futureMonday.getDate() + 1);
      }
      const mondayStr = formatYMD(futureMonday);

      const result = checkDateAvailability(mondayStr, []);
      expect(result.disponible).toBe(false);
      expect(result.motivo).toContain('solo están habilitadas para los días Jueves, Viernes y Sábados');
    });

    it('should reject dates administratively blocked in config', () => {
      // Pick a future Thursday
      const futureThu = new Date();
      futureThu.setDate(futureThu.getDate() + 28);
      while (futureThu.getDay() !== 4) { // 4 = Thursday
        futureThu.setDate(futureThu.getDate() + 1);
      }
      const thuStr = formatYMD(futureThu);

      const configWithBlocked = {
        ...DEFAULT_CONFIG,
        diasBloqueados: [thuStr]
      };

      const result = checkDateAvailability(thuStr, [], configWithBlocked);
      expect(result.disponible).toBe(false);
      expect(result.motivo).toContain('Fecha bloqueada por Trade Marketing');
    });

    it('should allow valid future Thursday with available capacity', () => {
      const futureThu = new Date();
      futureThu.setDate(futureThu.getDate() + 28);
      while (futureThu.getDay() !== 4) {
        futureThu.setDate(futureThu.getDate() + 1);
      }
      const thuStr = formatYMD(futureThu);

      const result = checkDateAvailability(thuStr, []);
      expect(result.disponible).toBe(true);
      expect(result.cuposTotales).toBe(18);
      expect(result.cuposDisponibles).toBe(18);
      expect(result.cuposMananaDisponibles).toBe(9);
      expect(result.cuposTardeDisponibles).toBe(9);
      expect(result.turnosOcupados).toEqual([]);
    });

    it('should mark morning as occupied when 9 morning slots are taken', () => {
      const futureFri = new Date();
      futureFri.setDate(futureFri.getDate() + 28);
      while (futureFri.getDay() !== 5) { // 5 = Friday
        futureFri.setDate(futureFri.getDate() + 1);
      }
      const friStr = formatYMD(futureFri);

      const morningList: Degustacion[] = Array.from({ length: 9 }).map((_, i) => ({
        id: `deg-m-${i}`,
        clienteCodigo: `C-${i}`,
        clienteNombre: `Cliente ${i}`,
        vendedorNombre: 'Vendedor Test',
        vendedorId: 'v-01',
        ruta: 'R-01',
        fecha: friStr,
        turno: 'MAÑANA',
        hora: '09:00 AM',
        productos: ['MORTADELA'],
        kilosEstimados: 5,
        personasEstimadas: 20,
        requierePromotora: true,
        materialPop: false,
        estado: 'APROBADA',
        createdAt: '2026-10-10'
      }));

      const result = checkDateAvailability(friStr, morningList);
      expect(result.disponible).toBe(true); // Afternoon still available
      expect(result.cuposMananaOcupados).toBe(9);
      expect(result.cuposMananaDisponibles).toBe(0);
      expect(result.cuposTardeDisponibles).toBe(9);
      expect(result.turnosOcupados).toContain('MAÑANA');
    });

    it('should reject booking when full day capacity (18 slots) is reached', () => {
      const futureSat = new Date();
      futureSat.setDate(futureSat.getDate() + 28);
      while (futureSat.getDay() !== 6) { // 6 = Saturday
        futureSat.setDate(futureSat.getDate() + 1);
      }
      const satStr = formatYMD(futureSat);

      const fullList: Degustacion[] = [
        ...Array.from({ length: 9 }).map((_, i) => ({
          id: `deg-sat-m-${i}`,
          clienteCodigo: `C-${i}`,
          clienteNombre: `Cliente M ${i}`,
          vendedorNombre: 'Vendedor Test',
          vendedorId: 'v-01',
          ruta: 'R-01',
          fecha: satStr,
          turno: 'MAÑANA' as const,
          hora: '09:00 AM',
          productos: ['MORTADELA'],
          kilosEstimados: 5,
          personasEstimadas: 20,
          requierePromotora: true,
          materialPop: false,
          estado: 'APROBADA' as const,
          createdAt: '2026-10-10'
        })),
        ...Array.from({ length: 9 }).map((_, i) => ({
          id: `deg-sat-t-${i}`,
          clienteCodigo: `C-T-${i}`,
          clienteNombre: `Cliente T ${i}`,
          vendedorNombre: 'Vendedor Test',
          vendedorId: 'v-01',
          ruta: 'R-01',
          fecha: satStr,
          turno: 'TARDE' as const,
          hora: '02:00 PM',
          productos: ['MORTADELA'],
          kilosEstimados: 5,
          personasEstimadas: 20,
          requierePromotora: true,
          materialPop: false,
          estado: 'APROBADA' as const,
          createdAt: '2026-10-10'
        }))
      ];

      const result = checkDateAvailability(satStr, fullList);
      expect(result.disponible).toBe(false);
      expect(result.cuposDisponibles).toBe(0);
      expect(result.motivo).toContain('Cupo diario agotado');
    });
  });

  describe('buildGerenciaSurveyPayload', () => {
    it('should format payload conforming to Gerencia Supabase schema', () => {
      const degustacion: Degustacion = {
        id: 'deg-trade-100',
        clienteCodigo: 'CLI-001',
        clienteNombre: 'AUTOMERCADO CENTRAL',
        vendedorNombre: 'SAIRU VALLES',
        vendedorId: 'sairu',
        ruta: 'CUENTAS CLAVE 2',
        fecha: '2026-10-22',
        turno: 'MAÑANA',
        hora: '09:00 AM - 01:00 PM',
        productos: ['MORTADELA ESTANDAR ASTURIAS', 'SALPICAO'],
        kilosEstimados: 10,
        personasEstimadas: 40,
        requierePromotora: true,
        promotoraAsignada: 'MARIA LOPEZ',
        materialPop: true,
        contactoPunto: 'SR. CARLOS',
        telefonoContacto: '04141234567',
        estado: 'APROBADA',
        observaciones: 'Instalar stand frente a charcutería',
        createdAt: '2026-10-16T12:00:00Z'
      };

      const payload = buildGerenciaSurveyPayload(degustacion);
      expect(payload.type).toBe('Degustacion');
      expect(payload.date).toBe('2026-10-22');
      expect(payload.store).toBe('AUTOMERCADO CENTRAL');
      expect(payload.promoter).toBe('MARIA LOPEZ');
      expect(payload.product).toContain('MORTADELA ESTANDAR ASTURIAS');

      // Validate embedded comments JSON string
      const parsedComments = JSON.parse(payload.comments);
      expect(parsedComments.isTasting).toBe(true);
      expect(parsedComments.degustacionId).toBe('deg-trade-100');
      expect(parsedComments.client).toBe('AUTOMERCADO CENTRAL');
      expect(parsedComments.status).toBe('Aprobada');
      expect(parsedComments.shift).toContain('Mañana');
      expect(parsedComments.kilos).toBe(10);
      expect(parsedComments.personas).toBe(40);
      expect(parsedComments.materialPop).toBe('SI');
    });
  });

  describe('Network / Sync resilience (Google Sheets & Gerencia)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('syncToGoogleSheets should return true on successful request', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true } as any);
      const sample = { id: 'test-deg', clienteNombre: 'Test Store' } as Degustacion;
      const res = await syncToGoogleSheets(sample);
      expect(res).toBe(true);
    });

    it('syncToGoogleSheets should return false on network error gracefully without throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Sheets Webhook unreachable'));
      const sample = { id: 'test-deg', clienteNombre: 'Test Store' } as Degustacion;
      const res = await syncToGoogleSheets(sample);
      expect(res).toBe(false);
    });

    it('syncToGerenciaDashboard should perform search and PATCH update if survey exists', async () => {
      let callStep = 0;
      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        callStep++;
        if (callStep === 1) {
          // Search query returns 1 record
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 'survey-existing-456' }])
          });
        }
        if (callStep === 2) {
          // PATCH call
          expect(opts.method).toBe('PATCH');
          expect(url).toContain('survey-existing-456');
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const sample = { id: 'deg-existing', clienteNombre: 'Supermarket' } as Degustacion;
      const success = await syncToGerenciaDashboard(sample);
      expect(success).toBe(true);
    });

    it('syncToGerenciaDashboard should return false safely on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Supabase DNS timeout'));
      const sample = { id: 'deg-timeout' } as Degustacion;
      const success = await syncToGerenciaDashboard(sample);
      expect(success).toBe(false);
    });
  });
});
