import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckSquare, Square, Layers, Eraser } from 'lucide-react';
import { MESES_LARGO, RUBROS_ACTIVACION, RUBRO_LABEL, RubroCodigo } from '../lib/rubros';
import { Rubro360Data, fetchHistRubro360 } from '../services/historialService';
import { VolumenData } from '../types';
import { MonthFilter, PeriodoMes, resolverSeleccionMeses } from './MonthFilter';
import { Rubro360State, RubroDashboard360, getRubroTheme } from './RubroDashboard360';

export interface RubroStatsActual {
  meta: number;
  activados: number;
  faltante: number;
  cumplimiento: number;
  estCierre: number;
}

interface Props {
  rubrosSeleccionados: RubroCodigo[];
  onToggleRubro: (r: RubroCodigo) => void;
  onSetRubros: (rubros: RubroCodigo[]) => void;
  vendedorFilter: string;
  vendedorDisplayName: string;
  statsByRubro?: Partial<Record<RubroCodigo, RubroStatsActual>>;
  filteredVolumen?: VolumenData[];
  /** Muestra la barra de rubros (multi-selección) dentro del panel. */
  showRubroBar?: boolean;
}

const fmtInt = (n: number) => Math.round(n || 0).toLocaleString('es-VE');

/**
 * Consulta el historial 360° de varios rubros a la vez. Solo vuelve a consultar lo que cambió
 * (rubro nuevo, filtro de meses distinto o botón Sincronizar); el servidor cachea la base cruda.
 */
