import React, { useEffect, useState, useMemo, useCallback, Suspense, lazy } from 'react';
import { Role, VolumenData, ActivacionData } from './types';
import { fetchVolumenData, fetchActivacionData, fetchMetasActivacion, triggerSheetsSync } from './services/googleSheetsService';
import { Lock, User as UserIcon, AlertCircle, ShieldCheck } from 'lucide-react';
import { Target, Package, Users, UserCircle, ScanText, ChevronDown, LogOut, Activity, Route, Sparkles, ShoppingCart } from 'lucide-react';
import { supabase, hasValidSupabaseConfig } from './lib/supabase';
import { verifyServerSession, clearAuthSession, saveAuthSession } from './services/authService';
import { 
  getVendorProfile, 
  getAllowedRoutesForUser, 
  isRouteMatch, 
  matchesVendorAlias,
  VENDOR_PROFILES, 
  normalizeVendorName,
  VendorProfile
} from './utils/vendorRoutes';

const RecorridoMes = lazy(() => import('./components/RecorridoMes').then(m => ({ default: m.RecorridoMes })));
const ActivacionRubro = lazy(() => import('./components/ActivacionRubro').then(m => ({ default: m.ActivacionRubro })));
const VolumenTab = lazy(() => import('./components/VolumenTab').then(m => ({ default: m.VolumenTab })));
const ActivacionClientes = lazy(() => import('./components/ActivacionClientes').then(m => ({ default: m.ActivacionClientes })));
const HistorialSection = lazy(() => import('./components/HistorialPanel').then(m => ({ default: m.HistorialSection })));
const CobrosOCR = lazy(() => import('./components/CobrosOCR').then(m => ({ default: m.CobrosOCR })));
const TrazabilidadTab = lazy(() => import('./components/TrazabilidadTab').then(m => ({ default: m.TrazabilidadTab })));
const DegustacionesTab = lazy(() => import('./components/DegustacionesTab').then(m => ({ default: m.DegustacionesTab })));
const AlkostoTab = lazy(() => import('./components/AlkostoTab').then(m => ({ default: m.AlkostoTab })));
import { subscribeDegustaciones } from './services/degustacionesService';
import { Degustacion } from './types';

type TabId = 'ACTIVACION_RUBRO' | 'VOLUMEN' | 'ACTIVACION_CLIENTES' | 'COBROS_OCR' | 'DEGUSTACIONES' | 'ALKOSTO' | 'TRAZABILIDAD';

