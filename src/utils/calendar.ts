/**
 * Utilidad de cálculo de días hábiles laborales para el mes en curso.
 * Por defecto en Venezuela se labora de Lunes a Sábado (6 días a la semana, descansando Domingo).
 */

export interface MesLaboralInfo {
  year: number;
  month: number;
  monthName: string;
  totalWorkingDays: number;
  elapsedWorkingDays: number;
  remainingWorkingDays: number;
  percentage: number;
  currentDay: number;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function getMesLaboralInfo(referenceDate: Date = new Date()): MesLaboralInfo {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentDay = referenceDate.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let totalWorkingDays = 0;
  let elapsedWorkingDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    // 0 es Domingo. Días hábiles = Lunes a Sábado (1 al 6)
    if (date.getDay() !== 0) {
      totalWorkingDays++;
      if (day <= currentDay) {
        elapsedWorkingDays++;
      }
    }
  }

  // Asegurar límites coherentes
  elapsedWorkingDays = Math.min(elapsedWorkingDays, totalWorkingDays);
  const remainingWorkingDays = Math.max(0, totalWorkingDays - elapsedWorkingDays);
  const percentage = totalWorkingDays > 0 ? Math.round((elapsedWorkingDays / totalWorkingDays) * 100) : 0;

  return {
    year,
    month,
    monthName: MONTH_NAMES[month],
    totalWorkingDays,
    elapsedWorkingDays,
    remainingWorkingDays,
    percentage,
    currentDay
  };
}
