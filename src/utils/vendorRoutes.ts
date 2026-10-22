import { Role } from '../types';

export interface AssignedRoute {
  id: string;
  label: string;
  aliases: string[];
}

export interface VendorProfile {
  canonicalUsername: string;
  displayName: string;
  email?: string;
  routes: AssignedRoute[];
}

export interface SupervisorProfile {
  canonicalUsername: string;
  displayName: string;
  supervisedVendors: string[];
}

// Columnas de resumen de supervisores en "Volumen por SKU" (no son rutas de vendedor individual)
export const SUPERVISOR_SUMMARY_COLUMNS = new Set([
  'ALI PEREZ',
  'NELSON FINOL',
  'JOHNATAN SOTO'
]);

// Normalizador de texto para comparaciones robustas contra nombres en hojas de cálculo
export function normalizeVendorName(val: string | null | undefined): string {
  if (!val) return '';
  return String(val)
    .replace(/Ã‘|Ã±/g, 'Ñ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim()
    .toUpperCase();
}

export function normalizeAsciiKey(val: string | null | undefined): string {
  if (!val) return '';
  return String(val)
    .replace(/Ã‘|Ã±/g, 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Configuración exhaustiva de perfiles y rutas asignadas a cada vendedor
export const VENDOR_PROFILES: Record<string, VendorProfile> = {
  'MARIA BRICEÑO': {
    canonicalUsername: 'MARIA BRICEÑO',
    displayName: 'María Briceño',
    routes: [
      { id: 'MARIA BRICEÑO', label: 'Ruta María Briceño', aliases: ['MARIA BRICEÑO', 'MARIA BRICENO', 'MARIA BRICEÃ‘O'] }
    ]
  },
  'MARIANA CHACIN': {
    canonicalUsername: 'MARIANA CHACIN',
    displayName: 'Mariana Chacín',
    routes: [
      { id: 'CUENTAS CLAVE 1', label: 'Cuentas Clave 1 (MC)', aliases: ['CUENTAS CLAVE 1', 'CUENTAS CLAVE 1 - MC', 'MARIANA CHACIN'] }
    ]
  },
  'MIKELANGELO DIAZ': {
    canonicalUsername: 'MIKELANGELO DIAZ',
    displayName: 'Mikelangelo Diaz',
    email: 'Mikelangelodiaz@gmail.com',
    routes: [
      { 
        id: 'MIKELANGELO DIAZ', 
        label: 'Ruta Mikelangelo Diaz (Principal)', 
        aliases: [
          'MIKELANGELO DIAZ',
          'MIKELANGELO DIAZ1',
          'MIKELANGELO',
          'MIKELANGELO DIAZ - PRINCIPAL',
          'MIKELANGELO DIAZ-PRINCIPAL',
          'MIKELANGELO DIAZ (PRINCIPAL)',
          'MIKELANGELODIAZ@GMAIL.COM',
          'JOHNATAN SOTO',
          'JOHNATAN',
          'JONATHAN',
          'JHONATAN',
          'JHONATAN SOTO',
          'RUTA MIKELANGELO DIAZ',
          'RUTA JOHNATAN SOTO'
        ] 
      },
      { 
        id: 'MIKELANGELO DIAZ - VILLA DEL ROS', 
        label: 'Ruta Villa del Rosario', 
        aliases: [
          'MIKELANGELO DIAZ - VILLA DEL ROS',
          'MIKELANGELO DIAZ- VILLA DEL ROS',
          'MIKELANGELO DIAZ-VILLA DEL ROS',
          'MIKELANGELO DIAZ VILLA DEL ROS',
          'MIKELANGELO DIAZ - VILLA DEL ROSARIO',
          'MIKELANGELO DIAZ VILLA DEL ROSARIO',
          'MIKELANGELO VILLA DEL ROS',
          'MIKELANGELO - VILLA DEL ROS',
          'MIKELANGELO VILLA DEL ROSARIO',
          'JOHNATAN SOTO VILLA DEL ROS',
          'JOHNATAN SOTO - VILLA DEL ROS',
          'JOHNATAN SOTO VILLA DEL ROSARIO',
          'JOHNATAN SOTO - VILLA DEL ROSARIO',
          'VILLA DEL ROSARIO',
          'VILLA DEL ROS',
          'RUTA VILLA DEL ROSARIO',
          'RUTA VILLA DEL ROS'
        ] 
      }
    ]
  },
  'HERNAN PAZ': {
    canonicalUsername: 'HERNAN PAZ',
    displayName: 'Hernán Paz',
    routes: [
      { id: 'HERNAN PAZ', label: 'Ruta Hernán Paz', aliases: ['HERNAN PAZ'] }
    ]
  },
  'OSWALDO CHURION': {
    canonicalUsername: 'OSWALDO CHURION',
    displayName: 'Oswaldo Churión',
    routes: [
      { id: 'OSWALDO CHURION', label: 'Ruta Oswaldo Churión', aliases: ['OSWALDO CHURION'] }
    ]
  },
  'CARLOS FUENMAYOR': {
    canonicalUsername: 'CARLOS FUENMAYOR',
    displayName: 'Carlos Fuenmayor',
    routes: [
      { id: 'CARLOS FUENMAYOR', label: 'Ruta Carlos Fuenmayor', aliases: ['CARLOS FUENMAYOR'] }
    ]
  },
  'SARAH REYES': {
    canonicalUsername: 'SARAH REYES',
    displayName: 'Sarah Reyes',
    routes: [
      { id: 'SARAH REYES', label: 'Ruta Sarah Reyes', aliases: ['SARAH REYES'] }
    ]
  },
  'J PABLO ARAUJO': {
    canonicalUsername: 'J PABLO ARAUJO',
    displayName: 'J Pablo Araujo',
    routes: [
      { id: 'J PABLO ARAUJO', label: 'Ruta J Pablo Araujo', aliases: ['J PABLO ARAUJO'] },
      { id: 'J PABLO ARAUJO - CAB/OJE', label: 'Ruta Cabimas / Ojeda', aliases: ['J PABLO ARAUJO - CAB/OJE', 'J PABLO ARAUJO - CAB', 'J PABLO ARAUJO- CAB/OJE'] }
    ]
  },
  'J PABLO ARAUJO - CAB/OJE': {
    canonicalUsername: 'J PABLO ARAUJO',
    displayName: 'J Pablo Araujo',
    routes: [
      { id: 'J PABLO ARAUJO', label: 'Ruta J Pablo Araujo', aliases: ['J PABLO ARAUJO'] },
      { id: 'J PABLO ARAUJO - CAB/OJE', label: 'Ruta Cabimas / Ojeda', aliases: ['J PABLO ARAUJO - CAB/OJE', 'J PABLO ARAUJO - CAB', 'J PABLO ARAUJO- CAB/OJE'] }
    ]
  },
  'JOSE G. GONZALEZ': {
    canonicalUsername: 'JOSE G. GONZALEZ',
    displayName: 'José G. González',
    routes: [
      { id: 'JOSE G. GONZALEZ', label: 'Ruta José G. González', aliases: ['JOSE G. GONZALEZ', 'JOSE GONZALEZ'] }
    ]
  },
  'FOOD SERVICE SUR': {
    canonicalUsername: 'FOOD SERVICE SUR',
    displayName: 'Food Service Sur',
    routes: [
      { id: 'FOOD SERVICE SUR', label: 'Ruta Food Service Sur', aliases: ['FOOD SERVICE SUR'] }
    ]
  },
  'JAIDER MEDINA - FOOD SERVICE NORTE': {
    canonicalUsername: 'JAIDER MEDINA - FOOD SERVICE NORTE',
    displayName: 'Jaider Medina (Food Service Norte)',
    routes: [
      { id: 'JAIDER MEDINA - FOOD SERVICE NORTE', label: 'Ruta Food Service Norte', aliases: ['JAIDER MEDINA - FOOD SERVICE NORTE', 'JAIDER MEDINA', 'FOOD SERVICE NORTE'] }
    ]
  },
  'ANGELICA MORENO': {
    canonicalUsername: 'ANGELICA MORENO',
    displayName: 'Angélica Moreno',
    routes: [
      { id: 'ANGELICA MORENO', label: 'Ruta Angélica Moreno', aliases: ['ANGELICA MORENO'] }
    ]
  },
  'ADEL JARABA': {
    canonicalUsername: 'ADEL JARABA',
    displayName: 'Adel Jaraba',
    routes: [
      { id: 'ADEL JARABA', label: 'Ruta Adel Jaraba', aliases: ['ADEL JARABA'] }
    ]
  },
  'JUAN HERNANDEZ': {
    canonicalUsername: 'JUAN HERNANDEZ',
    displayName: 'Juan Hernández',
    routes: [
      { id: 'JUAN HERNANDEZ', label: 'Ruta Juan Hernández', aliases: ['JUAN HERNANDEZ'] },
      { id: 'FOOD SERVICE SENIOR', label: 'Ruta Food Service Senior', aliases: ['FOOD SERVICE SENIOR', 'FOOD SERVICE SENIOR - JUAN HERNANDEZ'] }
    ]
  },
  'YOLEIDA LUGO': {
    canonicalUsername: 'YOLEIDA LUGO',
    displayName: 'Yoleida Lugo',
    routes: [
      { id: 'YOLEIDA LUGO', label: 'Ruta Yoleida Lugo', aliases: ['YOLEIDA LUGO'] }
    ]
  },
  'SAIRU VALLES': {
    canonicalUsername: 'SAIRU VALLES',
    displayName: 'Sairú Valles',
    routes: [
      { id: 'CUENTAS CLAVE 2', label: 'Ruta Cuentas Clave 2 (SV)', aliases: ['CUENTAS CLAVE 2', 'CUENTAS CLAVE 2 - SV'] },
      { id: 'SAIRU VALLES', label: 'Ruta Sairú Valles', aliases: ['SAIRU VALLES'] }
    ]
  },
  'ELISA SOLER': {
    canonicalUsername: 'ELISA SOLER',
    displayName: 'Elisa Soler',
    routes: [
      { id: 'ELISA SOLER', label: 'Ruta Elisa Soler', aliases: ['ELISA SOLER'] }
    ]
  },
  'ANGEL NAVARRO': {
    canonicalUsername: 'ANGEL NAVARRO',
    displayName: 'Ángel Navarro',
    routes: [
      { id: 'ANGEL NAVARRO', label: 'Ruta Ángel Navarro', aliases: ['ANGEL NAVARRO', 'ÁNGEL NAVARRO'] }
    ]
  },
  'MARIANGEL GONZALEZ': {
    canonicalUsername: 'MARIANGEL GONZALEZ',
    displayName: 'Mariangel González',
    routes: [
      { id: 'MARIANGEL GONZALEZ', label: 'Ruta Mariangel González', aliases: ['MARIANGEL GONZALEZ', 'MARIANGEL GONZÁLEZ'] }
    ]
  },
  'VICTOR CAMPOS': {
    canonicalUsername: 'VICTOR CAMPOS',
    displayName: 'Víctor Campos',
    routes: [
      { id: 'VICTOR CAMPOS', label: 'Ruta Víctor Campos', aliases: ['VICTOR CAMPOS', 'VÍCTOR CAMPOS'] }
    ]
  },
  'EDUARDO PIÑA': {
    canonicalUsername: 'EDUARDO PIÑA',
    displayName: 'Eduardo Piña',
    routes: [
      { id: 'EDUARDO PIÑA', label: 'Ruta Eduardo Piña', aliases: ['EDUARDO PIÑA', 'EDUARDO PINA', 'EDUARDO PIÃ‘A'] }
    ]
  },
  'LEONARDO RIOS': {
    canonicalUsername: 'LEONARDO RIOS',
    displayName: 'Leonardo Ríos',
    routes: [
      { id: 'LEONARDO RIOS', label: 'Ruta Leonardo Ríos', aliases: ['LEONARDO RIOS'] }
    ]
  },
  'MARYERY GARCIA': {
    canonicalUsername: 'MARYERY GARCIA',
    displayName: 'Maryery García',
    routes: [
      { id: 'MARYERY GARCIA', label: 'Ruta Maryery García', aliases: ['MARYERY GARCIA'] }
    ]
  },
  'LUIS GUANIPA': {
    canonicalUsername: 'LUIS GUANIPA',
    displayName: 'Luis Guanipa',
    routes: [
      { id: 'LUIS GUANIPA', label: 'Ruta Luis Guanipa', aliases: ['LUIS GUANIPA'] }
    ]
  },
  'PEDRO ABREU': {
    canonicalUsername: 'PEDRO ABREU',
    displayName: 'Pedro Abreu',
    routes: [
      { id: 'PEDRO ABREU', label: 'Ruta Pedro Abreu', aliases: ['PEDRO ABREU'] }
    ]
  },
  'OSCAR ORTIZ': {
    canonicalUsername: 'OSCAR ORTIZ',
    displayName: 'Óscar Ortiz',
    routes: [
      { id: 'OSCAR ORTIZ- LA COSTA', label: 'Ruta La Costa', aliases: ['OSCAR ORTIZ- LA COSTA', 'OSCAR ORTIZ-  LA COSTA', 'OSCAR ORTIZ - LA COSTA', 'OSCAR ORTIZ LA COSTA', 'LA COSTA'] },
      { id: 'OSCAR ORTIZ- CORO', label: 'Ruta Coro', aliases: ['OSCAR ORTIZ- CORO', 'OSCAR ORTIZ - CORO', 'OSCAR ORTIZ CORO', 'CORO'] }
    ]
  }
};

// Vinculación de alias y nomenclaturas históricas al perfil canónico unificado de Mikelangelo Diaz
const mikelProfile = VENDOR_PROFILES['MIKELANGELO DIAZ'];
VENDOR_PROFILES['MIKELANGELODIAZ@GMAIL.COM'] = mikelProfile;
VENDOR_PROFILES['MIKELANGELO'] = mikelProfile;
VENDOR_PROFILES['MIKELANGELO DIAZ1'] = mikelProfile;
VENDOR_PROFILES['MIKELANGELO DIAZ - VILLA DEL ROS'] = mikelProfile;
VENDOR_PROFILES['MIKELANGELO DIAZ VILLA DEL ROS'] = mikelProfile;
VENDOR_PROFILES['MIKELANGELO VILLA DEL ROS'] = mikelProfile;
VENDOR_PROFILES['JOHNATAN SOTO'] = mikelProfile;
VENDOR_PROFILES['JOHNATAN SOTO VILLA DEL ROS'] = mikelProfile;
VENDOR_PROFILES['JOHNATAN'] = mikelProfile;
VENDOR_PROFILES['JONATHAN'] = mikelProfile;
VENDOR_PROFILES['JHONATAN'] = mikelProfile;
VENDOR_PROFILES['JAIDER MEDINA'] = VENDOR_PROFILES['JAIDER MEDINA - FOOD SERVICE NORTE'];

// Perfiles de Supervisores (Alí Pérez ya NO es vendedor, sino únicamente Supervisor de los 3 vendedores de su antigua ruta)
export const SUPERVISOR_PROFILES: Record<string, SupervisorProfile> = {
  'ALI PEREZ': {
    canonicalUsername: 'ALI PEREZ',
    displayName: 'Alí Pérez (Supervisor)',
    supervisedVendors: [
      'ANGEL NAVARRO',
      'MARIANGEL GONZALEZ',
      'VICTOR CAMPOS'
    ]
  }
};

export function getSupervisorProfile(username: string | null | undefined): SupervisorProfile | null {
  const norm = normalizeVendorName(username).replace(/^SUPERVISOR:/, '').trim();
  if (!norm) return null;
  if (SUPERVISOR_PROFILES[norm]) return SUPERVISOR_PROFILES[norm];
  const clean = normalizeAsciiKey(norm);
  for (const [k, sup] of Object.entries(SUPERVISOR_PROFILES)) {
    if (normalizeAsciiKey(k) === clean) return sup;
  }
  return null;
}

export function getSupervisedRoutes(supervisorUsername: string): AssignedRoute[] {
  const sup = getSupervisorProfile(supervisorUsername);
  if (!sup) return [];
  const routes: AssignedRoute[] = [];
  const seen = new Set<string>();
  sup.supervisedVendors.forEach((vKey) => {
    const prof = VENDOR_PROFILES[vKey];
    if (prof) {
      prof.routes.forEach((r) => {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          routes.push(r);
        }
      });
    }
  });
  return routes;
}

export function getSupervisedAliases(supervisorUsername: string): string[] {
  const sup = getSupervisorProfile(supervisorUsername);
  if (!sup) return [];
  const routes = getSupervisedRoutes(supervisorUsername);
  return Array.from(
    new Set([
      ...sup.supervisedVendors,
      ...routes.flatMap((r) => [r.id, ...r.aliases])
    ])
  );
}

/**
 * Compara de forma exacta y precisa si el nombre del vendedor en la hoja de cálculo
 * coincide con alguno de los alias asignados a la ruta, ignorando diferencias de espacios y guiones.
 */
export function matchesVendorAlias(aliases: string[], sheetVendor: string | null | undefined): boolean {
  const normSheet = normalizeVendorName(sheetVendor);
  if (!normSheet) return false;
  const cleanSheet = normalizeAsciiKey(normSheet);

  for (const a of aliases) {
    const normA = normalizeVendorName(a);
    if (!normA) continue;
    if (normSheet === normA) return true;
    const cleanA = normalizeAsciiKey(normA);
    if (cleanSheet && cleanSheet === cleanA) return true;
  }
  return false;
}

/**
 * Obtiene el perfil del vendedor logueado asegurando privacidad total.
 * Los vendedores NO tienen acceso a compañeros; su dashboard es personal.
 */
export function getVendorProfile(username: string): VendorProfile {
  const normUser = normalizeVendorName(username);
  if (VENDOR_PROFILES[normUser]) {
    return VENDOR_PROFILES[normUser];
  }
  // Búsqueda insensible a caracteres especiales, tildes y espacios
  const cleanUser = normalizeAsciiKey(normUser);
  for (const [key, prof] of Object.entries(VENDOR_PROFILES)) {
    if (normalizeAsciiKey(key) === cleanUser || normalizeAsciiKey(prof.displayName) === cleanUser) {
      return prof;
    }
  }
  // Si contiene MIKELANGELO o JOHNATAN o SOTO
  if (/MIKELANGELO|JOHNATAN|JONATHAN|JHONATAN|SOTO/.test(normUser)) {
    return VENDOR_PROFILES['MIKELANGELO DIAZ'];
  }
  // Fallback seguro: solo sus propias rutas homónimas
  return {
    canonicalUsername: normUser,
    displayName: normUser,
    routes: [
      { id: normUser, label: `Ruta ${normUser}`, aliases: [normUser] }
    ]
  };
}

/**
 * Obtiene las rutas asignadas que el usuario tiene permitido ver.
 * Si es ADMIN, puede auditar todas las rutas de la empresa.
 * Si es SUPERVISOR, ve las rutas de su equipo supervisado.
 * Si es VENDEDOR, ÚNICAMENTE ve las rutas que le pertenecen.
 */
export function getAllowedRoutesForUser(username: string, role: Role): AssignedRoute[] {
  if (role === 'ADMIN') {
    const map = new Map<string, AssignedRoute>();
    Object.values(VENDOR_PROFILES).forEach(profile => {
      profile.routes.forEach(r => {
        if (!map.has(r.id)) {
          map.set(r.id, r);
        }
      });
    });
    return Array.from(map.values());
  }

  if (role === 'SUPERVISOR') {
    return getSupervisedRoutes(username);
  }

  // Para vendedor: ESTRICTAMENTE SUS PROPIAS RUTAS ASIGNADAS
  const profile = getVendorProfile(username);
  return profile.routes;
}

/**
 * Verifica si un registro de la hoja de cálculo coincide con el filtro activo.
 * Garantiza de forma estricta que ningún vendedor acceda a perfiles de sus compañeros.
 */
export function isRouteMatch(
  sheetVendor: string | null | undefined,
  selectedRouteId: string,
  loggedInVendor: string,
  userRole: Role
): boolean {
  const normSheetVendor = normalizeVendorName(sheetVendor);
  if (!normSheetVendor) return false;
  // Nunca incluir la fila resumen de "ALI PEREZ" como si fuera un vendedor
  if (normSheetVendor === 'ALI PEREZ') return false;

  // Filtro por equipo de supervisor (ej. SUPERVISOR:ALI PEREZ)
  if (selectedRouteId.startsWith('SUPERVISOR:')) {
    const supName = selectedRouteId.slice('SUPERVISOR:'.length);
    const supAliases = getSupervisedAliases(supName);
    if (userRole === 'ADMIN') {
      return matchesVendorAlias(supAliases, normSheetVendor);
    }
    if (userRole === 'SUPERVISOR') {
      const mySup = getSupervisorProfile(loggedInVendor);
      if (mySup && matchesVendorAlias([mySup.canonicalUsername], supName)) {
        return matchesVendorAlias(supAliases, normSheetVendor);
      }
      return false;
    }
  }

  // 1. Acceso de Administrador
  if (userRole === 'ADMIN') {
    if (selectedRouteId === 'ADMIN') return true;
    
    // Si el admin seleccionó un vendedor consolidado (todas sus rutas)
    const isConsolidated = selectedRouteId.startsWith('CONSOLIDATED:');
    if (isConsolidated) {
      const rawTarget = selectedRouteId.replace(/^CONSOLIDATED:/, '');
      const profile = getVendorProfile(rawTarget);

      if (profile) {
        const allAliases = profile.routes.flatMap(r => r.aliases);
        return matchesVendorAlias(allAliases, normSheetVendor);
      }
    }

    // Si el admin seleccionó una ruta específica
    for (const p of Object.values(VENDOR_PROFILES)) {
      const found = p.routes.find(r => r.id === selectedRouteId || matchesVendorAlias([r.id, ...r.aliases], selectedRouteId));
      if (found) {
        return matchesVendorAlias(found.aliases, normSheetVendor);
      }
    }

    return matchesVendorAlias([selectedRouteId], normSheetVendor);
  }

  // 2. Acceso de SUPERVISOR (Equipo supervisado)
  if (userRole === 'SUPERVISOR') {
    const mySupAliases = getSupervisedAliases(loggedInVendor);
    const mySupRoutes = getSupervisedRoutes(loggedInVendor);
    if (selectedRouteId === 'SUPERVISOR_ALL' || selectedRouteId === 'ALL_MY_ROUTES') {
      return matchesVendorAlias(mySupAliases, normSheetVendor);
    }
    if (selectedRouteId.startsWith('CONSOLIDATED:')) {
      const rawTarget = selectedRouteId.replace(/^CONSOLIDATED:/, '');
      const sup = getSupervisorProfile(loggedInVendor);
      if (sup && sup.supervisedVendors.some(v => matchesVendorAlias([v], rawTarget))) {
        const prof = getVendorProfile(rawTarget);
        return matchesVendorAlias(prof.routes.flatMap(r => r.aliases), normSheetVendor);
      }
      return false;
    }
    const targetRoute = mySupRoutes.find(r => r.id === selectedRouteId || matchesVendorAlias([r.id, ...r.aliases], selectedRouteId));
    if (targetRoute) {
      return matchesVendorAlias(targetRoute.aliases, normSheetVendor);
    }
    return false;
  }

  // 3. Acceso de VENDEDOR (Personal y Restringido)
  const profile = getVendorProfile(loggedInVendor);
  const myAssignedRoutes = profile.routes;

  // Si seleccionó consolidado ("ALL_MY_ROUTES")
  if (selectedRouteId === 'ALL_MY_ROUTES') {
    const myAllAliases = myAssignedRoutes.flatMap(r => r.aliases);
    return matchesVendorAlias(myAllAliases, normSheetVendor);
  }

  // Si seleccionó una ruta específica de las que tiene asignadas
  const targetRoute = myAssignedRoutes.find(r => r.id === selectedRouteId || matchesVendorAlias([r.id, ...r.aliases], selectedRouteId));
  if (targetRoute) {
    return matchesVendorAlias(targetRoute.aliases, normSheetVendor);
  }

  // Por seguridad: si de alguna manera seleccionó una ruta ajena, se deniega totalmente
  return false;
}
