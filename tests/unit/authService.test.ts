import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAuthToken,
  getAuthHeaders,
  saveAuthSession,
  clearAuthSession,
  verifyServerSession,
  AuthUser
} from '../../src/services/authService';

describe('Unit: authService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Session Storage & Token Management', () => {
    const mockUser: AuthUser = {
      username: 'sairu',
      role: 'VENDEDOR',
      vendorId: 'SAIRU VALLES'
    };
    const sampleToken = 'header.payload.signature123';

    it('should save auth session and retrieve token correctly', () => {
      saveAuthSession(sampleToken, mockUser, 'CUENTAS CLAVE 2');

      expect(getAuthToken()).toBe(sampleToken);
      expect(localStorage.getItem('dashboard_fdv_logged_in')).toBe('true');
      expect(localStorage.getItem('dashboard_fdv_role')).toBe('VENDEDOR');
      expect(localStorage.getItem('dashboard_fdv_vendor')).toBe('sairu');
      expect(localStorage.getItem('dashboard_fdv_active_route')).toBe('CUENTAS CLAVE 2');
    });

    it('should generate proper Authorization Bearer header when token exists', () => {
      saveAuthSession(sampleToken, mockUser);
      const headers = getAuthHeaders();
      expect(headers).toEqual({
        Authorization: `Bearer ${sampleToken}`
      });
    });

    it('should return empty headers object when no token is in storage', () => {
      clearAuthSession();
      expect(getAuthHeaders()).toEqual({});
    });

    it('should clear all session items completely', () => {
      saveAuthSession(sampleToken, mockUser, 'R-01');
      clearAuthSession();

      expect(getAuthToken()).toBeNull();
      expect(localStorage.getItem('dashboard_fdv_logged_in')).toBeNull();
      expect(localStorage.getItem('dashboard_fdv_role')).toBeNull();
      expect(localStorage.getItem('dashboard_fdv_vendor')).toBeNull();
      expect(localStorage.getItem('dashboard_fdv_active_route')).toBeNull();
    });
  });

  describe('verifyServerSession - Happy paths, 4xx/5xx and Offline Fallback', () => {
    const mockUser: AuthUser = {
      username: 'admin_test',
      role: 'ADMIN',
      vendorId: 'ADMIN'
    };

    it('should return { valid: false } immediately if no token exists', async () => {
      clearAuthSession();
      const result = await verifyServerSession();
      expect(result.valid).toBe(false);
      expect(result.user).toBeUndefined();
    });

    it('should return { valid: true, user } and update local storage when server confirms 200 OK', async () => {
      saveAuthSession('valid_jwt_token', mockUser);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          user: {
            username: 'admin_test',
            role: 'ADMIN',
            vendorId: 'ADMIN'
          }
        })
      } as any);

      const result = await verifyServerSession();
      expect(result.valid).toBe(true);
      expect(result.user?.username).toBe('admin_test');
      expect(result.user?.role).toBe('ADMIN');
      expect(localStorage.getItem('dashboard_fdv_role')).toBe('ADMIN');
    });

    it('should clear session and return { valid: false } when server responds with 401 Unauthorized', async () => {
      saveAuthSession('expired_jwt_token', mockUser);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ success: false, error: 'Token inválido o expirado' })
      } as any);

      const result = await verifyServerSession();
      expect(result.valid).toBe(false);
      expect(getAuthToken()).toBeNull();
      expect(localStorage.getItem('dashboard_fdv_logged_in')).toBeNull();
    });

    it('should clear session and return { valid: false } when server returns 200 but success: false', async () => {
      saveAuthSession('some_token', mockUser);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false })
      } as any);

      const result = await verifyServerSession();
      expect(result.valid).toBe(false);
      expect(getAuthToken()).toBeNull();
    });

    it('should handle network errors (e.g. offline / DNS drop) with offline fallback { valid: true }', async () => {
      saveAuthSession('offline_saved_token', mockUser);

      // Simulate network disconnection or server unreachable
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (net::ERR_INTERNET_DISCONNECTED)'));

      const result = await verifyServerSession();
      // Should not log out the user in the field when intermittent connection drops occur
      expect(result.valid).toBe(true);
      expect(getAuthToken()).toBe('offline_saved_token');
    });
  });
});
