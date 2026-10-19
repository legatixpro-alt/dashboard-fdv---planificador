import React, { useEffect, useMemo, useState } from 'react';
import { History, X, Search, Loader2, AlertTriangle, ChevronDown, ChevronUp, Check, Minus } from 'lucide-react';
import {
  fetchHistMeta, fetchHistVolumen, fetchHistRubros, fetchHistClientes, fetchHistCliente,
  HistorialError, HistVolumenRow, HistRubroMes, HistClienteRow, HistClienteDetalle, HistPeriodo
} from '../services/historialService';
import { RUBROS_CLAVE, RUBRO_LABEL, RubroCodigo } from '../lib/rubros';

export type HistVista = 'volumen' | 'rubros' | 'clientes';

interface Props {
  /** Vista que se abre por defecto según el módulo desde el que se invoca. */
  vistaInicial: HistVista;
  /** Ruta/vendedor activo tal como lo maneja App (el servidor valida el alcance real con el JWT). */
  vendedor?: string;
}

const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MES_LARGO = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pkey = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;
const plabel = (ano: number, mes: number) => `${MES[mes]} ${String(ano).slice(2)}`;
const fmt = (n: number | undefined | null, d = 0) => {
  const val = Number(n);
  if (isNaN(val)) return '0';
  return val.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

const TABS: { id: HistVista; label: string }[] = [
  { id: 'volumen', label: 'Productos / Volumen' },
  { id: 'rubros', label: 'Activación por rubro' },
  { id: 'clientes', label: 'Activación por cliente' }
];

function useAsync<T>(loader: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: HistorialError | Error | null }>({ loading: true, data: null, error: null });
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    loader()
      .then(data => alive && setState({ loading: false, data, error: null }))
      .catch(error => alive && setState({ loading: false, data: null, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const Status: React.FC<{ loading: boolean; error: Error | null; empty?: boolean }> = ({ loading, error, empty }) => {
  if (loading) return (
    <div className="flex items-center justify-center gap-2 p-10 text-neutral-400 text-xs font-bold uppercase tracking-wider">
      <Loader2 className="w-4 h-4 animate-spin" /> Cargando historial...
    </div>
  );
  if (error) return (
    <div className="m-4 p-4 rounded-xl bg-amber-950/40 border border-amber-900 text-amber-300 text-xs flex gap-2 items-start">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error.message}</span>
    </div>
  );
  if (empty) return <div className="p-10 text-center text-neutral-500 text-xs">Sin datos para este vendedor / período.</div>;
  return null;
};

/* ───────────────────────── 1. VOLUMEN POR PRODUCTO ───────────────────────── */
const VistaVolumen: React.FC<{ vendedor?: string }> = ({ vendedor }) => {
  const { loading, data, error } = useAsync(() => fetchHistVolumen(vendedor), [vendedor]);
  const [metric, setMetric] = useState<'kgs' | 'cajas' | 'monto'>('kgs');
  const [rubro, setRubro] = useState<'TODOS' | RubroCodigo>('TODOS');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);

  const { periodos, filas, totales } = useMemo(() => {
    const rows: HistVolumenRow[] = data?.rows || [];
    const ps = new Map<string, HistPeriodo>();
    rows.forEach(r => ps.set(pkey(r.ano, r.mes), { ano: r.ano, mes: r.mes }));
    const periodos = [...ps.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes);

    const term = q.trim().toLowerCase();
    const by = new Map<string, { sku: string; articulo: string; rubro: string; v: Record<string, number>; total: number }>();
    const totales: Record<string, number> = {};
    rows.forEach(r => {
      if (rubro !== 'TODOS' && r.rubro !== rubro) return;
      if (term && !(r.articulo.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term))) return;
      const val = r[metric];
      const k = pkey(r.ano, r.mes);
      let f = by.get(r.sku);
      if (!f) { f = { sku: r.sku, articulo: r.articulo, rubro: r.rubro, v: {}, total: 0 }; by.set(r.sku, f); }
      f.v[k] = (f.v[k] || 0) + val;
      f.total += val;
      totales[k] = (totales[k] || 0) + val;
    });
    return { periodos, filas: [...by.values()].sort((a, b) => b.total - a.total), totales };
  }, [data, metric, rubro, q]);

  const dec = metric === 'monto' ? 0 : 0;
  const unidad = metric === 'kgs' ? 'KG' : metric === 'cajas' ? 'Cajas' : 'Monto';
  const maxTot = Math.max(1, ...Object.values(totales).map(Math.abs));

  return (
    <div>
      <Status loading={loading} error={error} empty={!loading && !error && (data?.rows.length ?? 0) === 0} />
      {data && data.rows.length > 0 && (
        <>
          <div className="p-3 flex flex-wrap gap-2 items-center border-b border-neutral-800">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }} placeholder="Buscar producto o código..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 pl-8 pr-3 text-xs text-white focus:border-red-500 focus:outline-none" />
            </div>
            <div className="flex rounded-lg overflow-hidden border border-neutral-800 text-[11px] font-bold">
              {(['kgs', 'cajas', 'monto'] as const).map(m => (
                <button key={m} onClick={() => setMetric(m)}
                  className={`px-3 py-2 ${metric === m ? 'bg-red-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'}`}>
                  {m === 'kgs' ? 'KG' : m === 'cajas' ? 'Cajas' : 'Monto'}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 flex flex-wrap gap-1.5 border-b border-neutral-800">
            {(['TODOS', ...RUBROS_CLAVE.map(r => r.codigo), 'OTROS'] as const).map(c => (
              <button key={c} onClick={() => { setRubro(c as any); setLimit(60); }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${rubro === c ? 'bg-red-600 border-red-600 text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}>
                {c === 'TODOS' ? 'Todos' : RUBRO_LABEL[c as RubroCodigo]}
              </button>
            ))}
          </div>

          <div className="p-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(periodos.length, 1)}, minmax(0, 1fr))` }}>
            {periodos.map(p => {
              const k = pkey(p.ano, p.mes); const t = totales[k] || 0;
              return (
                <div key={k} className="text-center">
                  <div className="h-14 flex items-end justify-center">
                    <div className="w-full max-w-[34px] bg-red-600/80 rounded-t" style={{ height: `${Math.max(3, (Math.abs(t) / maxTot) * 100)}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-white mt-1">{fmt(t, dec)}</div>
                  <div className="text-[9px] text-neutral-500 uppercase">{plabel(p.ano, p.mes)}</div>
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-neutral-500 border-y border-neutral-800 bg-neutral-900/60">
                  <th className="text-left p-2 pl-3 sticky left-0 bg-neutral-900">Producto ({unidad})</th>
                  {periodos.map(p => <th key={pkey(p.ano, p.mes)} className="text-right p-2">{plabel(p.ano, p.mes)}</th>)}
                  <th className="text-right p-2 pr-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, limit).map(f => (
                  <tr key={f.sku} className="border-b border-neutral-900 hover:bg-neutral-900/50">
                    <td className="p-2 pl-3 sticky left-0 bg-neutral-950 max-w-[260px]">
                      <div className="text-white truncate">{f.articulo}</div>
                      <div className="text-[10px] text-neutral-500">#{f.sku} · {RUBRO_LABEL[f.rubro as RubroCodigo] || f.rubro}</div>
                    </td>
                    {periodos.map(p => {
                      const val = f.v[pkey(p.ano, p.mes)] || 0;
                      return <td key={pkey(p.ano, p.mes)} className={`p-2 text-right font-mono ${val < 0 ? 'text-amber-400' : val === 0 ? 'text-neutral-700' : 'text-neutral-200'}`}>{val === 0 ? '·' : fmt(val, dec)}</td>;
                    })}
                    <td className="p-2 pr-3 text-right font-mono font-bold text-emerald-400">{fmt(f.total, dec)}</td>
                  </tr>
                ))}
                {filas.length === 0 && <tr><td colSpan={periodos.length + 2} className="p-6 text-center text-neutral-500">Sin resultados.</td></tr>}
              </tbody>
            </table>
          </div>
          {filas.length > limit && (
            <button onClick={() => setLimit(l => l + 100)} className="w-full p-3 text-xs font-bold text-neutral-400 hover:text-white">
              Mostrar más ({filas.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
};

/* ───────────────────────── 2. ACTIVACIÓN POR RUBRO ───────────────────────── */
const VistaRubros: React.FC<{ vendedor?: string }> = ({ vendedor }) => {
  const { loading, data, error } = useAsync(() => fetchHistRubros(vendedor), [vendedor]);
  const meses: HistRubroMes[] = data?.meses || [];
  const cartera = data?.cartera || 0;
  const pct = (n: number) => (cartera > 0 ? Math.min(100, (n / cartera) * 100) : 0);
  const claves = RUBROS_CLAVE.map(r => r.codigo as string);

  return (
    <div>
      <Status loading={loading} error={error} empty={!loading && !error && meses.length === 0} />
      {meses.length > 0 && (
        <>
          <div className="p-3 text-[11px] text-neutral-400 border-b border-neutral-800">
            Clientes activos por rubro en cada mes sobre la <strong className="text-white">cartera actual ({fmt(cartera)} clientes)</strong>.
            Un cliente cuenta como activo si compró (cajas netas &gt; 0) algún artículo del rubro en ese mes.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-neutral-500 border-b border-neutral-800 bg-neutral-900/60">
                  <th className="text-left p-2 pl-3 sticky left-0 bg-neutral-900">Rubro</th>
                  {meses.map(m => <th key={pkey(m.ano, m.mes)} className="text-right p-2">{plabel(m.ano, m.mes)}</th>)}
                </tr>
              </thead>
              <tbody>
                {RUBROS_CLAVE.map(r => (
                  <tr key={r.codigo} className="border-b border-neutral-900">
                    <td className="p-2 pl-3 sticky left-0 bg-neutral-950 text-white font-bold">{r.label}</td>
                    {meses.map(m => {
                      const n = m.activos[r.codigo] || 0;
                      return (
                        <td key={pkey(m.ano, m.mes)} className="p-2 text-right">
                          <div className="font-mono text-white">{fmt(n)} <span className="text-neutral-500">({pct(n).toFixed(0)}%)</span></div>
                          <div className="text-[10px] font-mono text-neutral-500">{fmt(m.kgs[r.codigo] || 0)} kg</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-neutral-900/60 border-b border-neutral-800">
                  <td className="p-2 pl-3 sticky left-0 bg-neutral-900 text-emerald-400 font-bold">Activos (≥1 rubro clave)</td>
                  {meses.map(m => (
                    <td key={pkey(m.ano, m.mes)} className="p-2 text-right font-mono text-emerald-400 font-bold">
                      {fmt(m.activos.TOTAL || 0)} <span className="text-emerald-700">({pct(m.activos.TOTAL || 0).toFixed(0)}%)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 pl-3 sticky left-0 bg-neutral-950 text-neutral-500">Total kg rubros clave</td>
                  {meses.map(m => (
                    <td key={pkey(m.ano, m.mes)} className="p-2 text-right font-mono text-neutral-400">
                      {fmt(claves.reduce((a, c) => a + (m.kgs[c] || 0), 0))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 pl-3 sticky left-0 bg-neutral-950 text-neutral-500">Clientes fuera de cartera</td>
                  {meses.map(m => <td key={pkey(m.ano, m.mes)} className="p-2 text-right font-mono text-neutral-600">{fmt(m.fueraCartera)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/* ───────────────────────── 3. ACTIVACIÓN POR CLIENTE ───────────────────────── */
const Dot: React.FC<{ on: boolean }> = ({ on }) =>
  on ? <Check className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <Minus className="w-3.5 h-3.5 text-neutral-700 mx-auto" />;

const DetalleCliente: React.FC<{ id: string; vendedor?: string }> = ({ id, vendedor }) => {
  const { loading, data, error } = useAsync<HistClienteDetalle>(() => fetchHistCliente(id, vendedor), [id, vendedor]);
  const top = useMemo(() => {
    const m = new Map<string, { sku: string; articulo: string; rubro: string; kgs: number; monto: number; meses: Set<string> }>();
    (data?.productos || []).forEach(p => {
      let t = m.get(p.sku);
      if (!t) { t = { sku: p.sku, articulo: p.articulo, rubro: p.rubro, kgs: 0, monto: 0, meses: new Set() }; m.set(p.sku, t); }
      t.kgs += p.kgs; t.monto += p.monto; if (p.cajas > 0) t.meses.add(pkey(p.ano, p.mes));
    });
    return [...m.values()].sort((a, b) => b.monto - a.monto).slice(0, 12);
  }, [data]);

  return (
    <div className="bg-neutral-900/60 border-t border-neutral-800 p-3">
      <Status loading={loading} error={error} empty={!loading && !error && (data?.meses.length ?? 0) === 0} />
      {data && data.meses.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="overflow-x-auto">
            <div className="text-[10px] uppercase text-neutral-500 font-bold mb-1">Rubros clave por mes</div>
            <table className="w-full text-[11px]">
              <thead><tr className="text-neutral-500">
                <th className="text-left p-1">Mes</th>
                {RUBROS_CLAVE.map(r => <th key={r.codigo} className="p-1 text-center" title={r.label}>{r.label.split(' ')[0]}</th>)}
                <th className="p-1 text-right">Kg</th>
              </tr></thead>
              <tbody>
                {data.meses.map(m => (
                  <tr key={pkey(m.ano, m.mes)} className="border-t border-neutral-800">
                    <td className="p-1 text-white">{plabel(m.ano, m.mes)}</td>
                    {RUBROS_CLAVE.map(r => <td key={r.codigo} className="p-1"><Dot on={(m.cajas[r.codigo] || 0) > 0} /></td>)}
                    <td className="p-1 text-right font-mono text-neutral-300">{fmt(m.kgs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500 font-bold mb-1">Productos que más compra (acumulado)</div>
            <ul className="space-y-1">
              {top.map(t => (
                <li key={t.sku} className="flex justify-between gap-2 text-[11px] border-b border-neutral-800 pb-1">
                  <span className="text-neutral-200 truncate">{t.articulo} <span className="text-neutral-600">· {t.meses.size} mes(es)</span></span>
                  <span className="font-mono text-emerald-400 shrink-0">{fmt(t.kgs)} kg</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

const VistaClientes: React.FC<{ vendedor?: string }> = ({ vendedor }) => {
  const meta = useAsync(() => fetchHistMeta(), []);
  const periodos = meta.data?.periodos || [];
  const [sel, setSel] = useState<string>('');
  useEffect(() => {
    if (!sel && periodos.length) { const l = periodos[periodos.length - 1]; setSel(pkey(l.ano, l.mes)); }
  }, [periodos, sel]);
  const [ano, mes] = sel ? sel.split('-').map(Number) : [0, 0];

  const { loading, data, error } = useAsync(
    () => (ano && mes ? fetchHistClientes(ano, mes, vendedor) : Promise.resolve({ rows: [] as HistClienteRow[] })),
    [ano, mes, vendedor]
  );
  const [q, setQ] = useState('');
  const [soloCartera, setSoloCartera] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(80);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.rows || [])
      .filter(r => (!soloCartera || r.enCartera) &&
        (!term || r.cliente.toLowerCase().includes(term) || r.id.toLowerCase().includes(term) || (r.vendedor || '').toLowerCase().includes(term)))
      .sort((a, b) => b.kgs - a.kgs);
  }, [data, q, soloCartera]);

  const nActivos = rows.filter(r => RUBROS_CLAVE.some(k => (r.cajas[k.codigo] || 0) > 0)).length;

  return (
    <div>
      <Status loading={meta.loading} error={meta.error} />
      {!meta.loading && !meta.error && (
        <>
          <div className="p-3 flex flex-wrap gap-2 items-center border-b border-neutral-800">
            <select value={sel} onChange={e => { setSel(e.target.value); setOpen(null); setLimit(80); }}
              className="bg-neutral-900 border border-neutral-800 rounded-lg py-2 px-3 text-xs text-white focus:border-red-500 focus:outline-none">
              {periodos.map(p => <option key={pkey(p.ano, p.mes)} value={pkey(p.ano, p.mes)}>{MES_LARGO[p.mes]} {p.ano}</option>)}
            </select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={e => { setQ(e.target.value); setLimit(80); }} placeholder="Buscar cliente, código o vendedor..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 pl-8 pr-3 text-xs text-white focus:border-red-500 focus:outline-none" />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer">
              <input type="checkbox" checked={soloCartera} onChange={e => setSoloCartera(e.target.checked)} className="accent-red-600" />
              Solo mi cartera
            </label>
          </div>
          <div className="px-3 py-2 text-[11px] text-neutral-400 border-b border-neutral-800">
            {fmt(rows.length)} clientes con compra · <strong className="text-emerald-400">{fmt(nActivos)}</strong> activos en ≥1 rubro clave
          </div>
          <Status loading={loading} error={error} empty={!loading && !error && rows.length === 0} />
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-neutral-500 border-b border-neutral-800 bg-neutral-900/60">
                    <th className="text-left p-2 pl-3">Cliente</th>
                    {RUBROS_CLAVE.map(r => <th key={r.codigo} className="p-2 text-center" title={r.label}>{r.label.split(' ')[0]}</th>)}
                    <th className="text-right p-2">Kg</th>
                    <th className="text-right p-2 pr-3">Monto</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map(r => (
                    <React.Fragment key={r.id}>
                      <tr className="border-b border-neutral-900 hover:bg-neutral-900/50 cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        <td className="p-2 pl-3 max-w-[260px]">
                          <div className="text-white truncate">{r.cliente}</div>
                          <div className="text-[10px] text-neutral-500 truncate">#{r.id} · {r.vendedor}{!r.enCartera && ' · fuera de cartera'}</div>
                        </td>
                        {RUBROS_CLAVE.map(k => <td key={k.codigo} className="p-2"><Dot on={(r.cajas[k.codigo] || 0) > 0} /></td>)}
                        <td className="p-2 text-right font-mono text-neutral-200">{fmt(r.kgs)}</td>
                        <td className="p-2 pr-3 text-right font-mono text-emerald-400">{fmt(r.monto)}</td>
                        <td className="pr-2 text-neutral-500">{open === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</td>
                      </tr>
                      {open === r.id && (
                        <tr><td colSpan={RUBROS_CLAVE.length + 4} className="p-0"><DetalleCliente id={r.id} vendedor={vendedor} /></td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {rows.length > limit && (
                <button onClick={() => setLimit(l => l + 100)} className="w-full p-3 text-xs font-bold text-neutral-400 hover:text-white">
                  Mostrar más ({rows.length - limit} restantes)
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ───────────────────────── Contenedor ───────────────────────── */
export const HistorialSection: React.FC<Props> = ({ vistaInicial, vendedor }) => {
  const [open, setOpen] = useState(false);
  const [vista, setVista] = useState<HistVista>(vistaInicial);

  return (
    <div className="border border-neutral-800 rounded-2xl bg-neutral-950 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-900/60 transition-colors">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-200">
          <History className="w-4 h-4 text-red-500" />
          Consultar historial de meses anteriores
        </span>
        <span className="text-[10px] text-neutral-500 flex items-center gap-1">
          {open ? <>Cerrar <X className="w-3.5 h-3.5" /></> : <>Ver evolución por producto, rubro y cliente <ChevronDown className="w-3.5 h-3.5" /></>}
        </span>
      </button>
      {open && (
        <div className="border-t border-neutral-800">
          <div className="flex overflow-x-auto border-b border-neutral-800">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setVista(t.id)}
                className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${vista === t.id ? 'text-red-500 border-b-2 border-red-500' : 'text-neutral-500 hover:text-neutral-300'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {vista === 'volumen' && <VistaVolumen vendedor={vendedor} />}
          {vista === 'rubros' && <VistaRubros vendedor={vendedor} />}
          {vista === 'clientes' && <VistaClientes vendedor={vendedor} />}
        </div>
      )}
    </div>
  );
};

export default HistorialSection;
