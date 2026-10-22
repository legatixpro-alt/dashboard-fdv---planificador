import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  DollarSign,
  Droplets,
  Drumstick,
  Flame,
  Layers,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import {
  MESES_CORTO,
  MESES_LARGO,
  RUBRO_LABEL,
  RubroCodigo,
  clasificarRubro
} from '../lib/rubros';
import { EstadoClienteRubro360, Rubro360Data } from '../services/historialService';
import { VolumenData } from '../types';

export interface Rubro360State {
  data: Rubro360Data | null;
  loading: boolean;
  error: string | null;
}

interface Props {
  selectedRubro: RubroCodigo;
  /** Datos ya consultados por el contenedor (respetan el filtro de fechas aplicado). */
  state: Rubro360State;
  onReload: () => void;
  onClose: () => void;
  vendedorDisplayName: string;
  currentStats?: {
    meta: number;
    activados: number;
    faltante: number;
    cumplimiento: number;
    estCierre: number;
  };
  filteredVolumen?: VolumenData[];
  /** false cuando el filtro de fechas excluye el mes en curso. */
  showActual?: boolean;
  /** true si hay un filtro de meses aplicado. */
  filtroActivo?: boolean;
  defaultCollapsed?: boolean;
}

type SubTab360 = 'evolucion' | 'productos' | 'clientes';
type ChartMetric = 'clientes' | 'kgs' | 'cajas';
type SkuMetric = 'cajas' | 'kgs' | 'clientes';
type ClientFilter = 'TODOS' | 'OPORTUNIDAD_RECUPERACION' | 'ACTIVOS_ACTUAL' | 'HABITUALES' | 'SIN_HISTORIAL';

const fmtInt = (n: number) =>
  Math.round(n || 0).toLocaleString('es-VE');

const fmtDec = (n: number, d = 1) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

export const getRubroTheme = (rubro: RubroCodigo) => {
  switch (rubro) {
    case 'ACEITE':
      return {
        icon: Droplets,
        accentText: 'text-amber-400',
        accentBg: 'bg-amber-500',
        badgeCls: 'bg-amber-950/50 text-amber-300 border-amber-700/50',
        borderCls: 'border-amber-700/50',
        glowCls: 'from-amber-950/30 via-neutral-950 to-neutral-950'
      };
    case 'AZUCAR':
      return {
        icon: Flame,
        accentText: 'text-rose-400',
        accentBg: 'bg-rose-500',
        badgeCls: 'bg-rose-950/50 text-rose-300 border-rose-700/50',
        borderCls: 'border-rose-700/50',
        glowCls: 'from-rose-950/30 via-neutral-950 to-neutral-950'
      };
    case 'POLLO':
      return {
        icon: Drumstick,
        accentText: 'text-orange-400',
        accentBg: 'bg-orange-500',
        badgeCls: 'bg-orange-950/50 text-orange-300 border-orange-700/50',
        borderCls: 'border-orange-700/50',
        glowCls: 'from-orange-950/30 via-neutral-950 to-neutral-950'
      };
    case 'ESTANDAR_ASTURIAS':
      return {
        icon: Package,
        accentText: 'text-emerald-400',
        accentBg: 'bg-emerald-500',
        badgeCls: 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50',
        borderCls: 'border-emerald-700/50',
        glowCls: 'from-emerald-950/30 via-neutral-950 to-neutral-950'
      };
    case 'MORTADELA_SALPICAO':
      return {
        icon: Sparkles,
        accentText: 'text-cyan-400',
        accentBg: 'bg-cyan-500',
        badgeCls: 'bg-cyan-950/50 text-cyan-300 border-cyan-700/50',
        borderCls: 'border-cyan-700/50',
        glowCls: 'from-cyan-950/30 via-neutral-950 to-neutral-950'
      };
  }
};

