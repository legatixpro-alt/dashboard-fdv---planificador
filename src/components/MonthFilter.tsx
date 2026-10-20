import React from 'react';
import { CalendarRange, RotateCcw } from 'lucide-react';
import { MESES_CORTO } from '../lib/rubros';

export interface PeriodoMes {
  ano: number;
  mes: number;
}

/** Clave estable de un mes: "2026-3" (igual que usa el servidor). */
export const mesKey = (p: PeriodoMes) => `${p.ano}-${p.mes}`;
/** Clave reservada para el mes en curso (el que viene del Sheet en vivo). */
export const MES_ACTUAL_KEY = 'ACTUAL';

/**
 * Convierte la selección del filtro en lo que necesita cada consumidor.
 * selected vacío = sin filtro (todos los meses + mes actual).
 */
export function resolverSeleccionMeses(selected: string[]) {
  const filtroActivo = selected.length > 0;
  const showActual = !filtroActivo || selected.includes(MES_ACTUAL_KEY);
  const mesesHist = selected.filter((k) => k !== MES_ACTUAL_KEY);
  /** Parámetro para el servidor: [] = todos; ['none'] = ningún mes histórico. */
  const mesesParam = !filtroActivo ? [] : mesesHist.length > 0 ? mesesHist : ['none'];
  return { filtroActivo, showActual, mesesHist, mesesParam };
}

interface Props {
  periodos: PeriodoMes[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Muestra el chip "Mes actual" (para módulos que combinan histórico + mes en curso). */
  incluirActual?: boolean;
  className?: string;
}

export const MonthFilter: React.FC<Props> = ({ periodos, selected, onChange, incluirActual = true, className = '' }) => {
  const ordenados = [...periodos].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  const ultimos3 = ordenados.slice(-3).map(mesKey);
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-sans font-bold border transition-all cursor-pointer ${
      active
        ? 'bg-red-600 text-white border-red-500 shadow'
        : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-600'
    }`;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-400 mr-1">
        <CalendarRange className="w-3.5 h-3.5 text-red-500" /> Filtro de fechas:
      </span>
      <button type="button" onClick={() => onChange([])} className={chip(selected.length === 0)}>
        Todos
      </button>
      {ordenados.map((p) => {
        const k = mesKey(p);
        return (
          <button key={k} type="button" onClick={() => toggle(k)} className={chip(selected.includes(k))}>
            {MESES_CORTO[p.mes]} {String(p.ano).slice(-2)}
          </button>
        );
      })}
      {incluirActual && (
        <button type="button" onClick={() => toggle(MES_ACTUAL_KEY)} className={chip(selected.includes(MES_ACTUAL_KEY))}>
          Mes actual
        </button>
      )}
      {ultimos3.length > 0 && (
        <button
          type="button"
          onClick={() => onChange(ultimos3)}
          className="px-2.5 py-1 rounded-full text-[11px] font-sans font-bold border border-dashed border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
        >
          Últimos 3 meses
        </button>
      )}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-sans text-neutral-500 hover:text-white"
        >
          <RotateCcw className="w-3 h-3" /> Limpiar
        </button>
      )}
    </div>
  );
};
