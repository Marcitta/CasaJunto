/**
 * CasaJunto - Date and Time Utilities
 * Centraliza e padroniza a manipulação de datas, horas e timezones.
 */

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Retorna a data no formato YYYY-MM-DD no fuso horário da família.
 * Evita bugs de corte UTC meia-noite.
 */
export function getFamilyLocalDate(timezone: string = DEFAULT_TIMEZONE, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Retorna a data atual no formato YYYY-MM-DD (ISO date string)
 */
export function getTodayDateString(date: Date = new Date(), timezone: string = DEFAULT_TIMEZONE): string {
  return getFamilyLocalDate(timezone, date);
}

/**
 * Adiciona ou subtrai dias de uma data YYYY-MM-DD em modo UTC neutro
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retorna o dia da semana para uma data YYYY-MM-DD (0 = Domingo .. 6 = Sábado)
 */
export function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.getUTCDay();
}

/**
 * Retorna o último dia do mês (1-indexed month: 1=Jan, 2=Fev, etc.)
 */
export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Ajusta o dia do mês para não estourar o mês alvo (ex: 31 em Fevereiro -> 28 ou 29)
 */
export function clampDayOfMonth(year: number, month: number, targetDay: number): number {
  const maxDay = getLastDayOfMonth(year, month);
  return Math.min(Math.max(1, targetDay), maxDay);
}

/**
 * Gera a lista de datas YYYY-MM-DD correspondente ao horizonte deslizante (ex: 15 dias)
 */
export function getRollingDateHorizon(startDateStr: string, horizonDays: number = 15): string[] {
  const dates: string[] = [];
  for (let i = 0; i < horizonDays; i++) {
    dates.push(addDaysToDate(startDateStr, i));
  }
  return dates;
}

/**
 * Converte string de hora (HH:mm) para minutos desde o início do dia
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Converte minutos do dia para string HH:mm
 */
export function minutesToTimeString(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Adiciona minutos a uma string de hora HH:mm e retorna a nova string HH:mm
 */
export function addMinutesToTimeString(timeStr: string, minutesToAdd: number): string {
  const currentMinutes = timeStringToMinutes(timeStr);
  return minutesToTimeString(currentMinutes + minutesToAdd);
}

/**
 * Verifica se dois intervalos de horário se sobrepõem no mesmo dia
 */
export function isTimeOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const startAMin = timeStringToMinutes(startA);
  let endAMin = timeStringToMinutes(endA);
  if (endAMin < startAMin) endAMin += 24 * 60; // cruza a meia-noite

  const startBMin = timeStringToMinutes(startB);
  let endBMin = timeStringToMinutes(endB);
  if (endBMin < startBMin) endBMin += 24 * 60; // cruza a meia-noite

  return startAMin < endBMin && endAMin > startBMin;
}

/**
 * Calcula a diferença em dias entre duas datas no formato YYYY-MM-DD
 */
export function getDaysDifference(dateA: string, dateB: string): number {
  const [yA, mA, dA] = dateA.split('-').map(Number);
  const [yB, mB, dB] = dateB.split('-').map(Number);
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  return Math.floor((utcA - utcB) / (1000 * 60 * 60 * 24));
}