function useRubros360(rubros: RubroCodigo[], vendedor: string, mesesParam: string[], reloadTick: number) {
  const [states, setStates] = useState<Record<string, Rubro360State>>({});
  const fetched = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const keyOf = (r: RubroCodigo) => `${r}|${vendedor}|${mesesParam.join(',')}|${reloadTick}`;

  useEffect(() => {
    rubros.forEach((r) => {
      const k = keyOf(r);
      if (fetched.current.has(k)) return;
      fetched.current.add(k);
      setStates((s) => ({ ...s, [k]: { data: s[k]?.data ?? null, loading: true, error: null } }));
      fetchHistRubro360(r, vendedor, mesesParam)
        .then((data) => {
          if (mounted.current) setStates((s) => ({ ...s, [k]: { data, loading: false, error: null } }));
        })
        .catch((e: any) => {
          fetched.current.delete(k); // permite reintentar
          if (mounted.current)
            setStates((s) => ({
              ...s,
              [k]: { data: null, loading: false, error: e?.message || 'Error consultando el historial del rubro' }
            }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubros.join(','), vendedor, mesesParam.join(','), reloadTick]);

  return (r: RubroCodigo): Rubro360State => states[keyOf(r)] ?? { data: null, loading: true, error: null };
}

export const Rubro360Panel: React.FC<Props> = ({
  rubrosSeleccionados,
  onToggleRubro,
  onSetRubros,
  vendedorFilter,
  vendedorDisplayName,
  statsByRubro = {},
  filteredVolumen = [],
  showRubroBar = true
}) => {
  const [mesesSel, setMesesSel] = useState<string[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const { filtroActivo, showActual, mesesParam } = resolverSeleccionMeses(mesesSel);
  const getState = useRubros360(rubrosSeleccionados, vendedorFilter, mesesParam, reloadTick);

  // Meses disponibles para el filtro: siempre vienen completos desde el servidor
  const [periodosDisp, setPeriodosDisp] = useState<PeriodoMes[]>([]);
  useEffect(() => {
    for (const r of rubrosSeleccionados) {
      const d = getState(r).data;
      if (d && d.periodosDisponibles.length > 0) {
        setPeriodosDisp((prev) => (prev.length === d.periodosDisponibles.length ? prev : d.periodosDisponibles));
        break;
      }
    }
  });

  const cargados = rubrosSeleccionados
    .map((r) => ({ r, data: getState(r).data as Rubro360Data | null }))
    .filter((x): x is { r: RubroCodigo; data: Rubro360Data } => !!x.data);
  const comparar = cargados.length >= 2;
  const mesesComparados = comparar ? cargados[0].data.meses : [];

  const todosSeleccionados = RUBROS_ACTIVACION.every((r) => rubrosSeleccionados.includes(r));

  const actualDe = (r: RubroCodigo, d: Rubro360Data) => ({
    activados: statsByRubro[r]?.activados ?? d.activadosMesActual,
    meta: statsByRubro[r]?.meta ?? d.metaMesActual
  });

  return (
    <div className="space-y-4">
      {/* Barra de selección múltiple de rubros + filtro de fechas */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3">
        {showRubroBar && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-400 mr-1">
              Rubros tildados ({rubrosSeleccionados.length}):
            </span>
            {RUBROS_ACTIVACION.map((rCode) => {
              const active = rubrosSeleccionados.includes(rCode);
              const rTheme = getRubroTheme(rCode);
              const IconComp = rTheme.icon;
              return (
                <button
                  key={rCode}
                  type="button"
                  onClick={() => onToggleRubro(rCode)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-sans font-bold border transition-all cursor-pointer ${
                    active
                      ? `${rTheme.badgeCls} shadow-md ring-1 ring-white/10`
                      : 'bg-neutral-900/70 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  {active ? <CheckSquare className="w-3.5 h-3.5 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0 opacity-60" />}
                  <IconComp className="w-3.5 h-3.5 shrink-0" />
                  <span>{RUBRO_LABEL[rCode]}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onSetRubros(todosSeleccionados ? [] : [...RUBROS_ACTIVACION])}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-sans font-bold border border-dashed border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
            >
              {todosSeleccionados ? <Eraser className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              {todosSeleccionados ? 'Quitar todos' : 'Tildar los 5'}
            </button>
          </div>
        )}
        <MonthFilter periodos={periodosDisp} selected={mesesSel} onChange={setMesesSel} incluirActual />
        <p className="text-[10px] font-sans text-neutral-500">
          Perfil: <strong className="text-neutral-300">{vendedorDisplayName === 'ADMIN' ? 'GLOBAL (TODOS LOS VENDEDORES)' : vendedorDisplayName}</strong>
          {' · '}
          {filtroActivo ? 'Mostrando solo los meses seleccionados.' : 'Mostrando todo el historial disponible.'} Los datos provienen de las ventas reales
          sincronizadas; los meses sin información no se estiman.
        </p>
      </div>

      {/* Comparativo cuando hay 2 o más rubros tildados */}
      {comparar && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-500" />
            <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider">
              Comparativo de rubros tildados — clientes activados y KG por mes
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[640px]">
              <thead>
                <tr className="bg-neutral-900/80 border-b border-neutral-800 text-[10px] font-sans uppercase tracking-wider text-neutral-400">
                  <th className="p-3 font-bold text-white" rowSpan={2}>
                    Mes
                  </th>
                  {cargados.map(({ r }) => (
                    <th key={r} colSpan={2} className={`p-2 text-center border-l border-neutral-800 ${getRubroTheme(r).accentText}`}>
                      {RUBRO_LABEL[r]}
                    </th>
                  ))}
                </tr>
                <tr className="bg-neutral-900/60 border-b border-neutral-800 text-[10px] font-sans text-neutral-500 uppercase">
                  {cargados.map(({ r }) => (
                    <React.Fragment key={r}>
                      <th className="p-2 text-right border-l border-neutral-800">Clientes</th>
                      <th className="p-2 text-right">KG</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono">
                {mesesComparados.map((m) => (
                  <tr key={`${m.ano}-${m.mes}`} className="hover:bg-neutral-900/40">
                    <td className="p-3 font-sans font-bold text-white">
                      {MESES_LARGO[m.mes]} {m.ano}
                    </td>
                    {cargados.map(({ r, data }) => {
                      const dm = data.meses.find((x) => x.ano === m.ano && x.mes === m.mes);
                      return (
                        <React.Fragment key={r}>
                          <td className="p-3 text-right border-l border-neutral-800 text-emerald-400 font-bold">
                            {dm ? fmtInt(dm.clientesActivados) : '—'}
                            {dm && dm.meta !== null && <span className="text-[10px] text-neutral-500 font-normal"> / {fmtInt(dm.meta)}</span>}
                          </td>
                          <td className="p-3 text-right text-neutral-200">{dm ? fmtInt(dm.kgs) : '—'}</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
                {showActual && (
                  <tr className="bg-red-950/20 border-t-2 border-red-800/60">
                    <td className="p-3 font-sans font-extrabold text-amber-400">MES ACTUAL (EN CURSO)</td>
                    {cargados.map(({ r, data }) => {
                      const a = actualDe(r, data);
                      return (
                        <React.Fragment key={r}>
                          <td className="p-3 text-right border-l border-neutral-800 text-white font-bold">
                            {fmtInt(a.activados)}
                            {a.meta > 0 && <span className="text-[10px] text-neutral-400 font-normal"> / {fmtInt(a.meta)} meta</span>}
                          </td>
                          <td className="p-3 text-right text-neutral-500">—</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-900/90 border-t border-neutral-800 font-mono font-bold">
                  <td className="p-3 font-sans text-neutral-300 uppercase text-[11px]">Promedio mensual / Total KG</td>
                  {cargados.map(({ r, data }) => (
                    <React.Fragment key={r}>
                      <td className="p-3 text-right border-l border-neutral-800 text-emerald-400">
                        {data.resumen.promedioClientesMes.toLocaleString('es-VE', { maximumFractionDigits: 1 })} cli/m
                      </td>
                      <td className="p-3 text-right text-white">{fmtInt(data.resumen.totalKgsHistorico)}</td>
                    </React.Fragment>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-neutral-800 text-[10px] font-sans text-neutral-500">
            En cada celda de clientes, el valor tras “/” es la meta solicitada de ese mes cuando fue registrada (meses sin “/” = sin meta guardada).
          </div>
        </div>
      )}

      {/* Un dashboard 360° por cada rubro tildado */}
      {rubrosSeleccionados.map((r) => (
        <RubroDashboard360
          key={r}
          selectedRubro={r}
          state={getState(r)}
          onReload={() => setReloadTick((t) => t + 1)}
          onClose={() => onToggleRubro(r)}
          vendedorDisplayName={vendedorDisplayName}
          currentStats={statsByRubro[r]}
          filteredVolumen={filteredVolumen}
          showActual={showActual}
          filtroActivo={filtroActivo}
          defaultCollapsed={rubrosSeleccionados.length > 2}
        />
      ))}
    </div>
  );
};
