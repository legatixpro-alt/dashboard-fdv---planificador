import React, { useEffect, useState, useMemo } from 'react';
import { supabase, hasValidSupabaseConfig } from '../lib/supabase';
import { Clock, User, Copy, CheckCircle2, Search, RefreshCw, ShieldCheck, Activity, Users, Calendar, Filter } from 'lucide-react';
import { getMesLaboralInfo } from '../utils/calendar';

interface TrazabilidadRecord {
  id: string;
  usuario: string;
  rol: string;
  fecha_ingreso: string;
}

const SQL_SCRIPT = `CREATE TABLE trazabilidad_login (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario varchar(255) NOT NULL,
  rol varchar(50) NOT NULL,
  fecha_ingreso timestamp with time zone DEFAULT now()
);

ALTER TABLE trazabilidad_login ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir inserciones publicas en trazabilidad" ON trazabilidad_login FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir lectura publica en trazabilidad" ON trazabilidad_login FOR SELECT USING (true);`;

export function TrazabilidadTab() {
  const [logs, setLogs] = useState<TrazabilidadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'ADMIN' | 'VENDEDOR'>('ALL');
  const [filterMonth, setFilterMonth] = useState<'CURRENT_MONTH' | 'ALL'>('CURRENT_MONTH');

  const mesLaboral = useMemo(() => getMesLaboralInfo(), []);

  const handleCopy = () => {
    navigator.clipboard.writeText(SQL_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchLogs = async () => {
    setLoading(true);
    if (!hasValidSupabaseConfig) {
      setError('Supabase no está configurado.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: sbError } = await supabase
        .from('trazabilidad_login')
        .select('*')
        .order('fecha_ingreso', { ascending: false })
        .limit(150);

      if (sbError) {
        if (sbError.code === 'PGRST205') {
          setError('MISSING_TABLE');
        } else {
          setError(sbError.message);
        }
      } else {
        setLogs(data || []);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = log.usuario.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === 'ALL' || log.rol === filterRole;

      let matchesMonth = true;
      if (filterMonth === 'CURRENT_MONTH') {
        const d = new Date(log.fecha_ingreso);
        matchesMonth = d.getFullYear() === mesLaboral.year && d.getMonth() === mesLaboral.month;
      }

      return matchesSearch && matchesRole && matchesMonth;
    });
  }, [logs, searchTerm, filterRole, filterMonth, mesLaboral]);

  // Métricas calculadas para el mes laboral en curso
  const currentMonthLogs = useMemo(() => {
    return logs.filter(log => {
      const d = new Date(log.fecha_ingreso);
      return d.getFullYear() === mesLaboral.year && d.getMonth() === mesLaboral.month;
    });
  }, [logs, mesLaboral]);

  const uniqueUsersCount = useMemo(() => {
    return new Set(filteredLogs.map(l => l.usuario)).size;
  }, [filteredLogs]);

  const currentMonthUniqueUsers = useMemo(() => {
    return new Set(currentMonthLogs.map(l => l.usuario)).size;
  }, [currentMonthLogs]);

  const lastLogin = filteredLogs.length > 0 
    ? new Date(filteredLogs[0].fecha_ingreso).toLocaleString('es-VE') 
    : 'Sin registros';

  return (
    <div className="space-y-6">
      {/* Resumen Superior */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">
              {filterMonth === 'CURRENT_MONTH' ? `Ingresos ${mesLaboral.monthName} ${mesLaboral.year}` : 'Total Ingresos'}
            </p>
            <p className="text-2xl font-bold text-white mt-1">{filteredLogs.length}</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">Histórico total: {logs.length}</p>
          </div>
          <div className="p-3 bg-neutral-800 rounded-lg text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Usuarios Únicos</p>
            <p className="text-2xl font-bold text-white mt-1">{uniqueUsersCount}</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">{filterMonth === 'CURRENT_MONTH' ? `Activos en ${mesLaboral.monthName}` : 'Vendedores y Admin'}</p>
          </div>
          <div className="p-3 bg-neutral-800 rounded-lg text-blue-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Avance Mes Habil</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {mesLaboral.elapsedWorkingDays} / {mesLaboral.totalWorkingDays}d
            </p>
            <p className="text-[10px] text-neutral-500 mt-0.5">{mesLaboral.percentage}% transcurrido ({mesLaboral.remainingWorkingDays}d restantes)</p>
          </div>
          <div className="p-3 bg-neutral-800 rounded-lg text-amber-400">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Último Acceso</p>
            <p className="text-sm font-semibold text-white mt-1 truncate max-w-[180px]">{lastLogin}</p>
            <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Conexión en vivo
            </p>
          </div>
          <div className="p-3 bg-neutral-800 rounded-lg text-rose-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">Trazabilidad de Ingresos</h2>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Supabase Conectado
              </span>
            </div>
            <p className="text-sm text-neutral-400 mt-1">
              Registro auditado de inicios de sesión • Período: <strong className="text-white">{mesLaboral.monthName} {mesLaboral.year}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Selector de Período Mes */}
            <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800">
              <button
                onClick={() => setFilterMonth('CURRENT_MONTH')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  filterMonth === 'CURRENT_MONTH'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                {mesLaboral.monthName} {mesLaboral.year}
              </button>
              <button
                onClick={() => setFilterMonth('ALL')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  filterMonth === 'ALL'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Todos los tiempos
              </button>
            </div>

            <button 
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Filtros y Búsqueda */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-5">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Buscar por usuario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setFilterRole('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterRole === 'ALL'
                  ? 'bg-neutral-700 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              Todos ({filteredLogs.length})
            </button>
            <button
              onClick={() => setFilterRole('VENDEDOR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterRole === 'VENDEDOR'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              Vendedores ({filteredLogs.filter(l => l.rol === 'VENDEDOR').length})
            </button>
            <button
              onClick={() => setFilterRole('ADMIN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterRole === 'ADMIN'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              Admin ({filteredLogs.filter(l => l.rol === 'ADMIN').length})
            </button>
          </div>
        </div>

        {error === 'MISSING_TABLE' ? (
          <div className="bg-red-900/10 border border-red-500/20 p-6 rounded-xl mb-6">
            <h3 className="text-red-400 font-bold mb-2">Tabla no encontrada en Supabase</h3>
            <p className="text-neutral-300 text-sm mb-4">
              Copia el siguiente código SQL y ejecútalo en el <strong>SQL Editor</strong> de tu panel de Supabase:
            </p>
            <div className="relative">
              <pre className="bg-black border border-neutral-800 p-4 rounded-lg overflow-x-auto text-xs text-neutral-300 font-mono">
                {SQL_SCRIPT}
              </pre>
              <button 
                onClick={handleCopy}
                className="absolute top-3 right-3 p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md transition-colors"
                title="Copiar código SQL"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-500/20 p-4 rounded-lg mb-6">
            <p className="text-red-400 text-sm font-semibold">{error}</p>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-neutral-800/80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-950/60 border-b border-neutral-800">
                <th className="py-3 px-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">Fecha y Hora</th>
                <th className="py-3 px-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">Usuario</th>
                <th className="py-3 px-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">Rol Asignado</th>
                <th className="py-3 px-4 text-xs font-bold text-neutral-400 uppercase tracking-wider text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-neutral-500 text-sm">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      Cargando historial de trazabilidad...
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 && !error ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-neutral-500 text-sm">
                    {searchTerm ? 'No se encontraron registros para la búsqueda.' : 'No hay registros de ingreso todavía. Los nuevos ingresos aparecerán aquí automáticamente.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-neutral-800/40 hover:bg-neutral-800/20 transition-colors">
                    <td className="py-3 px-4 text-sm text-neutral-300 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-neutral-500" />
                        {new Date(log.fecha_ingreso).toLocaleString('es-VE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-white">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-neutral-500" />
                        <span className="tracking-wide">{log.usuario}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        log.rol === 'ADMIN' ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {log.rol === 'ADMIN' ? <ShieldCheck className="w-3.5 h-3.5" /> : null}
                        {log.rol}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Sesión Registrada
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
