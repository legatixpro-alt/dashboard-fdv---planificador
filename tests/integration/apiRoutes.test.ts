import { describe, it, expect, beforeAll } from 'vitest';

describe('Integration: API Server Routes & Authentication Flow', () => {
  let baseUrl = 'http://localhost:3005';
  let adminToken: string = '';
  let vendorToken: string = '';

  beforeAll(async () => {
    // Dynamically locate the running server (port 3005 fallback to 3000)
    for (const port of [3005, 3000]) {
      try {
        const res = await fetch(`http://localhost:${port}/api/health`);
        if (res.ok) {
          baseUrl = `http://localhost:${port}`;
          break;
        }
      } catch {}
    }
  });

  describe('GET /api/health', () => {
    it('should return 200 OK with status ok', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ok' });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 Bad Request when credentials are missing', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('requeridos');
    });

    it('should return 401 Unauthorized for incorrect password', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ADMIN', password: 'WRONG_PASSWORD_999' })
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('incorrecta');
    });

    it('should return 401 Unauthorized for non-existent user', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'USER_THAT_DOES_NOT_EXIST', password: '123' })
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should successfully log in ADMIN user and return valid JWT token', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ADMIN', password: '123' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(typeof data.token).toBe('string');
      expect(data.token.length).toBeGreaterThan(20);
      expect(data.user).toBeDefined();
      expect(data.user.role).toBe('ADMIN');
      adminToken = data.token;
    });

    it('should successfully log in vendor SAIRU VALLES and return JWT with VENDEDOR role', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'SAIRU VALLES', password: '18383237' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.username).toBe('SAIRU VALLES');
      expect(data.user.role).toBe('VENDEDOR');
      vendorToken = data.token;
    });
  });

  describe('JWT Protection on Endpoints', () => {
    it('GET /api/auth/me should return 401 when Authorization header is absent', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Token de autenticación requerido');
    });

    it('GET /api/auth/me should return 403 when token is corrupted or invalid', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer this.is.an.invalid.token' }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Token inválido');
    });

    it('GET /api/auth/me should return 200 and authenticated profile with valid token', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.username).toBe('ADMIN');
      expect(data.user.role).toBe('ADMIN');
    });
  });

  describe('POST /api/alkosto/pedidos/transmitir', () => {
    it('should return 401 when called without authentication token', async () => {
      const res = await fetch(`${baseUrl}/api/alkosto/pedidos/transmitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test-order' })
      });
      expect(res.status).toBe(401);
    });

    it('should return 400 when order payload is missing or invalid', async () => {
      const res = await fetch(`${baseUrl}/api/alkosto/pedidos/transmitir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vendorToken}`
        },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Datos de pedido requeridos');
    });

    it('should successfully process and transmit a valid Alkosto order', async () => {
      const testOrder = {
        id: `test-int-${Date.now()}`,
        numeroPedido: '9999',
        correlativo: '9999',
        ordenCompraAlkosto: 'OC-TEST-INT-001',
        sucursalCodigo: '7497',
        sucursalNombre: 'Alkosto 01 - Zona Industrial',
        direccionEntrega: 'Av. 68 con Calle 148, Zona Industrial',
        vendedora: 'SAIRU VALLES',
        ruta: 'CUENTAS CLAVE 2',
        fechaPedido: new Date().toISOString().split('T')[0],
        fechaEntregaEstimada: new Date().toISOString().split('T')[0],
        items: [
          {
            sku: '1496',
            producto: 'MORTADELA ESP D/POLLO ASTURIAS 10UNDX900GR',
            bultos: 2,
            kilos: 18,
            precioUnitarioUSD: 24.50,
            subtotalUSD: 49.00
          }
        ],
        totalBultos: 2,
        totalKilos: 18,
        totalUSD: 49.00,
        estado: 'PENDIENTE',
        condicionPago: 'Crédito 15 días',
        contactoRecepcion: 'Recepción Zona Ind',
        telefonoRecepcion: '04140000000',
        observaciones: 'Prueba de integración automatizada QA'
      };

      const res = await fetch(`${baseUrl}/api/alkosto/pedidos/transmitir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vendorToken}`
        },
        body: JSON.stringify(testOrder)
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('transmitido');
    });
  });

  describe('Middleware Error Handling: Malformed JSON', () => {
    it('should handle malformed JSON bodies gracefully with 400 Bad Request instead of 500 crash', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"username": "ADMIN", malformed_json_without_quotes}'
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('JSON malformado');
    });
  });
});
