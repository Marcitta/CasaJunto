/**
 * CASA JUNTO — DOMESTIC-SUPPORT-1B-HF1 TEST SUITE
 * Mensagens amigáveis de validação de horário
 *
 * Testes cobrindo:
 * - Horário inicial vazio / incompleto
 * - Horário final vazio / incompleto
 * - Horário de início >= término
 * - Horário de início == término
 * - Outras inconsistências (sobreposição / duplicação)
 * - Nenhuma mensagem técnica (startTime, endTime, index, HH:mm, regex, Firebase) exposta ao usuário
 * - Integridade do domínio: validateDomesticSupportSchedule inalterado
 * - Tratamento unificado entre criação e edição
 */

import { mapScheduleErrorToFriendly } from '../components/DomesticSupport/DomesticSupportModal';
import { validateDomesticSupportSchedule } from '../services/domesticSupportService';
import { DomesticSupportSchedule } from '../types';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runDomesticSupport1bHf1TestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, error: err?.message || String(err) });
    }
  }

  const TECHNICAL_KEYWORDS = [
    'startTime',
    'endTime',
    'index',
    'HH:mm',
    'hh:mm',
    'regex',
    '00:00 to 23:59',
    'Firebase',
    'permission-denied',
    'code',
    'undefined',
    'null'
  ];

  // DS1B-HF1-01: Horário inicial vazio
  await record('DS1B-HF1-01', 'Horário inicial vazio retorna mensagem amigável de preenchimento', () => {
    const schedule: DomesticSupportSchedule[] = [
      { weekday: 1, startTime: '', endTime: '16:00' }
    ];
    const validation = validateDomesticSupportSchedule(schedule);
    const friendly = mapScheduleErrorToFriendly(schedule, validation.error);

    if (friendly !== 'Preencha o horário de início e término para todos os dias selecionados.') {
      throw new Error(`Expected exact friendly message, got: "${friendly}"`);
    }
  });

  // DS1B-HF1-02: Horário inicial incompleto
  await record('DS1B-HF1-02', 'Horário inicial incompleto (< 5 chars) retorna mensagem amigável de preenchimento', () => {
    const schedule: DomesticSupportSchedule[] = [
      { weekday: 1, startTime: '08:', endTime: '16:00' }
    ];
    const validation = validateDomesticSupportSchedule(schedule);
    const friendly = mapScheduleErrorToFriendly(schedule, validation.error);

    if (friendly !== 'Preencha o horário de início e término para todos os dias selecionados.') {
      throw new Error(`Expected exact friendly message, got: "${friendly}"`);
    }
  });

  // DS1B-HF1-03: Horário final vazio
  await record('DS1B-HF1-03', 'Horário final vazio retorna mensagem amigável de preenchimento', () => {
    const schedule: DomesticSupportSchedule[] = [
      { weekday: 2, startTime: '08:00', endTime: '' }
    ];
    const validation = validateDomesticSupportSchedule(schedule);
    const friendly = mapScheduleErrorToFriendly(schedule, validation.error);

    if (friendly !== 'Preencha o horário de início e término para todos os dias selecionados.') {
      throw new Error(`Expected exact friendly message, got: "${friendly}"`);
    }
  });

  // DS1B-HF1-04: Horário final incompleto
  await record('DS1B-HF1-04', 'Horário final incompleto (< 5 chars) retorna mensagem amigável de preenchimento', () => {
    const schedule: DomesticSupportSchedule[] = [
      { weekday: 2, startTime: '08:00', endTime: '16' }
    ];
    const validation = validateDomesticSupportSchedule(schedule);
    const friendly = mapScheduleErrorToFriendly(schedule, validation.error);

    if (friendly !== 'Preencha o horário de início e término para todos os dias selecionados.') {
      throw new Error(`Expected exact friendly message, got: "${friendly}"`);
    }
  });

  // DS1B-HF1-05: Início > término
  await record('DS1B-HF1-05', 'Horário de início posterior ao término retorna mensagem canônica', () => {
    const schedule: DomesticSupportSchedule[] = [
      { weekday: 3, startTime: '16:00', endTime: '08:00' }
    ];
    const validation = validateDomesticSupportSchedule(schedule);
    const friendly = mapScheduleErrorToFriendly(schedule, validation.error);

    if (friendly !== 'O horário de início deve ser anterior ao horário de término.') {
      throw new Error(`Expected exact friendly message, got: "${friendly}"`);
    }
  });

  // DS1B-HF1-06: Início == término
  await record('DS1B-HF1-06', 'Horário de início igual ao término retorna mensagem canônica', () => {
    const schedule: DomesticSupportSchedule[] = [
      { weekday: 4, startTime: '10:00', endTime: '10:00' }
    ];
    const validation = validateDomesticSupportSchedule(schedule);
    const friendly = mapScheduleErrorToFriendly(schedule, validation.error);

    if (friendly !== 'O horário de início deve ser anterior ao horário de término.') {
      throw new Error(`Expected exact friendly message, got: "${friendly}"`);
    }
  });

  // DS1B-HF1-07: Outras inconsistências de horário (sobreposição)
  await record('DS1B-HF1-07', 'Outra inconsistência de horário retorna "Verifique os horários informados."', () => {
    const schedule: DomesticSupportSchedule[] = [
      { weekday: 1, startTime: '08:00', endTime: '12:00' },
      { weekday: 1, startTime: '10:00', endTime: '14:00' }
    ];
    const validation = validateDomesticSupportSchedule(schedule);
    const friendly = mapScheduleErrorToFriendly(schedule, validation.error);

    if (friendly !== 'Verifique os horários informados.') {
      throw new Error(`Expected "Verifique os horários informados.", got: "${friendly}"`);
    }
  });

  // DS1B-HF1-08: Nenhuma mensagem técnica aparece ao usuário
  await record('DS1B-HF1-08', 'Nenhuma mensagem técnica ou código interno aparece ao usuário', () => {
    const testCases: DomesticSupportSchedule[][] = [
      [{ weekday: 1, startTime: '', endTime: '' }],
      [{ weekday: 1, startTime: '08:00', endTime: '' }],
      [{ weekday: 1, startTime: '', endTime: '16:00' }],
      [{ weekday: 1, startTime: '18:00', endTime: '08:00' }],
      [{ weekday: 1, startTime: '08:00', endTime: '08:00' }],
      [
        { weekday: 1, startTime: '08:00', endTime: '12:00' },
        { weekday: 1, startTime: '08:00', endTime: '12:00' }
      ]
    ];

    for (const testCase of testCases) {
      const validation = validateDomesticSupportSchedule(testCase);
      const friendly = mapScheduleErrorToFriendly(testCase, validation.error);

      for (const kw of TECHNICAL_KEYWORDS) {
        if (friendly.includes(kw)) {
          throw new Error(`Technical keyword "${kw}" leaked in friendly error: "${friendly}"`);
        }
      }
    }
  });

  // DS1B-HF1-09: Integridade de validateDomesticSupportSchedule inalterada
  await record('DS1B-HF1-09', 'validateDomesticSupportSchedule no domínio permanece inalterado e estrito', () => {
    const validSchedule: DomesticSupportSchedule[] = [
      { weekday: 1, startTime: '08:00', endTime: '16:00' }
    ];
    const validation = validateDomesticSupportSchedule(validSchedule);
    if (!validation.valid) {
      throw new Error('Valid schedule must pass domain validation');
    }

    const invalidSchedule: DomesticSupportSchedule[] = [
      { weekday: 1, startTime: '16:00', endTime: '08:00' }
    ];
    const invalidValidation = validateDomesticSupportSchedule(invalidSchedule);
    if (invalidValidation.valid) {
      throw new Error('Invalid schedule must fail domain validation');
    }
    // Domain returns exact technical diagnostic string for service/logging
    if (!invalidValidation.error?.includes('startTime (16:00) must be earlier than endTime (08:00)')) {
      throw new Error('Domain validation diagnostic output altered');
    }
  });

  // DS1B-HF1-10: Tratamento unificado entre criação e edição
  await record('DS1B-HF1-10', 'Cadastro e edição utilizam a mesma função de mapeamento de erro', () => {
    // Both flows run mapScheduleErrorToFriendly with the same builtSchedule and error
    const createSchedule: DomesticSupportSchedule[] = [{ weekday: 2, startTime: '12:00', endTime: '10:00' }];
    const editSchedule: DomesticSupportSchedule[] = [{ weekday: 2, startTime: '12:00', endTime: '10:00' }];

    const valCreate = validateDomesticSupportSchedule(createSchedule);
    const valEdit = validateDomesticSupportSchedule(editSchedule);

    const msgCreate = mapScheduleErrorToFriendly(createSchedule, valCreate.error);
    const msgEdit = mapScheduleErrorToFriendly(editSchedule, valEdit.error);

    if (msgCreate !== msgEdit) {
      throw new Error('Creation and edition error messages must be strictly identical');
    }
    if (msgCreate !== 'O horário de início deve ser anterior ao horário de término.') {
      throw new Error(`Unexpected message: ${msgCreate}`);
    }
  });

  return results;
}