export const RubroDashboard360: React.FC<Props> = ({
  selectedRubro,
  state,
  onReload,
  onClose,
  vendedorDisplayName,
  currentStats,
  filteredVolumen = [],
  showActual = true,
  filtroActivo = false,
  defaultCollapsed = false
}) => {
  const { data, loading, error } = state;
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  const [subTab, setSubTab] = useState<SubTab360>('evolucion');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('clientes');
  const [skuMetric, setSkuMetric] = useState<SkuMetric>('cajas');
  const [clientFilter, setClientFilter] = useState<ClientFilter>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const theme = getRubroTheme(selectedRubro);
  const RubroIcon = theme.icon;

  // Volumen del mes en curso para este rubro (desde filteredVolumen en vivo)
  const currentMonthVolumenBySku = useMemo(() => {
    const map = new Map<string, { sku: string; nombre: string; kgActual: number; metaKg: number }>();
    let totalKgActual = 0;
    (filteredVolumen || []).forEach((v: any) => {
      const cleanSku = String(v.sku || v.skuId || '').trim();
      const nombre = String(v.nombre || v.articulo || v.categoria || '').trim();
      const rub = clasificarRubro(cleanSku, nombre);
      if (rub === selectedRubro) {
        const prev = map.get(cleanSku);
        const kg = Number(v.realizado ?? v.ejecutadoKg ?? v.ejecutado ?? 0);
        const meta = Number(v.metaKg ?? v.meta ?? 0);
        totalKgActual += kg;
        map.set(cleanSku, {
          sku: cleanSku,
          nombre,
          kgActual: (prev?.kgActual || 0) + kg,
          metaKg: (prev?.metaKg || 0) + meta
        });
      }
    });
    return { bySku: map, totalKgActual };
  }, [filteredVolumen, selectedRubro]);

  const activadosActual = currentStats?.activados ?? data?.activadosMesActual ?? 0;
  const metaActual = currentStats?.meta ?? data?.metaMesActual ?? 0;
  const carteraTotal = data?.carteraTotal || 0;
  const pctActualCartera = carteraTotal > 0 ? +((activadosActual / carteraTotal) * 100).toFixed(1) : 0;

  // Datos para el gráfico de barras comparativo (Meses históricos + Mes actual)
  const chartPoints = useMemo(() => {
    if (!data) return [];
    const pts = data.meses.map((m) => {
      const val =
        chartMetric === 'clientes'
          ? m.clientesActivados
          : chartMetric === 'kgs'
          ? m.kgs
          : m.cajas;
      return {
        key: `${m.ano}-${m.mes}`,
        label: `${MESES_CORTO[m.mes]} ${String(m.ano).slice(-2)}`,
        fullLabel: `${MESES_LARGO[m.mes]} ${m.ano}`,
        value: val,
        subLabel:
          chartMetric === 'clientes'
            ? m.meta !== null
              ? `Meta ${fmtInt(m.meta)}`
              : `${m.porcentajeCartera}% cart.`
            : `${m.clientesActivados} cli`,
        variacionPct: m.variacionPct,
        isCurrent: false
      };
    });

    if (showActual && (chartMetric === 'clientes' || chartMetric === 'kgs')) {
      const currVal = chartMetric === 'clientes' ? activadosActual : currentMonthVolumenBySku.totalKgActual;
      const lastHist = data.meses.length > 0 ? data.meses[data.meses.length - 1] : null;
      const prevVal = lastHist ? (chartMetric === 'clientes' ? lastHist.clientesActivados : lastHist.kgs) : 0;
      const varPct = prevVal > 0 ? +(((currVal - prevVal) / prevVal) * 100).toFixed(1) : null;
      pts.push({
        key: 'ACTUAL',
        label: 'Actual',
        fullLabel: 'Mes en Curso (Actual)',
        value: currVal,
        subLabel: chartMetric === 'clientes' ? (metaActual > 0 ? `Meta: ${metaActual}` : `${pctActualCartera}% cart.`) : `${activadosActual} cli`,
        variacionPct: varPct,
        isCurrent: true
      });
    }
    return pts;
  }, [data, chartMetric, showActual, activadosActual, metaActual, pctActualCartera, currentMonthVolumenBySku.totalKgActual]);

  const maxChartVal = useMemo(() => {
    const m = Math.max(1, ...chartPoints.map((p) => p.value));
    if (chartMetric === 'clientes' && metaActual > m) return metaActual;
    return m;
  }, [chartPoints, chartMetric, metaActual]);

  const norm360 = (val: string) =>
    String(val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Filtrado de productos / SKUs
  const filteredSkus = useMemo(() => {
    if (!data) return [];
    const q = norm360(searchQuery);
    const qCode = q.replace(/^[#0\s]+/, '');
    return data.skus.filter(
      (s) =>
        !q ||
        norm360(s.articulo).includes(q) ||
        norm360(s.sku).includes(q) ||
        (qCode.length > 0 && norm360(s.sku).replace(/^[#0\s]+/, '').includes(qCode))
    );
  }, [data, searchQuery]);

  // Filtrado de clientes 360
  const filteredClientes = useMemo(() => {
    if (!data) return [];
    const q = norm360(searchQuery);
    const qCode = q.replace(/^[#0\s]+/, '');
    return data.clientes.filter((c) => {
      if (
        q &&
        !norm360(c.cliente).includes(q) &&
        !norm360(c.id).includes(q) &&
        !(qCode.length > 0 && norm360(c.id).replace(/^[#0\s]+/, '').includes(qCode)) &&
        !norm360(c.vendedor).includes(q)
      ) {
        return false;
      }
      switch (clientFilter) {
        case 'OPORTUNIDAD_RECUPERACION':
          return c.estado360 === 'OPORTUNIDAD_RECUPERACION';
        case 'ACTIVOS_ACTUAL':
          return c.activoMesActual;
        case 'HABITUALES':
          return c.mesesActivados >= umbralHabitual;
        case 'SIN_HISTORIAL':
          return c.estado360 === 'SIN_HISTORIAL';
        default:
          return true;
      }
    });
  }, [data, searchQuery, clientFilter]);

  const renderEstadoBadge = (estado: EstadoClienteRubro360) => {
    switch (estado) {
      case 'OPORTUNIDAD_RECUPERACION':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-amber-950/60 text-amber-300 border border-amber-700/50">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> Por Reactivar
          </span>
        );
      case 'REACTIVADO_ESTE_MES':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-700/50">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Reactivado
          </span>
        );
      case 'NUEVO_ESTE_MES':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-700/50">
            <Sparkles className="w-3 h-3 text-cyan-400" /> Nuevo este Mes
          </span>
        );
      case 'FUERA_CARTERA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-neutral-900 text-neutral-400 border border-neutral-700">
            Histórico (Fuera Cartera)
          </span>
        );
      case 'SIN_HISTORIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-red-950/40 text-red-400 border border-red-900/40">
            0 Meses (Sin Compra)
          </span>
        );
    }
  };

  // Cliente "habitual" = compró en al menos 3 meses (o en todos los meses visibles si el filtro muestra menos de 3)
  const umbralHabitual = Math.max(1, Math.min(3, data ? data.meses.length : 3));
  const diffVsPromedio = data ? +(activadosActual - data.resumen.promedioClientesMes).toFixed(1) : 0;

  return (
    <div className={`bg-gradient-to-b ${theme.glowCls} border-2 ${theme.borderCls} rounded-2xl overflow-hidden shadow-2xl shadow-black/80 transition-all`}>
      {/* TOP BAR: SELECTOR RÁPIDO DE RUBROS TILDADOS + CABECERA 360° */}
      <div className="p-4 md:p-6 border-b border-neutral-800/80 bg-neutral-950/80">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`p-3 rounded-xl border ${theme.badgeCls} shrink-0`}>
              <RubroIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-red-600 text-white">
                  <Activity className="w-3 h-3" /> Dashboard 360° Histórico
                </span>
                <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 rounded-full">
                  Perfil: <strong className="text-white">{vendedorDisplayName === 'ADMIN' ? 'GLOBAL (TODOS LOS VENDEDORES)' : vendedorDisplayName}</strong>
                </span>
                {data && (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-0.5 rounded-full">
                    Cartera: <strong>{fmtInt(data.carteraTotal)} clientes</strong>
                  </span>
                )}
              </div>
              <h2 className="text-lg md:text-2xl font-sans font-extrabold text-white tracking-tight uppercase flex items-center gap-2">
                Radiografía Histórica del Rubro: <span className={theme.accentText}>{RUBRO_LABEL[selectedRubro]}</span>
              </h2>
              <p className="text-xs text-neutral-400 font-sans mt-0.5">
                Evolución real mes a mes de clientes activados, meta solicitada, cajas, kilogramos, SKUs y matriz de reactivación de clientes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
            <button
              onClick={() => onReload()}
              title="Actualizar datos históricos"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-sans font-bold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-400' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expandir' : 'Contraer'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-sans font-bold transition-colors"
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              <span className="hidden sm:inline">{collapsed ? 'Expandir' : 'Contraer'}</span>
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-red-950/60 text-neutral-300 hover:text-red-300 border border-neutral-800 hover:border-red-800/60 text-xs font-sans font-bold transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Quitar</span>
            </button>
          </div>
        </div>

      </div>

      {/* ESTADO DE CARGA / ERROR */}
      {!collapsed && loading && (
        <div className="p-12 flex flex-col items-center justify-center gap-3 text-neutral-400">
          <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <span className="text-xs font-sans font-bold uppercase tracking-wider">
            Consultando historial real de {RUBRO_LABEL[selectedRubro]} en Supabase...
          </span>
        </div>
      )}

      {!collapsed && !loading && error && (
        <div className="p-6 m-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => onReload()}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {!collapsed && !loading && !error && data && (
        <div className="p-4 md:p-6 space-y-6">
          {/* FILA 1: 5 TARJETAS KPI EJECUTIVAS 360° */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* KPI 1: Activación Actual vs Promedio Histórico */}
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                <span>Activación Actual vs Hist.</span>
                <Users className={`w-4 h-4 ${theme.accentText}`} />
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-white">
                  {fmtInt(activadosActual)}
                  <span className="text-xs text-neutral-500 font-normal">
                    {' '}
                    / {metaActual > 0 ? `${fmtInt(metaActual)} meta` : `${fmtInt(carteraTotal)} cart.`}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-neutral-400">Prom. {data.resumen.totalMeses} {data.resumen.totalMeses === 1 ? "mes" : "meses"}:</span>
                  <strong className="text-white">{fmtDec(data.resumen.promedioClientesMes, 1)} cli/mes</strong>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px]">
                <span className="text-neutral-500">Vs Promedio:</span>
                <span
                  className={`font-mono font-bold flex items-center gap-0.5 ${
                    diffVsPromedio >= 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {diffVsPromedio >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {diffVsPromedio >= 0 ? `+${diffVsPromedio}` : diffVsPromedio} cli
                </span>
              </div>
            </div>

            {/* KPI 2: Récord Histórico de Activación */}
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                <span>Mejor Mes Histórico</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              {data.resumen.mejorMes ? (
                <>
                  <div>
                    <div className="text-2xl font-mono font-bold text-emerald-400">
                      {fmtInt(data.resumen.mejorMes.clientesActivados)}{' '}
                      <span className="text-xs font-sans text-neutral-400 font-normal">clientes</span>
                    </div>
                    <div className="text-xs font-sans font-bold text-white mt-1">
                      {MESES_LARGO[data.resumen.mejorMes.mes]} {data.resumen.mejorMes.ano}
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono text-neutral-400">
                    <span>{fmtDec(data.resumen.mejorMes.cajas, 0)} cajas</span>
                    <span className="text-neutral-300">{fmtDec(data.resumen.mejorMes.kgs, 0)} KG</span>
                  </div>
                </>
              ) : (
                <div className="text-xs text-neutral-500 py-4">Sin registros históricos</div>
              )}
            </div>

            {/* KPI 3: Volumen Histórico Acumulado (Cajas y KG) */}
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                <span>Volumen Histórico ({data.resumen.totalMeses}m)</span>
                <Package className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-white">
                  {fmtInt(data.resumen.totalKgsHistorico)}{' '}
                  <span className="text-xs font-sans text-neutral-400 font-normal">KG</span>
                </div>
                <div className="text-[11px] font-mono text-cyan-400 mt-1">
                  {fmtInt(data.resumen.totalCajasHistorico)} cajas acumuladas
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono">
                <span className="text-neutral-500">Prom. Mensual:</span>
                <span className="text-neutral-200 font-bold">{fmtInt(data.resumen.promedioKgsMes)} KG/mes</span>
              </div>
            </div>

            {/* KPI 4: Meta solicitada del mes actual vs activación */}
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                <span>Meta Mes Actual</span>
                <Target className="w-4 h-4 text-amber-400" />
              </div>
              {metaActual > 0 ? (
                <>
                  <div>
                    <div className="text-2xl font-mono font-bold text-amber-400">
                      {fmtInt(activadosActual)}
                      <span className="text-xs text-neutral-500 font-normal"> / {fmtInt(metaActual)} meta</span>
                    </div>
                    <div className="text-[11px] font-mono text-neutral-400 mt-1">
                      Cumplimiento: <strong className="text-white">{fmtDec((activadosActual / metaActual) * 100, 1)}%</strong>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Brecha:</span>
                    <span className={`font-bold ${activadosActual >= metaActual ? 'text-emerald-400' : 'text-red-400'}`}>
                      {activadosActual >= metaActual ? '¡Meta cumplida!' : `Faltan ${fmtInt(metaActual - activadosActual)} cli`}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-xs text-neutral-500 py-4">Sin meta registrada para el mes actual</div>
              )}
            </div>

            {/* KPI 5: Oportunidad de Recuperación / Reactivación */}
            <button
              type="button"
              onClick={() => {
                setSubTab('clientes');
                setClientFilter('OPORTUNIDAD_RECUPERACION');
              }}
              className="bg-amber-950/20 hover:bg-amber-950/35 border border-amber-800/50 rounded-xl p-4 flex flex-col justify-between text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between text-[10px] font-sans font-bold text-amber-400 uppercase tracking-wider mb-2 w-full">
                <span>Oportunidad Reactivación</span>
                <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-amber-300">
                  {fmtInt(data.resumen.oportunidadRecuperacion)}{' '}
                  <span className="text-xs font-sans text-amber-200/80 font-normal">clientes</span>
                </div>
                <div className="text-[11px] font-sans text-neutral-300 mt-1 leading-tight">
                  Compraron {RUBRO_LABEL[selectedRubro]} en meses previos y faltan este mes
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-amber-900/40 flex items-center justify-between text-[11px] font-mono w-full">
                <span className="text-emerald-400">Ya reactivados: {data.resumen.reactivadosEsteMes}</span>
                <span className="text-amber-300 underline font-sans font-bold">Ver listado →</span>
              </div>
            </button>
          </div>

          {/* NAVEGACIÓN DE VISTAS 360° */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
            <div className="flex flex-wrap gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              <button
                onClick={() => setSubTab('evolucion')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-sans font-bold transition-colors ${
                  subTab === 'evolucion'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>1. Evolución Mensual ({data.meses.length} Meses)</span>
              </button>
              <button
                onClick={() => setSubTab('productos')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-sans font-bold transition-colors ${
                  subTab === 'productos'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>2. Desglose por Producto / SKU ({data.skus.length})</span>
              </button>
              <button
                onClick={() => setSubTab('clientes')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-sans font-bold transition-colors ${
                  subTab === 'clientes'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>3. Matriz 360° de Clientes ({data.clientes.length})</span>
                {data.resumen.oportunidadRecuperacion > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-black font-mono font-extrabold">
                    {data.resumen.oportunidadRecuperacion} por activar
                  </span>
                )}
              </button>
            </div>

            {(subTab === 'productos' || subTab === 'clientes') && (
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={subTab === 'productos' ? 'Buscar SKU o artículo...' : 'Buscar cliente o código...'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-full pl-8 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-600"
                />
              </div>
            )}
          </div>

          {/* ============================================================
              VISTA 1: EVOLUCIÓN MENSUAL DE ACTIVACIÓN Y VENTAS
             ============================================================ */}
          {subTab === 'evolucion' && (
            <div className="space-y-5">
              {/* Gráfico Visual de Evolución Mes a Mes */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Calendar className={`w-4 h-4 ${theme.accentText}`} />
                      Curva Histórica Mensual — {RUBRO_LABEL[selectedRubro]}
                    </h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      {filtroActivo ? 'Comportamiento real de los meses seleccionados en el filtro de fechas.' : 'Comportamiento real mes a mes de todo el historial disponible, más el avance del mes actual.'}
                    </p>
                  </div>
                  <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800 self-start sm:self-auto">
                    {(
                      [
                        ['clientes', 'Clientes Activados'],
                        ['cajas', 'Cajas'],
                        ['kgs', 'Kilogramos (KG)']
                      ] as [ChartMetric, string][]
                    ).map(([mKey, mLabel]) => (
                      <button
                        key={mKey}
                        onClick={() => setChartMetric(mKey)}
                        className={`px-2.5 py-1 rounded text-[11px] font-sans font-bold transition-colors ${
                          chartMetric === mKey ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {mLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barras del Gráfico */}
                <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-9 gap-2.5 items-end pt-4 pb-2 min-h-[190px]">
                  {chartPoints.map((pt) => {
                    const heightPct = Math.max(6, Math.min(100, Math.round((pt.value / maxChartVal) * 100)));
                    const formattedValue =
                      chartMetric === 'clientes'
                        ? `${fmtInt(pt.value)} cli`
                        : `${fmtInt(pt.value)} ${chartMetric === 'kgs' ? 'kg' : 'cj'}`;

                    return (
                      <div
                        key={pt.key}
                        className={`flex flex-col items-center p-2.5 rounded-xl border transition-all ${
                          pt.isCurrent
                            ? 'bg-red-950/20 border-red-700/60 ring-1 ring-red-500/30'
                            : 'bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-700'
                        }`}
                      >
                        <div className="text-[11px] font-mono font-bold text-white mb-1 text-center truncate w-full">
                          {formattedValue}
                        </div>
                        {pt.variacionPct !== null && (
                          <div
                            className={`text-[9px] font-mono font-bold mb-1.5 ${
                              pt.variacionPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pt.variacionPct >= 0 ? `+${pt.variacionPct}%` : `${pt.variacionPct}%`}
                          </div>
                        )}
                        {pt.variacionPct === null && <div className="text-[9px] text-neutral-600 mb-1.5">—</div>}

                        <div className="w-full h-24 bg-neutral-900 rounded-lg overflow-hidden flex items-end p-1 border border-neutral-800/60">
                          <div
                            className={`w-full rounded transition-all duration-500 ${
                              pt.isCurrent ? 'bg-gradient-to-t from-red-600 to-amber-500' : theme.accentBg
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>

                        <div
                          className={`mt-2 text-[11px] font-sans font-bold uppercase tracking-wider ${
                            pt.isCurrent ? 'text-amber-400' : 'text-neutral-300'
                          }`}
                        >
                          {pt.label}
                        </div>
                        <div className="text-[10px] font-mono text-neutral-500">{pt.subLabel}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabla Mensual Detallada: Meta solicitada vs Activación */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider">
                    Meta Solicitada vs Activación por Mes — {RUBRO_LABEL[selectedRubro]}
                  </h3>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Base de Cartera Actual: <strong className="text-white">{fmtInt(carteraTotal)} clientes</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px] text-xs">
                    <thead>
                      <tr className="bg-neutral-900/80 border-b border-neutral-800 text-[10px] font-sans text-neutral-400 uppercase tracking-wider">
                        <th className="p-3 font-bold text-white">Mes / Período</th>
                        <th className="p-3 text-right text-amber-400">Meta Solicitada</th>
                        <th className="p-3 text-right text-emerald-400">Clientes Activados</th>
                        <th className="p-3 text-right">% Cumpl. Meta</th>
                        <th className="p-3 text-right">Brecha vs Meta</th>
                        <th className="p-3 text-right">% Cobertura Cartera</th>
                        <th className="p-3 text-right">Variación vs Mes Ant.</th>
                        <th className="p-3 text-right">Cajas Netas</th>
                        <th className="p-3 text-right">Volumen (KG)</th>
                        <th className="p-3 text-right">Prom. KG / Cli</th>
                        <th className="p-3 text-center">SKUs Activos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/70 font-mono">
                      {data.meses.map((m) => {
                        const isBest =
                          data.resumen.mejorMes &&
                          data.resumen.mejorMes.ano === m.ano &&
                          data.resumen.mejorMes.mes === m.mes &&
                          m.clientesActivados > 0;
                        const hasMeta = m.meta !== null && m.meta > 0;
                        const cumpl = hasMeta ? (m.clientesActivados / (m.meta as number)) * 100 : null;
                        const brecha = hasMeta ? (m.meta as number) - m.clientesActivados : null;
                        return (
                          <tr key={`${m.ano}-${m.mes}`} className="hover:bg-neutral-900/40 transition-colors">
                            <td className="p-3 font-sans font-bold text-white flex items-center gap-2">
                              <span>
                                {MESES_LARGO[m.mes]} {m.ano}
                              </span>
                              {isBest && (
                                <span className="px-1.5 py-0.5 text-[9px] rounded bg-emerald-950/70 text-emerald-300 border border-emerald-700/50 uppercase">
                                  Récord
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {hasMeta ? (
                                <span className="font-bold text-amber-400">{fmtInt(m.meta as number)} cli</span>
                              ) : (
                                <span className="text-[10px] font-sans text-neutral-600" title="No hay meta guardada para este mes">Sin meta registrada</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-bold text-emerald-400">
                              {fmtInt(m.clientesActivados)} <span className="text-[10px] text-neutral-500">cli</span>
                            </td>
                            <td className="p-3 text-right">
                              {cumpl !== null ? (
                                <span className={`font-bold ${cumpl >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{fmtDec(cumpl, 1)}%</span>
                              ) : (
                                <span className="text-neutral-700">—</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {brecha !== null ? (
                                brecha > 0 ? (
                                  <span className="font-bold text-red-400">Faltaron {fmtInt(brecha)}</span>
                                ) : (
                                  <span className="font-bold text-emerald-400">+{fmtInt(Math.abs(brecha))} sobre meta</span>
                                )
                              ) : (
                                <span className="text-neutral-700">—</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                <div className="w-16 bg-neutral-900 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                  <div
                                    className={`h-full rounded-full ${theme.accentBg}`}
                                    style={{ width: `${Math.min(100, m.porcentajeCartera)}%` }}
                                  />
                                </div>
                                <span className="text-white font-bold">{fmtDec(m.porcentajeCartera, 1)}%</span>
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {m.variacionClientes === null ? (
                                <span className="text-neutral-600">—</span>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 font-bold ${
                                    m.variacionClientes > 0
                                      ? 'text-emerald-400'
                                      : m.variacionClientes < 0
                                      ? 'text-rose-400'
                                      : 'text-neutral-400'
                                  }`}
                                >
                                  {m.variacionClientes > 0 ? `+${m.variacionClientes}` : m.variacionClientes} cli
                                  {m.variacionPct !== null && (
                                    <span className="text-[10px] opacity-80">
                                      ({m.variacionPct > 0 ? `+${m.variacionPct}%` : `${m.variacionPct}%`})
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right text-neutral-200">{fmtDec(m.cajas, 1)}</td>
                            <td className="p-3 text-right text-white font-bold">{fmtDec(m.kgs, 1)}</td>
                            <td className="p-3 text-right text-neutral-300">{fmtDec(m.kgsPorCliente, 1)} kg</td>
                            <td className="p-3 text-center text-neutral-400">{m.skusActivos}</td>
                          </tr>
                        );
                      })}

                      {/* FILA DESTACADA: AVANCE DEL MES ACTUAL */}
                      {showActual && (
                      <tr className="bg-red-950/20 border-t-2 border-red-800/60">
                        <td className="p-3 font-sans font-extrabold text-amber-400 flex items-center gap-2">
                          <Target className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span>MES ACTUAL (EN CURSO)</span>
                        </td>
                        <td className="p-3 text-right font-bold text-amber-400">
                          {metaActual > 0 ? `${fmtInt(metaActual)} cli` : <span className="text-[10px] font-sans text-neutral-500">Sin meta registrada</span>}
                        </td>
                        <td className="p-3 text-right font-bold text-white">
                          {fmtInt(activadosActual)} <span className="text-[10px] text-neutral-400">cli</span>
                        </td>
                        <td className="p-3 text-right font-bold text-amber-400">
                          {metaActual > 0 ? `${fmtDec((activadosActual / metaActual) * 100, 1)}%` : '—'}
                        </td>
                        <td className="p-3 text-right font-bold">
                          {metaActual > 0 ? (
                            activadosActual >= metaActual ? (
                              <span className="text-emerald-400">Meta cumplida</span>
                            ) : (
                              <span className="text-red-400">Faltan {fmtInt(metaActual - activadosActual)} cli</span>
                            )
                          ) : (
                            <span className="text-neutral-600">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-bold text-amber-400">{fmtDec(pctActualCartera, 1)}%</td>
                        <td className="p-3 text-right text-neutral-400">
                          {currentStats ? `Est. cierre ${currentStats.estCierre} cli` : '—'}
                        </td>
                        <td className="p-3 text-right text-neutral-400">—</td>
                        <td className="p-3 text-right font-bold text-white">
                          {fmtDec(currentMonthVolumenBySku.totalKgActual, 1)} kg
                        </td>
                        <td className="p-3 text-right text-neutral-300">
                          {activadosActual > 0
                            ? `${fmtDec(currentMonthVolumenBySku.totalKgActual / activadosActual, 1)} kg`
                            : '—'}
                        </td>
                        <td className="p-3 text-center text-neutral-300">{currentMonthVolumenBySku.bySku.size}</td>
                      </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-neutral-900/90 border-t border-neutral-800 font-mono font-bold text-xs">
                        <td className="p-3 font-sans text-neutral-300 uppercase">
                          TOTAL / PROMEDIO HISTÓRICO ({data.resumen.totalMeses} MESES)
                        </td>
                        <td className="p-3 text-right text-neutral-500">—</td>
                        <td className="p-3 text-right text-emerald-400">
                          Prom: {fmtDec(data.resumen.promedioClientesMes, 1)} cli/m
                        </td>
                        <td className="p-3 text-right text-neutral-500">—</td>
                        <td className="p-3 text-right text-neutral-500">—</td>
                        <td className="p-3 text-right text-neutral-300">
                          {carteraTotal > 0
                            ? `${fmtDec((data.resumen.promedioClientesMes / carteraTotal) * 100, 1)}% prom.`
                            : '—'}
                        </td>
                        <td className="p-3 text-right text-neutral-400">
                          {fmtInt(data.resumen.clientesUnicosHistorico)} cli únicos
                        </td>
                        <td className="p-3 text-right text-white">{fmtDec(data.resumen.totalCajasHistorico, 1)}</td>
                        <td className="p-3 text-right text-white">{fmtDec(data.resumen.totalKgsHistorico, 1)}</td>
                        <td className="p-3 text-right text-neutral-400">—</td>
                        <td className="p-3 text-center text-neutral-300">{data.skus.length} SKUs</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {data.meses.some((m) => m.meta === null) && (
                  <div className="px-4 py-3 border-t border-neutral-800 bg-amber-950/10 text-[11px] font-sans text-amber-200/90 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Sin meta registrada:</strong> el sistema solo conservaba la meta del mes en curso, por lo que no existe meta guardada para
                      los meses anteriores y no se muestra ningún valor estimado. La activación de esos meses sí es real (ventas históricas).
                      Desde ahora la meta de cada mes queda guardada y se verá aquí automáticamente.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================
              VISTA 2: HISTORIAL DE VENTAS POR PRODUCTO / SKU DEL RUBRO
             ============================================================ */}
          {subTab === 'productos' && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider">
                    Desglose Histórico por Producto / SKU — {RUBRO_LABEL[selectedRubro]}
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Todos los artículos que integran el rubro {RUBRO_LABEL[selectedRubro]} con su evolución mensual y avance del mes actual.
                  </p>
                </div>
                <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800 self-start sm:self-auto">
                  {(
                    [
                      ['cajas', 'Cajas'],
                      ['kgs', 'Kilogramos'],
                      ['clientes', 'Clientes']
                    ] as [SkuMetric, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setSkuMetric(k)}
                      className={`px-2.5 py-1 rounded text-[11px] font-sans font-bold transition-colors ${
                        skuMetric === k ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px] text-xs">
                  <thead>
                    <tr className="bg-neutral-900/80 border-b border-neutral-800 text-[10px] font-sans text-neutral-400 uppercase tracking-wider">
                      <th className="p-3 font-bold text-white">SKU</th>
                      <th className="p-3 font-bold text-white">Producto / Artículo</th>
                      <th className="p-3 text-center">Cli. Únicos</th>
                      {data.periodos.map((p) => (
                        <th key={`${p.ano}-${p.mes}`} className="p-3 text-right">
                          {MESES_CORTO[p.mes]}
                        </th>
                      ))}
                      <th className="p-3 text-right text-amber-400 bg-neutral-900">{filtroActivo ? 'Total (meses filtrados)' : 'Total Hist.'}</th>
                      {showActual && <th className="p-3 text-right text-emerald-400 bg-emerald-950/20">Mes Actual (KG)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70 font-mono">
                    {filteredSkus.length === 0 ? (
                      <tr>
                        <td colSpan={5 + data.periodos.length} className="p-8 text-center text-neutral-500 font-sans">
                          No se encontraron productos en este rubro para el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredSkus.map((s) => {
                        const normSku = s.sku.replace(/^0+/, '');
                        let currentSkuKg = 0;
                        currentMonthVolumenBySku.bySku.forEach((val, key) => {
                          if (key.replace(/^0+/, '') === normSku || val.nombre.toUpperCase() === s.articulo.toUpperCase()) {
                            currentSkuKg += val.kgActual;
                          }
                        });
                        const totalVal =
                          skuMetric === 'cajas'
                            ? fmtDec(s.totalCajas, 1)
                            : skuMetric === 'kgs'
                            ? fmtDec(s.totalKgs, 1)
                            : `${fmtInt(s.clientesUnicos)} cli`;

                        return (
                          <tr key={s.sku} className="hover:bg-neutral-900/40 transition-colors">
                            <td className="p-3 text-neutral-400">{s.sku}</td>
                            <td className="p-3 font-sans font-bold text-white">{s.articulo}</td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-[10px]">
                                {s.clientesUnicos} cli ({s.mesesActivos}m)
                              </span>
                            </td>
                            {data.periodos.map((p) => {
                              const pk = `${p.ano}-${p.mes}`;
                              const cell = s.porMes[pk];
                              const v = cell ? cell[skuMetric] : 0;
                              return (
                                <td
                                  key={pk}
                                  className={`p-3 text-right ${v > 0 ? 'text-neutral-200 font-bold' : 'text-neutral-700'}`}
                                >
                                  {v > 0 ? (skuMetric === 'clientes' ? fmtInt(v) : fmtDec(v, 1)) : '—'}
                                </td>
                              );
                            })}
                            <td className="p-3 text-right font-bold text-amber-400 bg-neutral-900/40">{totalVal}</td>
                            {showActual && (
                              <td className="p-3 text-right font-bold text-emerald-400 bg-emerald-950/10">
                                {currentSkuKg > 0 ? `${fmtDec(currentSkuKg, 1)} kg` : '—'}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================
              VISTA 3: MATRIZ 360° DE CLIENTES EN ESTE RUBRO
             ============================================================ */}
          {subTab === 'clientes' && (
            <div className="space-y-4">
              {/* Filtros Rápidos de Clientes */}
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['TODOS', `Todos (${data.clientes.length})`],
                    [
                      'OPORTUNIDAD_RECUPERACION',
                      `Por Reactivar (${data.resumen.oportunidadRecuperacion}) — Compraron antes y faltan este mes`
                    ],
                    [
                      'ACTIVOS_ACTUAL',
                      `Activados este Mes (${data.resumen.reactivadosEsteMes + data.resumen.nuevosEsteMes})`
                    ],
                    ['HABITUALES', `Habituales ≥${umbralHabitual} ${umbralHabitual === 1 ? 'Mes' : 'Meses'} (${data.resumen.clientesHabituales})`],
                    ['SIN_HISTORIAL', 'Sin Historial en el Rubro']
                  ] as [ClientFilter, string][]
                ).map(([fKey, fLabel]) => (
                  <button
                    key={fKey}
                    onClick={() => setClientFilter(fKey)}
                    className={`px-3 py-1.5 rounded-full text-xs font-sans font-bold border transition-all cursor-pointer ${
                      clientFilter === fKey
                        ? 'bg-red-600 text-white border-red-500 shadow'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    {fLabel}
                  </button>
                ))}
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider">
                      Historial de Activación por Cliente en {RUBRO_LABEL[selectedRubro]}
                    </h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Cada celda muestra las cajas compradas de {RUBRO_LABEL[selectedRubro]} en ese mes y su estado actual.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Mostrando <strong className="text-white">{filteredClientes.length}</strong> clientes
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[520px]">
                  <table className="w-full text-left border-collapse min-w-[960px] text-xs">
                    <thead className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800 text-[10px] font-sans text-neutral-400 uppercase tracking-wider">
                      <tr>
                        <th className="p-3 font-bold text-white">Código</th>
                        <th className="p-3 font-bold text-white">Cliente / Razón Social</th>
                        <th className="p-3 text-center">Estado 360°</th>
                        <th className="p-3 text-center">Frecuencia</th>
                        {data.periodos.map((p) => (
                          <th key={`${p.ano}-${p.mes}`} className="p-3 text-center">
                            {MESES_CORTO[p.mes]}
                          </th>
                        ))}
                        {showActual && <th className="p-3 text-center bg-neutral-950 text-amber-400">Mes Actual</th>}
                        <th className="p-3 text-right">{filtroActivo ? 'Cajas (filtro)' : 'Cajas Hist.'}</th>
                        <th className="p-3 text-right">{filtroActivo ? 'KG (filtro)' : 'KG Hist.'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/70 font-mono">
                      {filteredClientes.length === 0 ? (
                        <tr>
                          <td colSpan={7 + data.periodos.length} className="p-8 text-center text-neutral-500 font-sans">
                            No hay clientes que coincidan con el filtro seleccionado.
                          </td>
                        </tr>
                      ) : (
                        filteredClientes.slice(0, 250).map((c) => (
                          <tr key={c.id} className="hover:bg-neutral-900/40 transition-colors">
                            <td className="p-3 text-neutral-400 font-bold">#{c.id.replace(/^0+/, '') || c.id}</td>
                            <td className="p-3 font-sans">
                              <div className="font-bold text-white uppercase leading-tight">{c.cliente}</div>
                              <div className="text-[10px] text-neutral-500">{c.vendedor}</div>
                            </td>
                            <td className="p-3 text-center">{renderEstadoBadge(c.estado360)}</td>
                            <td className="p-3 text-center">
                              <span className="font-bold text-white">
                                {c.mesesActivados}/{c.totalMesesDisponibles}m
                              </span>
                              <span className="text-[10px] text-neutral-500 block">
                                {c.ultimoMesCompra
                                  ? `Últ: ${MESES_CORTO[c.ultimoMesCompra.mes]}`
                                  : 'Sin compra'}
                              </span>
                            </td>
                            {data.periodos.map((p) => {
                              const pk = `${p.ano}-${p.mes}`;
                              const cell = c.porMes[pk];
                              const active = cell && cell.activo;
                              return (
                                <td
                                  key={pk}
                                  title={
                                    active
                                      ? `${MESES_LARGO[p.mes]}: ${fmtDec(cell.cajas, 1)} cajas · ${fmtDec(cell.kgs, 1)} KG`
                                      : 'Sin compra en este mes'
                                  }
                                  className={`p-2.5 text-center ${
                                    active
                                      ? 'bg-emerald-950/30 text-emerald-300 font-bold'
                                      : 'text-neutral-700'
                                  }`}
                                >
                                  {active ? fmtDec(cell.cajas, 0) : '·'}
                                </td>
                              );
                            })}
                            {showActual && (
                            <td className="p-3 text-center bg-neutral-950/60">
                              {c.activoMesActual ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-400 text-[10px] font-sans font-bold">
                                  ACTIVO
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-red-950/40 border border-red-900/50 text-red-400 text-[10px] font-sans font-bold">
                                  PENDIENTE
                                </span>
                              )}
                            </td>
                            )}
                            <td className="p-3 text-right font-bold text-white">{fmtDec(c.totalCajas, 1)}</td>
                            <td className="p-3 text-right text-neutral-300">{fmtDec(c.totalKgs, 1)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredClientes.length > 250 && (
                  <div className="p-2.5 text-center text-[11px] font-sans text-neutral-500 border-t border-neutral-800">
                    Mostrando los primeros 250 de {filteredClientes.length} clientes. Usa el buscador para filtrar un cliente específico.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
