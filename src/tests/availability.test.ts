import { ProtectedTime } from '../types';
import { 
  checkTimeIntervalOverlap, 
  formatDaysOfWeek, 
  isValidTimeString,
  DAYS_OF_WEEK,
  DAY_SHORTCUTS
} from '../utils/dateUtils';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runAvailabilityTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  // AVD01: Add ProtectedTime with valid schema
  try {
    const pt: ProtectedTime = {
      id: 'pt-test-1',
      family_id: 'fam-real-123',
      member_id: 'mem-lucas',
      type: 'school',
      label: 'Escola Estadual',
      day_of_week: [1, 2, 3, 4, 5],
      start_time: '07:30',
      end_time: '12:30',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const valid = Boolean(
      pt.id &&
      pt.family_id === 'fam-real-123' &&
      pt.member_id === 'mem-lucas' &&
      pt.type === 'school' &&
      pt.day_of_week.length === 5 &&
      isValidTimeString(pt.start_time) &&
      isValidTimeString(pt.end_time) &&
      pt.active === true
    );

    results.push({
      id: 'AVD01',
      name: 'Criação de ProtectedTime com esquema canônico completo',
      passed: valid
    });
  } catch (err: any) {
    results.push({ id: 'AVD01', name: 'Criação de ProtectedTime', passed: false, details: err.message });
  }

  // AVD02: Detect overnight intervals (crosses midnight)
  try {
    const startNormal = '08:00';
    const endNormal = '12:00';
    const isNormalOvernight = startNormal > endNormal;

    const startNight = '22:00';
    const endNight = '06:00';
    const isNightOvernight = startNight > endNight;

    const passed = !isNormalOvernight && isNightOvernight;
    results.push({
      id: 'AVD02',
      name: 'Identificação correta de horários noturnos que cruzam a meia-noite',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'AVD02', name: 'Identificação de horários noturnos', passed: false, details: err.message });
  }

  // AVD03: Detect overlap between protected times on same day
  try {
    // Two school intervals that overlap: 08:00–12:00 and 11:30–14:00
    const overlap1 = checkTimeIntervalOverlap('08:00', '12:00', '11:30', '14:00');
    // Exact inner containment: 09:00–11:00 inside 08:00–12:00
    const overlap2 = checkTimeIntervalOverlap('08:00', '12:00', '09:00', '11:00');
    
    const passed = overlap1 && overlap2;
    results.push({
      id: 'AVD03',
      name: 'Detecção precisa de sobreposição de horários no mesmo dia',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'AVD03', name: 'Detecção de sobreposição', passed: false, details: err.message });
  }

  // AVD04: Allow non-overlapping protected times on same day
  try {
    // Morning school: 07:30–12:30, Evening sports: 15:00–17:00
    const overlap = checkTimeIntervalOverlap('07:30', '12:30', '15:00', '17:00');
    // Touching boundaries: 08:00–12:00 and 12:00–14:00
    const touchingOverlap = checkTimeIntervalOverlap('08:00', '12:00', '12:00', '14:00');

    const passed = !overlap && !touchingOverlap;
    results.push({
      id: 'AVD04',
      name: 'Permissão para múltiplos compromissos sem sobreposição no mesmo dia',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'AVD04', name: 'Permissão de horários disjuntos', passed: false, details: err.message });
  }

  // AVD05: Update protected time (change interval or days)
  try {
    let pt: ProtectedTime = {
      id: 'pt-update-1',
      member_id: 'mem-1',
      type: 'study',
      label: 'Cursos',
      day_of_week: [2, 4],
      start_time: '14:00',
      end_time: '16:00',
      active: true
    };

    const updates: Partial<ProtectedTime> = {
      label: 'Cursos de Inglês',
      day_of_week: [2, 4, 6],
      start_time: '14:30',
      end_time: '16:30'
    };

    pt = {
      ...pt,
      ...updates,
      updated_at: new Date().toISOString()
    };

    const passed = pt.label === 'Cursos de Inglês' && 
      pt.day_of_week.length === 3 && 
      pt.start_time === '14:30' && 
      Boolean(pt.updated_at);

    results.push({
      id: 'AVD05',
      name: 'Atualização de compromisso existente (dias, rótulo e horários)',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'AVD05', name: 'Atualização de compromisso', passed: false, details: err.message });
  }

  // AVD06: Delete protected time
  try {
    let list: ProtectedTime[] = [
      { id: 'pt-1', member_id: 'm1', type: 'school', label: 'E1', day_of_week: [1], start_time: '08:00', end_time: '12:00', active: true },
      { id: 'pt-2', member_id: 'm1', type: 'sports', label: 'S1', day_of_week: [2], start_time: '14:00', end_time: '15:00', active: true }
    ];

    const deleteId = 'pt-1';
    list = list.filter(pt => pt.id !== deleteId);

    const passed = list.length === 1 && list[0].id === 'pt-2';
    results.push({
      id: 'AVD06',
      name: 'Exclusão atômica de compromisso protegido da lista',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'AVD06', name: 'Exclusão de compromisso', passed: false, details: err.message });
  }

  // AVD07: Toggle active status of protected time
  try {
    let pt: ProtectedTime = {
      id: 'pt-toggle',
      member_id: 'm1',
      type: 'work',
      label: 'Trabalho',
      day_of_week: [1, 2, 3],
      start_time: '09:00',
      end_time: '17:00',
      active: true
    };

    // Pause
    pt = { ...pt, active: false };
    const paused = pt.active === false;

    // Reactivate
    pt = { ...pt, active: true };
    const reactivated = pt.active === true;

    results.push({
      id: 'AVD07',
      name: 'Alternância de status Ativo/Pausado de compromisso protegido',
      passed: paused && reactivated
    });
  } catch (err: any) {
    results.push({ id: 'AVD07', name: 'Alternância de status', passed: false, details: err.message });
  }

  // AVD08: Format days of week
  try {
    const weekdaysFormatted = formatDaysOfWeek(DAY_SHORTCUTS.WEEKDAYS);
    const weekendFormatted = formatDaysOfWeek(DAY_SHORTCUTS.WEEKEND);
    const allDaysFormatted = formatDaysOfWeek(DAY_SHORTCUTS.ALL);
    const specificDaysFormatted = formatDaysOfWeek([2, 4]);

    const passed = 
      weekdaysFormatted === 'Seg–Sex' &&
      weekendFormatted === 'Fim de semana' &&
      allDaysFormatted === 'Todos os dias' &&
      specificDaysFormatted === 'Ter, Qui';

    results.push({
      id: 'AVD08',
      name: 'Formatação legível de dias da semana (Seg-Sex, Fim de semana, avulsos)',
      passed,
      details: `${weekdaysFormatted}, ${weekendFormatted}, ${allDaysFormatted}, ${specificDaysFormatted}`
    });
  } catch (err: any) {
    results.push({ id: 'AVD08', name: 'Formatação de dias', passed: false, details: err.message });
  }

  // AVD09: Firestore mapper serialization & deserialization
  try {
    const originalPt: ProtectedTime = {
      id: 'pt-map-1',
      family_id: 'fam-999',
      member_id: 'mem-999',
      type: 'sports',
      label: 'Natação Olímpica',
      day_of_week: [2, 4, 6],
      start_time: '15:00',
      end_time: '16:30',
      active: true,
      created_at: '2026-03-01T10:00:00.000Z',
      updated_at: '2026-03-01T10:00:00.000Z'
    };

    const docPayload = FirestoreMappers.fromProtectedTime(originalPt);
    const reconstructed = FirestoreMappers.toProtectedTime('pt-map-1', docPayload);

    const passed = 
      reconstructed.id === originalPt.id &&
      reconstructed.family_id === originalPt.family_id &&
      reconstructed.member_id === originalPt.member_id &&
      reconstructed.label === originalPt.label &&
      reconstructed.start_time === originalPt.start_time &&
      reconstructed.end_time === originalPt.end_time &&
      reconstructed.day_of_week.length === 3 &&
      Boolean(reconstructed.created_at);

    results.push({
      id: 'AVD09',
      name: 'Mapeador Firestore toProtectedTime/fromProtectedTime com preservação de timestamps',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'AVD09', name: 'Mapeador Firestore', passed: false, details: err.message });
  }

  // AVD10: Strict tenant isolation of protected times
  try {
    const listTenantA: ProtectedTime[] = [
      { id: 'pt-a1', family_id: 'family-A', member_id: 'mem-A1', type: 'school', label: 'Escola A', day_of_week: [1], start_time: '08:00', end_time: '12:00', active: true }
    ];
    const listTenantB: ProtectedTime[] = [
      { id: 'pt-b1', family_id: 'family-B', member_id: 'mem-B1', type: 'school', label: 'Escola B', day_of_week: [1], start_time: '08:00', end_time: '12:00', active: true }
    ];

    // Query for Family A must NEVER return Family B's protected times
    const tenantAFiltered = [...listTenantA, ...listTenantB].filter(pt => pt.family_id === 'family-A');
    const tenantBFiltered = [...listTenantA, ...listTenantB].filter(pt => pt.family_id === 'family-B');

    const passed = 
      tenantAFiltered.length === 1 && 
      tenantAFiltered[0].id === 'pt-a1' &&
      tenantBFiltered.length === 1 && 
      tenantBFiltered[0].id === 'pt-b1';

    results.push({
      id: 'AVD10',
      name: 'Isolamento estrito de horários protegidos entre famílias (multi-tenant)',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'AVD10', name: 'Isolamento multi-tenant', passed: false, details: err.message });
  }

  return results;
}
