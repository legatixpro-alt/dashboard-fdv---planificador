import React, { useMemo } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { getMesLaboralInfo } from '../utils/calendar';

interface RecorridoMesProps {
  onSync?: () => void;
  loading?: boolean;
}

export const RecorridoMes: React.FC<RecorridoMesProps> = ({ onSync, loading }) => {
  const { monthName, year, elapsed, remaining, total, percentage } = useMemo(() => {
    const info = getMesLaboralInfo();
    return {
      monthName: info.monthName,
      year: info.year,
      total: info.totalWorkingDays,
      elapsed: info.elapsedWorkingDays,
      remaining: info.remainingWorkingDays,
      percentage: info.percentage
    };
  }, []);

  return (
    <div className="border border-neutral-800 bg-neutral-950 rounded-xl p-5 mb-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
            <Calendar className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-white font-sans font-bold text-lg uppercase tracking-wide">
              Recorrido Mes: <span className="text-red-500">{monthName} {year}</span>
            </h2>
            <p className="text-neutral-500 font-sans text-xs">Seguimiento de días laborables en curso</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm font-sans font-medium text-emerald-500/80 bg-emerald-950/20 border border-emerald-900/30 px-4 py-3 min-h-[44px] rounded-lg w-full md:w-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Sincronización Automática
        </div>
      </div>
      
      {/* Progress Bar Area */}
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-2 gap-1">
          <span className="text-[11px] font-sans text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Avance Calendario Laboral
          </span>
          <span className="text-emerald-400 font-mono text-xl font-bold tracking-tight">
            {percentage}% <span className="text-[11px] font-sans text-neutral-500 font-normal ml-1">Hábil Transcurrido</span>
          </span>
        </div>
        <div className="w-full bg-neutral-900 rounded-full h-3 mb-2 border border-neutral-800 overflow-hidden">
          <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
        </div>
        <div className="flex flex-col sm:flex-row justify-between text-xs font-mono text-neutral-400 mt-3 gap-1">
          <span>Días Transcurridos: <strong className="text-white">{elapsed}d</strong></span>
          <span>Días Restantes: <strong className="text-amber-400">{remaining}d</strong></span>
          <span>Total Hábiles Mes: <strong className="text-emerald-400">{total}d</strong></span>
        </div>
      </div>
    </div>
  );
};
