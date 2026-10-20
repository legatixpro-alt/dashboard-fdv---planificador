import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  Package,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  X
} from 'lucide-react';
import { MESES_CORTO, MESES_LARGO } from '../lib/rubros';
import { SerieVolumen, sumarSerie } from '../lib/volumenHistorial';
import { MES_ACTUAL_KEY, PeriodoMes, mesKey, resolverSeleccionMeses } from './MonthFilter';

export interface ItemVolumenSel {
  codigo: string;
  articulo: string;
  cuota: number;
  ejecutado: number;
  serie: SerieVolumen;
}

interface Props {
  items: ItemVolumenSel[];
  periodos: PeriodoMes[];
  mesesSel: string[];
  loading: boolean;
  error: string | null;
  vendedorDisplayName: string;
  onToggle: (codigo: string) => void;
  onClear: () => void;
}

type Metrica = 'kgs' | 'cajas';

const fmtInt = (n: number) => Math.round(n || 0).toLocaleString('es-VE');
const fmtDec = (n: number, d = 1) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

export const VolumenDashboard360: React.FC<Props> = ({ items, periodos, mesesSel, loading, error, vendedorDisplayName, onToggle, onClear }) => {
  const [metrica, setMetrica] = useState<Metrica>('kgs');
  const { filtroActivo, showActual, mesesHist } = resolverSeleccionMeses(mesesSel);

  const ordenados = useMemo(() => [...periodos].sort((a, b) => a.ano - b.ano || a.mes - b.mes), [periodos]);
  const visibles = useMemo(
    () => (filtroActivo ? ordenados.filter((p) => mesesHist.includes(mesKey(p))) : ordenados),
    [ordenados, filtroActivo, mesesHist]
  );
  const keysVisibles = visibles.map(mesKey);

  const unidad = metrica === 'kgs' ? 'KG' : 'cajas';

  // Totales por mes (suma de los productos tildados)
  const totalesMes = useMemo(
    () =>
      visibles.map((p) => {
        const k = mesKey(p);
        const valor = items.reduce((a, it) => a + (it.serie.porMes[k]?.[metrica] || 0), 0);
        return { p, k, valor: +valor.toFixed(2) };
      }),
    [visibles, items, metrica]
  );

  const totalHist = +totalesMes.reduce((a, m) => a + m.valor, 0).toFixed(2);
  const promedio = visibles.length > 0 ? totalHist / visibles.length : 0;
  const mejor = totalesMes.reduce<{ p: PeriodoMes; k: string; valor: number } | null>((b, m) => (!b || m.valor > b.valor ? m : b), null);

  // Tendencia: último mes visible vs el mes calendario inmediatamente anterior (si también está visible)
  const tendencia = useMemo(() => {
    if (totalesMes.length < 2) return null;
    const ult = totalesMes[totalesMes.length - 1];
    const pen = totalesMes[totalesMes.length - 2];
    const consecutivo = ult.p.ano * 12 + ult.p.mes - (pen.p.ano * 12 + pen.p.mes) === 1;
    if (!consecutivo || pen.valor <= 0) return null;
    return { pct: +(((ult.valor - pen.valor) / pen.valor) * 100).toFixed(1), de: pen.p, a: ult.p };
  }, [totalesMes]);

  const cuotaActual = items.reduce((a, it) => a + it.cuota, 0);
  const ejecutadoActual = items.reduce((a, it) => a + it.ejecutado, 0);

  const puntosGrafico = useMemo(() => {
    const pts = totalesMes.map((m) => ({
      key: m.k,
      label: `${MESES_CORTO[m.p.mes]} ${String(m.p.ano).slice(-2)}`,
      valor: m.valor,
      actual: false
    }));
    if (showActual && metrica === 'kgs') pts.push({ key: MES_ACTUAL_KEY, label: 'Actual', valor: ejecutadoActual, actual: true });
    return pts;
  }, [totalesMes, showActual, metrica, ejecutadoActual]);
  const maxGrafico = Math.max(1, ...puntosGrafico.map((p) => p.valor), metrica === 'kgs' && showActual ? cuotaActual : 0);

  return (
    <div className="bg-gradient-to-b from-red-950/20 via-neutral-950 to-neutral-950 border-2 border-red-700/50 rounded-2xl overflow-hidden shadow-2xl shadow-black/80">
      {/* Cabecera */}
      <div className="p-4 md:p-6 border-b border-neutral-800/80 bg-neutral-950/80 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-xl border bg-red-950/50 text-red-300 border-red-700/50 shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-red-600 text-white">
                  <Activity className="w-3 h-3" /> Dashboard 360° de Volumen
                </span>
                <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 rounded-full">
                  Perfil: <strong className="text-white">{vendedorDisplayName === 'ADMIN' ? 'GLOBAL (TODOS LOS VENDEDORES)' : vendedorDisplayName}</strong>
                </span>
              </div>
              <h2 className="text-lg md:text-2xl font-sans font-extrabold text-white tracking-tight uppercase">
                Evolución mes a mes — {items.length} {items.length === 1 ? 'producto tildado' : 'productos tildados'}
              </h2>
              <p className="text-xs text-neutral-400 font-sans mt-0.5">
                Volumen real vendido (KG y cajas) según las ventas históricas sincronizadas, más el avance del mes actual contra su cuota.
              </p>
            </div>
          </div>
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-red-950/60 text-neutral-300 hover:text-red-300 border border-neutral-800 hover:border-red-800/60 text-xs font-sans font-bold transition-colors self-start lg:self-center shrink-0"
          >
            <Trash2 className="w-4 h-4" /> Quitar todos
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it.codigo} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-[11px] font-sans text-neutral-200">
              <span className="max-w-[220px] truncate">{it.articulo}</span>
              <button onClick={() => onToggle(it.codigo)} title="Quitar" className="p-0.5 rounded-full hover:bg-red-900/60 text-neutral-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {loading && (
        <div className="p-10 flex items-center justify-center gap-3 text-neutral-400">
          <div className="w-6 h-6 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <span className="text-xs font-sans font-bold uppercase tracking-wider">Consultando historial real de ventas...</span>
        </div>
      )}
      {!loading && error && (
        <div className="m-4 p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="p-4 md:p-6 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-4">
              <div className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                Total {unidad} ({visibles.length} {visibles.length === 1 ? 'mes' : 'meses'})
              </div>
              <div className="text-2xl font-mono font-bold text-white">
                {fmtInt(totalHist)} <span className="text-xs font-sans text-neutral-400 font-normal">{unidad}</span>
              </div>
              <div className="text-[11px] font-mono text-neutral-400 mt-1">Prom. mensual: {fmtInt(promedio)} {unidad}</div>
            </div>
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-4">
              <div className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">Mejor mes</div>
              {mejor && mejor.valor > 0 ? (
                <>
                  <div className="text-2xl font-mono font-bold text-emerald-400">
                    {fmtInt(mejor.valor)} <span className="text-xs font-sans text-neutral-400 font-normal">{unidad}</span>
                  </div>
                  <div className="text-xs font-sans font-bold text-white mt-1">
                    {MESES_LARGO[mejor.p.mes]} {mejor.p.ano}
                  </div>
                </>
              ) : (
                <div className="text-xs text-neutral-500 py-3">Sin ventas en los meses visibles</div>
              )}
            </div>
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-4">
              <div className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">Tendencia último mes</div>
              {tendencia ? (
                <>
                  <div className={`text-2xl font-mono font-bold flex items-center gap-1.5 ${tendencia.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tendencia.pct >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    {tendencia.pct >= 0 ? '+' : ''}
                    {fmtDec(tendencia.pct, 1)}%
                  </div>
                  <div className="text-[11px] font-mono text-neutral-400 mt-1">
                    {MESES_CORTO[tendencia.a.mes]} vs {MESES_CORTO[tendencia.de.mes]}
                  </div>
                </>
              ) : (
                <div className="text-xs text-neutral-500 py-3">Requiere dos meses consecutivos visibles</div>
              )}
            </div>
            <div className="bg-amber-950/10 border border-amber-900/40 rounded-xl p-4">
              <div className="text-[10px] font-sans font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Mes actual vs cuota</span>
                <Target className="w-4 h-4" />
              </div>
              {showActual ? (
                <>
                  <div className="text-2xl font-mono font-bold text-white">
                    {fmtInt(ejecutadoActual)} <span className="text-xs font-sans text-neutral-400 font-normal">/ {fmtInt(cuotaActual)} KG</span>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-400 mt-1">
                    {cuotaActual > 0 ? `Cumplimiento: ${fmtDec((ejecutadoActual / cuotaActual) * 100, 1)}%` : 'Sin cuota registrada'}
                  </div>
                </>
              ) : (
                <div className="text-xs text-neutral-500 py-3">Mes actual fuera del filtro</div>
              )}
            </div>
          </div>

          {/* Gráfico */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-red-500" /> Volumen mensual de los productos tildados ({unidad})
              </h3>
              <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800 self-start sm:self-auto">
                {(
                  [
                    ['kgs', 'Kilogramos (KG)'],
                    ['cajas', 'Cajas']
                  ] as [Metrica, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setMetrica(k)}
                    className={`px-2.5 py-1 rounded text-[11px] font-sans font-bold transition-colors ${
                      metrica === k ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {puntosGrafico.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-500">No hay meses visibles con el filtro seleccionado.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-9 gap-2.5 items-end">
                {puntosGrafico.map((pt) => {
                  const h = Math.max(6, Math.min(100, Math.round((pt.valor / maxGrafico) * 100)));
                  return (
                    <div
                      key={pt.key}
                      className={`flex flex-col items-center p-2.5 rounded-xl border ${
                        pt.actual ? 'bg-red-950/20 border-red-700/60 ring-1 ring-red-500/30' : 'bg-neutral-900/40 border-neutral-800/80'
                      }`}
                    >
                      <div className="text-[11px] font-mono font-bold text-white mb-1 truncate w-full text-center">{fmtInt(pt.valor)}</div>
                      <div className="w-full h-24 bg-neutral-900 rounded-lg overflow-hidden flex items-end p-1 border border-neutral-800/60">
                        <div
                          className={`w-full rounded ${pt.actual ? 'bg-gradient-to-t from-red-600 to-amber-500' : 'bg-red-500'}`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <div className={`mt-2 text-[11px] font-sans font-bold uppercase ${pt.actual ? 'text-amber-400' : 'text-neutral-300'}`}>{pt.label}</div>
                      {pt.actual && cuotaActual > 0 && <div className="text-[10px] font-mono text-neutral-500">Cuota {fmtInt(cuotaActual)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tabla por producto */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800">
              <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-red-500" /> Detalle por producto — {unidad} por mes
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[760px]">
                <thead>
                  <tr className="bg-neutral-900/80 border-b border-neutral-800 text-[10px] font-sans text-neutral-400 uppercase tracking-wider">
                    <th className="p-3 font-bold text-white">Producto</th>
                    {visibles.map((p) => (
                      <th key={mesKey(p)} className="p-3 text-right">
                        {MESES_CORTO[p.mes]} {String(p.ano).slice(-2)}
                      </th>
                    ))}
                    <th className="p-3 text-right text-amber-400 bg-neutral-900">Total</th>
                    <th className="p-3 text-right">Prom./mes</th>
                    {showActual && <th className="p-3 text-right text-emerald-400 bg-emerald-950/20">Mes actual (KG)</th>}
                    {showActual && <th className="p-3 text-right">Cuota</th>}
                    {showActual && <th className="p-3 text-right">% Cumpl.</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/70 font-mono">
                  {items.map((it) => {
                    const sinHist = it.serie.criterio === 'NINGUNO';
                    const total = sumarSerie(it.serie, keysVisibles, metrica);
                    const cumpl = it.cuota > 0 ? (it.ejecutado / it.cuota) * 100 : null;
                    return (
                      <tr key={it.codigo} className="hover:bg-neutral-900/40 align-top">
                        <td className="p-3 font-sans min-w-[240px]">
                          <div className="font-bold text-white uppercase leading-tight">{it.articulo}</div>
                          <div className="text-[10px] text-neutral-500">Cód. {it.codigo || '—'}</div>
                          <div className={`text-[10px] mt-1 leading-snug ${sinHist ? 'text-amber-400' : it.serie.criterio === 'FAMILIA' ? 'text-sky-300' : 'text-emerald-400'}`}>
                            {it.serie.criterioTexto}
                          </div>
                          {it.serie.criterio === 'FAMILIA' && (
                            <details className="mt-1">
                              <summary className="text-[10px] text-neutral-400 cursor-pointer hover:text-white">
                                Ver los {it.serie.articulos.length} artículos sumados
                              </summary>
                              <ul className="mt-1 max-h-32 overflow-y-auto text-[10px] text-neutral-400 space-y-0.5">
                                {it.serie.articulos.map((a) => (
                                  <li key={a.sku}>
                                    #{a.sku} · {a.articulo}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        {visibles.map((p) => {
                          const v = sinHist ? 0 : it.serie.porMes[mesKey(p)]?.[metrica] || 0;
                          const cli = it.serie.porMes[mesKey(p)]?.clientes;
                          return (
                            <td key={mesKey(p)} className={`p-3 text-right ${v > 0 ? 'text-neutral-200 font-bold' : v < 0 ? 'text-amber-400' : 'text-neutral-700'}`}>
                              {sinHist ? '—' : v === 0 ? '·' : fmtDec(v, metrica === 'kgs' ? 0 : 1)}
                              {!sinHist && cli !== null && cli !== undefined && v !== 0 && <div className="text-[9px] text-neutral-500 font-normal">{cli} cli</div>}
                            </td>
                          );
                        })}
                        <td className="p-3 text-right font-bold text-amber-400 bg-neutral-900/40">{sinHist ? '—' : fmtDec(total, metrica === 'kgs' ? 0 : 1)}</td>
                        <td className="p-3 text-right text-neutral-300">
                          {sinHist || visibles.length === 0 ? '—' : fmtDec(total / visibles.length, metrica === 'kgs' ? 0 : 1)}
                        </td>
                        {showActual && <td className="p-3 text-right font-bold text-emerald-400 bg-emerald-950/10">{fmtDec(it.ejecutado, 0)}</td>}
                        {showActual && <td className="p-3 text-right text-neutral-400">{it.cuota > 0 ? fmtDec(it.cuota, 0) : '—'}</td>}
                        {showActual && (
                          <td className="p-3 text-right">
                            {cumpl === null ? (
                              <span className="text-neutral-700">—</span>
                            ) : (
                              <span className={`font-bold ${cumpl >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{fmtDec(cumpl, 1)}%</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-neutral-900/90 border-t border-neutral-800 font-mono font-bold">
                    <td className="p-3 font-sans text-neutral-300 uppercase text-[11px]">Total tildados</td>
                    {totalesMes.map((m) => (
                      <td key={m.k} className="p-3 text-right text-white">
                        {fmtDec(m.valor, metrica === 'kgs' ? 0 : 1)}
                      </td>
                    ))}
                    <td className="p-3 text-right text-amber-400">{fmtDec(totalHist, metrica === 'kgs' ? 0 : 1)}</td>
                    <td className="p-3 text-right text-neutral-300">{visibles.length > 0 ? fmtDec(promedio, metrica === 'kgs' ? 0 : 1) : '—'}</td>
                    {showActual && <td className="p-3 text-right text-emerald-400">{fmtDec(ejecutadoActual, 0)}</td>}
                    {showActual && <td className="p-3 text-right text-neutral-300">{cuotaActual > 0 ? fmtDec(cuotaActual, 0) : '—'}</td>}
                    {showActual && (
                      <td className="p-3 text-right text-neutral-300">{cuotaActual > 0 ? `${fmtDec((ejecutadoActual / cuotaActual) * 100, 1)}%` : '—'}</td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-neutral-800 bg-amber-950/10 text-[11px] font-sans text-amber-200/90 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                La cuota existe solo para el mes en curso: no hay cuota guardada de meses anteriores y no se estima. El volumen de cada mes histórico es el real
                vendido (facturas menos devoluciones). Las filas agrupadoras del Sheet se cruzan por nombre de artículo y se indica qué artículos se sumaron.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