export default function App() {
  const [userRole, setUserRole] = useState<Role>(() => {
    const saved = localStorage.getItem('dashboard_fdv_role') as Role;
    return (saved === 'ADMIN' || saved === 'SUPERVISOR') ? saved : 'VENDEDOR';
  });
  const [loggedInVendor, setLoggedInVendor] = useState<string>(() => {
    return localStorage.getItem('dashboard_fdv_vendor') || '';
  });
  const [activeVendedorId, setActiveVendedorId] = useState<string>(() => {
    return localStorage.getItem('dashboard_fdv_active_route') || '';
  });

  const [activeTab, setActiveTab] = useState<TabId>('ACTIVACION_RUBRO');
  const [isTabDropdownOpen, setIsTabDropdownOpen] = useState(false);
  
  const [volumenData, setVolumenData] = useState<VolumenData[]>([]);
  const [activacionData, setActivacionData] = useState<any[]>([]);
  const [metasActivacion, setMetasActivacion] = useState<any[]>([]);
  const [degustacionesList, setDegustacionesList] = useState<Degustacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [authUsuario, setAuthUsuario] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return Boolean(localStorage.getItem('dashboard_fdv_token')) && localStorage.getItem('dashboard_fdv_logged_in') === 'true';
  });
  const [loginError, setLoginError] = useState('');

  // Verificación estricta de la sesión criptográfica en el backend
  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      const token = localStorage.getItem('dashboard_fdv_token');
      if (!token) {
        handleLogout();
        return;
      }
      const sessionRes = await verifyServerSession();
      if (!isMounted) return;
      if (!sessionRes.valid || !sessionRes.user) {
        handleLogout();
      } else {
        setUserRole(sessionRes.user.role);
        setLoggedInVendor(sessionRes.user.username);
        if (sessionRes.user.role === 'ADMIN') {
          setActiveVendedorId(localStorage.getItem('dashboard_fdv_active_route') || 'ADMIN');
        } else {
          const profile = getVendorProfile(sessionRes.user.username);
          const initialRoute = profile.routes.length > 1 ? 'ALL_MY_ROUTES' : (profile.routes[0]?.id || profile.canonicalUsername);
          setActiveVendedorId(initialRoute);
        }
      }
    }
    if (isLoggedIn) {
      checkAuth();
    }
    return () => { isMounted = false; };
  }, [isLoggedIn]);

  // Perfil del vendedor logueado (garantiza privacidad total)
  const currentVendorProfile = useMemo(() => {
    if (userRole === 'ADMIN') return null;
    return getVendorProfile(loggedInVendor);
  }, [userRole, loggedInVendor]);

  // Protección de acceso: asegurar que un vendedor NUNCA esté en una ruta ajena
  useEffect(() => {
    if (userRole === 'VENDEDOR' && currentVendorProfile) {
      const routes = currentVendorProfile.routes || [];
      const allowedRouteIds = [
        ...(routes.length > 1 ? ['ALL_MY_ROUTES'] : []),
        ...routes.map(r => r.id)
      ];

      // Verificar si activeVendedorId coincide con una ruta o con alguno de sus alias
      let matchedRouteId = allowedRouteIds.includes(activeVendedorId) ? activeVendedorId : null;
      if (!matchedRouteId) {
        const found = routes.find(r => matchesVendorAlias([r.id, ...r.aliases], activeVendedorId));
        if (found) {
          matchedRouteId = found.id;
        }
      }

      if (!matchedRouteId) {
        const defaultRoute = routes.length > 1 
          ? 'ALL_MY_ROUTES' 
          : (routes[0]?.id || currentVendorProfile.canonicalUsername);
        setActiveVendedorId(defaultRoute);
        localStorage.setItem('dashboard_fdv_active_route', defaultRoute);
      } else if (matchedRouteId !== activeVendedorId) {
        setActiveVendedorId(matchedRouteId);
        localStorage.setItem('dashboard_fdv_active_route', matchedRouteId);
      }
    }
  }, [userRole, loggedInVendor, currentVendorProfile, activeVendedorId]);

  const loadData = useCallback(async (force = false, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const targetVendor = (userRole === 'ADMIN' && activeVendedorId === 'ADMIN') ? undefined : activeVendedorId;
      const [vol, act, metas] = await Promise.all([
        fetchVolumenData(force, targetVendor),
        fetchActivacionData(force, targetVendor),
        fetchMetasActivacion(force, targetVendor)
      ]);
      setVolumenData(vol);
      setActivacionData(act);
      setMetasActivacion(metas);
    } catch (err) {
      console.error("Error al sincronizar datos automáticamente", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [userRole, activeVendedorId]);

  useEffect(() => {
    (window as any).refreshData = async () => {
      setLoading(true);
      try {
        if (userRole === 'ADMIN') {
          await triggerSheetsSync();
        }
      } catch (e) {
        console.warn("Manual sheets sync error:", e);
      }
      await loadData(true, true);
    };
  }, [userRole, loadData]);

  // Cargar datos al estar autenticado y mantener sincronizado cada 60s
  useEffect(() => {
    if (!isLoggedIn) return;
    loadData(false, false);
    const syncInterval = setInterval(() => {
      loadData(false, false);
    }, 60000);
    return () => clearInterval(syncInterval);
  }, [isLoggedIn, loadData]);

  // Suscripción degustaciones y sesión Supabase
  useEffect(() => {
    const unsubscribeDeg = subscribeDegustaciones((data) => {
      setDegustacionesList(data);
    });

    if (hasValidSupabaseConfig) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
      }).catch(err => {
        console.error("Supabase session error:", err);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });
      return () => {
        subscription?.unsubscribe();
        unsubscribeDeg();
      };
    }

    return () => {
      unsubscribeDeg();
    };
  }, []);

  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmittingLogin(true);
    
    const usuarioUpper = (authUsuario || '').toUpperCase().trim();
    const pwd = authPassword.trim();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usuarioUpper, password: pwd })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        setLoginError(data?.error || 'Usuario o contraseña incorrectos');
        setIsSubmittingLogin(false);
        return;
      }

      const role: Role = data.user.role;
      let initialRoute = 'ADMIN';

      if (role === 'ADMIN') {
        setUserRole('ADMIN');
        setLoggedInVendor('ADMIN');
        setActiveVendedorId('ADMIN');
        localStorage.setItem('dashboard_fdv_role', 'ADMIN');
        localStorage.setItem('dashboard_fdv_vendor', 'ADMIN');
        localStorage.setItem('dashboard_fdv_active_route', 'ADMIN');
      } else {
        const profile = getVendorProfile(usuarioUpper);
        setUserRole('VENDEDOR');
        setLoggedInVendor(profile.canonicalUsername);
        initialRoute = profile.routes.length > 1 
          ? 'ALL_MY_ROUTES' 
          : (profile.routes[0]?.id || profile.canonicalUsername);
        if (usuarioUpper.includes('VILLA') && profile.routes.some(r => r.id.includes('VILLA'))) {
          initialRoute = profile.routes.find(r => r.id.includes('VILLA'))?.id || initialRoute;
        } else if ((usuarioUpper.includes('JOHNATAN') || usuarioUpper.includes('SOTO') || usuarioUpper.includes('DIAZ1')) && !usuarioUpper.includes('VILLA')) {
          initialRoute = profile.routes[0]?.id || initialRoute;
        }
        setActiveVendedorId(initialRoute);
        localStorage.setItem('dashboard_fdv_role', 'VENDEDOR');
        localStorage.setItem('dashboard_fdv_vendor', profile.canonicalUsername);
        localStorage.setItem('dashboard_fdv_active_route', initialRoute);
      }
      
      if (data?.token && data?.user) {
        saveAuthSession(data.token, data.user, initialRoute);
      }
      setIsLoggedIn(true);
      loadData(true, true);

      if (hasValidSupabaseConfig) {
        supabase.from('trazabilidad_login').insert([{
          usuario: usuarioUpper,
          rol: role
        }]).then(({ error }) => {
          if (error && error.code !== 'PGRST205') {
            console.error("No se pudo guardar la trazabilidad:", error.message);
          }
        });
      }
    } catch (err: any) {
      setLoginError('Error de conexión con el servidor de autenticación');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    setIsLoggedIn(false);
    setAuthUsuario('');
    setAuthPassword('');
    setLoginError('');
    setUserRole('VENDEDOR');
    setLoggedInVendor('');
    setActiveVendedorId('');
  };

  const handleRouteChange = (newRouteId: string) => {
    setActiveVendedorId(newRouteId);
    localStorage.setItem('dashboard_fdv_active_route', newRouteId);
  };

  // Opciones permitidas en el selector:
  // Si es VENDEDOR: NUNCA ve compañeros, solo sus rutas asignadas
  // Si es ADMIN: ve todas las rutas para auditoría y supervisión
  const allowedDropdownOptions = useMemo(() => {
    if (userRole === 'ADMIN') {
      const adminOptions: { value: string; label: string }[] = [
        { value: 'ADMIN', label: 'TODOS LOS VENDEDORES (EMPRESA COMPLETA)' }
      ];

      const seenProfiles = new Set<string>();
      const distinctProfiles: VendorProfile[] = [];

      Object.values(VENDOR_PROFILES).forEach(prof => {
        if (!seenProfiles.has(prof.canonicalUsername)) {
          seenProfiles.add(prof.canonicalUsername);
          distinctProfiles.push(prof);
        }
      });

      distinctProfiles.sort((a, b) => a.displayName.localeCompare(b.displayName));

      distinctProfiles.forEach(prof => {
        if (prof.routes.length > 1) {
          adminOptions.push({ 
            value: `CONSOLIDATED:${prof.canonicalUsername}`, 
            label: `👤 ${prof.displayName} (Consolidado - ${prof.routes.length} rutas)` 
          });
          prof.routes.forEach(r => {
            adminOptions.push({ value: r.id, label: `   ↳ ${r.label}` });
          });
        } else if (prof.routes.length === 1) {
          adminOptions.push({ value: prof.routes[0].id, label: `👤 ${prof.displayName}` });
        }
      });
      return adminOptions;
    }

    // PRIVACIDAD ESTRICTA PARA VENDEDORES
    if (!currentVendorProfile) return [];
    const routes = currentVendorProfile.routes || [];
    if (routes.length > 1) {
      return [
        { 
          value: 'ALL_MY_ROUTES', 
          label: `TODAS MIS RUTAS (CONSOLIDADO - ${routes.length} RUTAS)` 
        },
        ...routes.map(r => ({ value: r.id, label: r.label }))
      ];
    }
    return routes.map(r => ({ value: r.id, label: r.label }));
  }, [userRole, currentVendorProfile]);

  // Nombre legible del vendedor o ruta activa
  const activeVendedorDisplayName = useMemo(() => {
    if (userRole === 'ADMIN') {
      if (activeVendedorId === 'ADMIN') return 'TODOS LOS VENDEDORES';
      if (activeVendedorId.startsWith('CONSOLIDATED:')) {
        const rawTarget = activeVendedorId.replace('CONSOLIDATED:', '');
        const prof = getVendorProfile(rawTarget);
        return prof ? `${prof.displayName} (TODAS LAS RUTAS)` : rawTarget;
      }
      for (const prof of Object.values(VENDOR_PROFILES)) {
        const found = prof.routes.find(r => r.id === activeVendedorId);
        if (found) {
          return `${prof.displayName} - ${found.label}`;
        }
      }
      const opt = allowedDropdownOptions.find(o => o.value === activeVendedorId);
      return opt ? opt.label.replace(/^👤\s*/, '').replace(/^\s*↳\s*/, '').trim() : activeVendedorId;
    }
    if (!currentVendorProfile) return activeVendedorId;
    if (activeVendedorId === 'ALL_MY_ROUTES') {
      return `${currentVendorProfile.displayName} (TODAS MIS RUTAS)`;
    }
    const route = currentVendorProfile.routes.find(r => r.id === activeVendedorId);
    return route ? `${currentVendorProfile.displayName} - ${route.label}` : currentVendorProfile.displayName;
  }, [userRole, activeVendedorId, currentVendorProfile, allowedDropdownOptions]);

  // Filtrado 100% seguro y estricto
  const filteredVolumen = useMemo(() => {
    return volumenData.filter(d => isRouteMatch(d.vendedorId, activeVendedorId, loggedInVendor, userRole));
  }, [volumenData, activeVendedorId, loggedInVendor, userRole]);

  const filteredActivacion = useMemo(() => {
    return activacionData.filter(d => isRouteMatch(d.vendedorId, activeVendedorId, loggedInVendor, userRole));
  }, [activacionData, activeVendedorId, loggedInVendor, userRole]);

  const filteredMetas = useMemo(() => {
    const exactMatches = metasActivacion.filter(m => isRouteMatch(m.vendedorId, activeVendedorId, loggedInVendor, userRole));
    if (exactMatches.length > 0) return exactMatches;

    // Si no hay fila exacta para la sub-ruta seleccionada en el grid de metas, asociar con el perfil correspondiente
    if (userRole === 'VENDEDOR' && currentVendorProfile) {
      const allAliases = [currentVendorProfile.canonicalUsername, currentVendorProfile.displayName, ...currentVendorProfile.routes.flatMap(r => r.aliases)];
      return metasActivacion.filter(m => matchesVendorAlias(allAliases, m.vendedorId));
    }
    if (userRole === 'ADMIN' && activeVendedorId !== 'ADMIN') {
      const rawTarget = activeVendedorId.replace(/^CONSOLIDATED:/, '');
      const prof = getVendorProfile(rawTarget);
      if (prof) {
        const allAliases = [prof.canonicalUsername, prof.displayName, ...prof.routes.flatMap(r => r.aliases)];
        return metasActivacion.filter(m => matchesVendorAlias(allAliases, m.vendedorId));
      }
    }
    return [];
  }, [metasActivacion, activeVendedorId, loggedInVendor, userRole, currentVendorProfile]);

  // Cartera completa de clientes correspondientes a cada vendedor desde la base de datos
  const clientesParaDegustaciones = useMemo(() => {
    const map = new Map<string, any>();

    // 1. Clientes desde Activación
    const baseAct = userRole === 'ADMIN'
      ? (activeVendedorId === 'ADMIN' ? activacionData : activacionData.filter(d => isRouteMatch(d.vendedorId, activeVendedorId, loggedInVendor, userRole)))
      : activacionData.filter(d => isRouteMatch(d.vendedorId, 'ALL_MY_ROUTES', loggedInVendor, userRole));

    (baseAct || []).forEach(c => {
      if (c && c.cliente) {
        const key = String(c.id || c.cliente).trim().toUpperCase();
        map.set(key, {
          id: c.id || '',
          cliente: c.cliente,
          vendedorId: c.vendedorId,
          vendedorNombre: c.vendedorNombre || (currentVendorProfile ? currentVendorProfile.displayName : c.vendedorId),
          vendedorEmail: c.vendedorEmail || (currentVendorProfile ? currentVendorProfile.email : undefined)
        });
      }
    });

    // 2. Complementar con clientes desde Volumen para asegurar cobertura de toda la cartera
    const baseVol = userRole === 'ADMIN'
      ? (activeVendedorId === 'ADMIN' ? volumenData : volumenData.filter(d => isRouteMatch(d.vendedorId, activeVendedorId, loggedInVendor, userRole)))
      : volumenData.filter(d => isRouteMatch(d.vendedorId, 'ALL_MY_ROUTES', loggedInVendor, userRole));

    (baseVol || []).forEach(v => {
      if (v && v.cliente) {
        const key = String(v.cliente).trim().toUpperCase();
        if (!map.has(key)) {
          map.set(key, {
            id: v.id || '',
            cliente: v.cliente,
            vendedorId: v.vendedorId,
            vendedorNombre: v.vendedorNombre || (currentVendorProfile ? currentVendorProfile.displayName : v.vendedorId),
            vendedorEmail: v.vendedorEmail || (currentVendorProfile ? currentVendorProfile.email : undefined)
          });
        }
      }
    });

    return Array.from(map.values());
  }, [userRole, activeVendedorId, loggedInVendor, activacionData, volumenData]);

  // Restricción estricta: Alkosto SOLO visible y accesible para Sairú Valles
  const isSairuValles = useMemo(() => {
    const vendorNorm = (loggedInVendor || '').toUpperCase();
    return vendorNorm.includes('SAIRU') || vendorNorm.includes('VALLES');
  }, [loggedInVendor]);

  // Si cambia de usuario o rol y la pestaña activa no le corresponde, regresar a ACTIVACION_RUBRO
  useEffect(() => {
    if (activeTab === 'ALKOSTO' && !isSairuValles) {
      setActiveTab('ACTIVACION_RUBRO');
    }
    if (activeTab === 'TRAZABILIDAD' && userRole !== 'ADMIN') {
      setActiveTab('ACTIVACION_RUBRO');
    }
  }, [activeTab, isSairuValles, userRole]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500"></div>
          
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="w-24 h-24 mb-4 relative animate-coin-spin rounded-full shadow-[0_0_20px_rgba(220,38,38,0.2)]">
              <img 
                src="https://i.postimg.cc/sxT1kshZ/logo.jpg" 
                alt="Dashboard FDV Logo" 
                className="w-full h-full object-cover rounded-full border border-neutral-800"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-3xl font-sans font-bold text-white mb-2 tracking-tight">Dashboard <span className="text-red-500">FDV</span></h1>
            <p className="text-neutral-500 font-sans text-sm">Ingresa con tu usuario de vendedor</p>
          </div>

          {loginError && (
            <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-4 mb-6 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm font-sans text-red-400">{loginError}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                Usuario
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-neutral-500" />
                </div>
                <input
                  type="text"
                  required
                  value={authUsuario}
                  onChange={(e) => setAuthUsuario(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-neutral-800 rounded-lg bg-neutral-900 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors font-sans text-sm uppercase"
                  placeholder="EJ: OSCAR ORTIZ"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-neutral-500" />
                </div>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-neutral-800 rounded-lg bg-neutral-900 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors font-sans text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmittingLogin}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-sans font-bold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors mt-8 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmittingLogin ? 'Verificando...' : 'Ingresar al Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-neutral-400 font-mono tracking-tight animate-pulse">CARGANDO DATA...</p>
      </div>
    );
  }

  const tabs = [
    { id: 'ACTIVACION_RUBRO' as TabId, label: 'Activación (Por rubro)', icon: Target },
    { id: 'VOLUMEN' as TabId, label: 'Volumen (SKU / KG)', icon: Package },
    { id: 'ACTIVACION_CLIENTES' as TabId, label: 'Activación (Clientes)', icon: Users },
    { id: 'COBROS_OCR' as TabId, label: 'Cobros (OCR)', icon: ScanText },
    { 
      id: 'DEGUSTACIONES' as TabId, 
      label: 'Degustaciones', 
      icon: Sparkles 
    },
    ...(isSairuValles ? [{ id: 'ALKOSTO' as TabId, label: 'ALKOSTO', icon: ShoppingCart }] : []),
    ...(userRole === 'ADMIN' ? [{ id: 'TRAZABILIDAD' as TabId, label: 'Trazabilidad', icon: Activity }] : []),
  ];

  return (
    <div className="min-h-screen bg-black text-neutral-200 selection:bg-neutral-800 p-3 md:p-6 lg:p-8">
      
      {/* HEADER TABS & ROLE / ROUTE SELECTOR */}
      <header className="max-w-7xl mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-4 md:gap-6 mb-6 md:mb-8">
        
        {/* TABS PILL MENU - DESKTOP */}
        <div className="hidden md:flex bg-neutral-950 p-1.5 rounded-full border border-neutral-800 w-full xl:w-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full text-sm font-sans font-bold transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-red-600 text-white shadow-lg'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TABS DROPDOWN - MOBILE */}
        <div className="md:hidden relative w-full z-40">
          <button
            onClick={() => setIsTabDropdownOpen(!isTabDropdownOpen)}
            className="flex items-center justify-between w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl min-h-[48px]"
          >
            <div className="flex items-center gap-3">
              {(() => {
                const activeObj = tabs.find(t => t.id === activeTab);
                const ActiveIcon = activeObj?.icon || Target;
                return (
                  <>
                    <div className="bg-red-600 text-white p-1.5 rounded-lg shadow-md shadow-red-900/20">
                      <ActiveIcon className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm text-white">{activeObj?.label}</span>
                  </>
                );
              })()}
            </div>
            <ChevronDown className={`w-5 h-5 text-neutral-400 transition-transform ${isTabDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isTabDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsTabDropdownOpen(false);
                    }}
                    className={`flex items-center gap-3 p-4 w-full text-left font-bold text-sm transition-colors ${
                      isActive ? 'bg-neutral-900 text-white border-l-2 border-red-500' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white border-l-2 border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-red-500' : 'text-neutral-500'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* PERFIL DEL VENDEDOR / RUTAS ASIGNADAS & CERRAR SESIÓN */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto pb-2 xl:pb-0">
          
          {/* VISTA PERSONAL PARA VENDEDOR O SELECTOR PARA ADMIN */}
          {userRole === 'VENDEDOR' ? (
            <div className="flex flex-1 sm:flex-none items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-xl md:rounded-full px-4 py-2 min-h-[44px] shrink-0">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 shrink-0">
                <UserCircle className="w-4 h-4 text-emerald-500" />
              </div>
              
              <div className="flex flex-col flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 leading-none mb-0.5 flex-wrap">
                  <span className="text-[10px] font-sans text-neutral-300 font-bold uppercase tracking-wider">
                    {currentVendorProfile?.displayName}
                  </span>
                  {currentVendorProfile?.email && (
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-900/50 px-1.5 py-0.5 rounded">
                      {currentVendorProfile.email}
                    </span>
                  )}
                  <span className="bg-emerald-950/60 border border-emerald-900/60 text-emerald-400 text-[8px] font-mono px-1.5 py-0.2 rounded-full uppercase">
                    Personal
                  </span>
                </div>

                {/* Si tiene varias rutas asignadas, selector exclusivo de sus rutas */}
                {currentVendorProfile && currentVendorProfile.routes.length > 1 ? (
                  <div className="flex items-center gap-1.5 mt-0.5 bg-neutral-900/80 border border-neutral-800 rounded-lg px-2 py-1 shadow-inner">
                    <Route className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <select 
                      value={activeVendedorId}
                      onChange={(e) => handleRouteChange(e.target.value)}
                      className="bg-transparent text-xs font-sans font-bold text-white leading-none outline-none cursor-pointer hover:text-red-400 transition-colors max-w-[210px] sm:max-w-xs truncate pr-1"
                    >
                      {allowedDropdownOptions.map(opt => (
                        <option key={opt.value} value={opt.value} className="bg-neutral-900 text-white font-sans py-1">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-neutral-400 pointer-events-none shrink-0" />
                  </div>
                ) : (
                  /* Vendedor con 1 sola ruta asignada: fija y privada */
                  <div className="flex items-center gap-1 text-xs font-sans font-bold text-white leading-none">
                    <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="truncate">
                      {currentVendorProfile?.routes[0]?.label || 'Ruta Asignada'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* VISTA DE SUPERVISIÓN / ADMIN */
            <div className="flex flex-1 sm:flex-none items-center justify-between sm:justify-start gap-3 bg-neutral-950 border border-neutral-800 rounded-xl md:rounded-full px-4 py-2.5 min-h-[44px] shrink-0">
              <div className="flex items-center gap-2 w-full">
                <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30 shrink-0">
                  <UserCircle className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-[10px] font-sans text-neutral-500 leading-none uppercase tracking-wider mb-0.5">Supervisión (Admin)</span>
                  <select 
                    value={activeVendedorId}
                    onChange={(e) => handleRouteChange(e.target.value)}
                    className="bg-transparent text-sm font-sans font-bold text-white leading-none outline-none appearance-none cursor-pointer"
                  >
                    {allowedDropdownOptions.map(opt => (
                      <option key={opt.value} value={opt.value} className="bg-neutral-900 text-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <ChevronDown className="w-4 h-4 text-neutral-500 pointer-events-none shrink-0" />
              </div>
            </div>
          )}

          {/* BOTÓN CERRAR SESIÓN */}
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="flex items-center justify-center gap-2 bg-neutral-950 hover:bg-red-950/40 text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-900/50 rounded-xl md:rounded-full px-4 py-2.5 min-h-[44px] transition-all text-xs font-sans font-bold tracking-wider shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        <Suspense fallback={<div className="h-20 bg-neutral-900/40 border border-neutral-800/80 rounded-2xl animate-pulse" />}>
          {activeTab !== 'COBROS_OCR' && <RecorridoMes onSync={() => (window as any).refreshData()} loading={loading} />}
        </Suspense>

        <Suspense fallback={
          <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-neutral-950/60 border border-neutral-800 rounded-2xl min-h-[300px]">
            <div className="w-8 h-8 border-3 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            <span className="text-xs font-sans font-bold text-neutral-400 uppercase tracking-wider">Cargando módulo...</span>
          </div>
        }>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-6">
            {(activeTab === 'VOLUMEN' || activeTab === 'ACTIVACION_RUBRO' || activeTab === 'ACTIVACION_CLIENTES') && (
              <HistorialSection
                key={activeTab}
                vistaInicial={activeTab === 'VOLUMEN' ? 'volumen' : activeTab === 'ACTIVACION_RUBRO' ? 'rubros' : 'clientes'}
                vendedor={activeVendedorId}
              />
            )}
            {activeTab === 'ACTIVACION_RUBRO' && (
              <ActivacionRubro 
                filteredVolumen={filteredVolumen} 
                filteredActivacion={filteredActivacion} 
                metasActivacion={filteredMetas}
                activeVendedorId={activeVendedorDisplayName}
              />
            )}
            {activeTab === 'VOLUMEN' && (
              <VolumenTab 
                filteredVolumen={filteredVolumen} 
                activeVendedorId={activeVendedorDisplayName}
              />
            )}
            {activeTab === 'ACTIVACION_CLIENTES' && (
              <ActivacionClientes 
                filteredVolumen={filteredVolumen} 
                filteredActivacion={filteredActivacion} 
                activeVendedorId={activeVendedorDisplayName}
              />
            )}
            {activeTab === 'COBROS_OCR' && (
              <CobrosOCR 
                clientes={userRole === 'ADMIN' && activeVendedorId === 'ADMIN' ? activacionData : filteredActivacion} 
                currentVendedor={userRole === 'ADMIN' ? (activeVendedorId === 'ADMIN' ? 'ADMIN' : activeVendedorDisplayName) : (currentVendorProfile?.displayName || loggedInVendor)}
              />
            )}
            {activeTab === 'DEGUSTACIONES' && (
              <DegustacionesTab 
                userRole={userRole}
                vendedorName={userRole === 'ADMIN' ? (activeVendedorId === 'ADMIN' ? 'GERENCIA TRADE MARKETING' : activeVendedorDisplayName) : (currentVendorProfile?.displayName || loggedInVendor)}
                activeVendedorId={activeVendedorId}
                clientesAsignados={clientesParaDegustaciones}
                onNavigateToTab={(tab) => setActiveTab(tab as TabId)}
              />
            )}
            {activeTab === 'ALKOSTO' && isSairuValles && (
              <AlkostoTab 
                vendedoraNombre={currentVendorProfile?.displayName || loggedInVendor || 'SAIRU VALLES'}
                userRole={userRole}
              />
            )}
            {activeTab === 'TRAZABILIDAD' && userRole === 'ADMIN' && (
              <TrazabilidadTab />
            )}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
