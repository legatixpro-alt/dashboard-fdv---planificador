import { Role } from '../types';

export interface AuthUser {
  username: string;
  role: Role;
  vendorId: string;
}

const TOKEN_KEY = 'dashboard_fdv_token';
const ROLE_KEY = 'dashboard_fdv_role';
const VENDOR_KEY = 'dashboard_fdv_vendor';
const ROUTE_KEY = 'dashboard_fdv_active_route';
const LOGGED_IN_KEY = 'dashboard_fdv_logged_in';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export function saveAuthSession(token: string, user: AuthUser, initialRoute?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LOGGED_IN_KEY, 'true');
  localStorage.setItem(ROLE_KEY, user.role);
  localStorage.setItem(VENDOR_KEY, user.username);
  if (initialRoute) {
    localStorage.setItem(ROUTE_KEY, initialRoute);
  }
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LOGGED_IN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(VENDOR_KEY);
  localStorage.removeItem(ROUTE_KEY);
}

export async function verifyServerSession(): Promise<{ valid: boolean; user?: AuthUser }> {
  const token = getAuthToken();
  if (!token) {
    clearAuthSession();
    return { valid: false };
  }

  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      clearAuthSession();
      return { valid: false };
    }

    const data = await res.json();
    if (data?.success && data?.user) {
      // Re-sincronizar los valores locales con la verdad cryptográfica del servidor
      localStorage.setItem(ROLE_KEY, data.user.role);
      localStorage.setItem(VENDOR_KEY, data.user.username);
      localStorage.setItem(LOGGED_IN_KEY, 'true');
      return { valid: true, user: data.user };
    }

    clearAuthSession();
    return { valid: false };
  } catch (err) {
    console.warn("[AUTH] Error verificando sesión en servidor:", err);
    // Si no hay red pero el token existe, se asume temporalmente válido
    return { valid: true };
  }
}
