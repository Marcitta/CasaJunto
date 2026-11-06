/**
 * CASA JUNTO — B.5.5-HF1: BLOCOS A (AUD-01, AUD-02) & B (AUD-08)
 * Suíte de Testes Automatizados (B55HF1-AB-01 a B55HF1-AB-09)
 *
 * Validações obrigatórias:
 * 1. ONE_TIME com data específica na revisão final (Etapa 3).
 * 2. FLEXIBLE (e EXTERNAL_SUPPORT / HOUSEHOLD) exibido corretamente na revisão final.
 * 3. Paridade estrita entre Etapa 2, revisão final (Etapa 3) e payload final submetido.
 * 4. Nova rotina com duração personalizada persistida em estimated_minutes.
 * 5. Reativação preservando duração configurada (estimated_minutes) e preservando legado quando ausente.
 * 6. Ocorrência com horário final (scheduled_end) calculado pela duração estimada.
 * 7. Hidratação de rotina legada após recarregamento (omissão/null, camelCase legacy, fallback master/20m).
 * 8. Preservação e separação estrita da duração real de execução (completion_duration) vs duração estimada.
 * 9. Não regressão e respeito estrito aos limites de escopo (Blocos C/D não iniciados, Motor 2.0, Scheduler e fam-mtm1580s intocados).
 */

import { JSDOM } from 'jsdom';

if (typeof window === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true
  });
  dom.window.scrollTo = () => {};
  Object.defineProperty(global, 'window', { value: dom.window, writable: true, configurable: true });
  Object.defineProperty(global, 'document', { value: dom.window.document, writable: true, configurable: true });
  try {
    Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
  } catch {}
  Object.defineProperty(global, 'HTMLElement', { value: dom.window.HTMLElement, writable: true, configurable: true });
  Object.defineProperty(global, 'HTMLInputElement', { value: dom.window.HTMLInputElement, writable: true, configurable: true });
  Object.defineProperty(global, 'HTMLSelectElement', { value: dom.window.HTMLSelectElement, writable: true, configurable: true });
  Object.defineProperty(global, 'CustomEvent', { value: dom.window.CustomEvent, writable: true, configurable: true });
  Object.defineProperty(global, 'KeyboardEvent', { value: dom.window.KeyboardEvent, writable: true, configurable: true });
  Object.defineProperty(global, 'MouseEvent', { value: dom.window.MouseEvent, writable: true, configurable: true });
  Object.defineProperty(global, 'Node', { value: dom.window.Node, writable: true, configurable: true });
}

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, act } from '@testing-library/react';
import {
  TaskMultiRoomSetupView,
  formatFrequencyLabel,
  formatExecutionTargetLabel
} from '../components/TaskMultiRoomSetupView';
import {
  BatchAddRoutineInput,
  DomesticSupport,
  Family,
  FamilyTask,
  Room,
  TaskAssignment,
  TaskMaster
} from '../types';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import {
  buildFamilyTaskFromBatchInput,
  mapAssignmentsToTasks,
  resolveTaskEstimatedMinutes
} from '../context/AppContext';
import { allMasterTasks } from '../data/tasks';

export interface BlocksABTestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export async function runTaskMultiRoomBlocksABHf1TestSuite(): Promise<BlocksABTestResult[]> {
  const results: BlocksABTestResult[] = [];

  const record = async (id: string, name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err?.message || String(err) });
    }
  };

  const isolatedFamily: Family = {
    id: 'fam-test-isolated-b55hf1',
    name: 'Família Teste Isolada',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const sampleRooms: Room[] = [
    {
      id: 'room-suite',
      familyId: isolatedFamily.id,
      name: 'Suíte',
      type: 'bathroom',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'room-social',
      familyId: isolatedFamily.id,
      name: 'Banheiro social',
      type: 'bathroom',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'room-lavabo',
      familyId: isolatedFamily.id,
      name: 'Lavabo',
      type: 'bathroom',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ];

  const sampleSupports: DomesticSupport[] = [
    {
      id: 'support-ruthe',
      familyId: isolatedFamily.id,
      name: 'Ruthe',
      type: 'CLEANER',
      active: true,
      schedule: [{ weekday: 3, startTime: '08:00', endTime: '17:00' }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ];

  const sampleTask45m: TaskMaster = {
    id: 'bath-custom-45',
    name: 'Higienizar bancada e espelho',
    description: 'Limpeza completa da bancada e espelho com produto apropriado.',
    category: 'cleaning',
    room_type: 'bathroom',
    duration_minutes: 45,
    effort_level: 3,
    frequency_type: 'weekly'
  };

  const changeInputValue = (input: HTMLInputElement, value: string) => {
    fireEvent.change(input, { target: { value } });
    const reactPropsKey = Object.keys(input).find(k => k.startsWith('__reactProps'));
    if (reactPropsKey && (input as any)[reactPropsKey]?.onChange) {
      (input as any)[reactPropsKey].onChange({ target: { value } });
    }
  };

  const changeSelectValue = (select: HTMLSelectElement, value: string) => {
    fireEvent.change(select, { target: { value } });
    const reactPropsKey = Object.keys(select).find(k => k.startsWith('__reactProps'));
    if (reactPropsKey && (select as any)[reactPropsKey]?.onChange) {
      (select as any)[reactPropsKey].onChange({ target: { value } });
    }
  };

  // 1. ONE_TIME com data específica na revisão (AUD-01)
  await record('B55HF1-AB-01', 'ONE_TIME exibe data específica na revisão final (Etapa 3)', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask45m],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    const cb = document.getElementById(`check-task-${sampleTask45m.id}-room-suite`) as HTMLInputElement;
    act(() => {
      cb.click();
    });

    const btnStep2 = document.getElementById('btn-next-step-1') as HTMLButtonElement;
    act(() => {
      btnStep2.click();
    });

    const freqSelect = document.getElementById('select-common-freq') as HTMLSelectElement;
    act(() => {
      changeSelectValue(freqSelect, 'ONE_TIME');
    });

    const dateInput = document.getElementById('input-common-date') as HTMLInputElement;
    if (!dateInput) {
      throw new Error('Campo input-common-date não renderizado para frequência ONE_TIME');
    }
    act(() => {
      changeInputValue(dateInput, '2026-12-15');
    });

    const timeInput = document.getElementById('input-common-time') as HTMLInputElement;
    act(() => {
      changeInputValue(timeInput, '10:30');
    });

    const btnStep3 = document.getElementById('btn-next-step-2') as HTMLButtonElement;
    act(() => {
      btnStep3.click();
    });

    const reviewSummary = document.getElementById(`review-summary-${sampleTask45m.id}-room-suite`);
    const reviewText = reviewSummary?.textContent || '';
    if (!reviewText.includes('Pontual (2026-12-15)')) {
      throw new Error(`Revisão final deveria exibir "Pontual (2026-12-15)", obteve: "${reviewText}"`);
    }
    if (!reviewText.includes('às 10:30')) {
      throw new Error(`Revisão final deveria exibir horário "às 10:30", obteve: "${reviewText}"`);
    }
  });

  // 2. FLEXIBLE exibido corretamente na revisão final (AUD-02)
  await record('B55HF1-AB-02', 'FLEXIBLE, EXTERNAL_SUPPORT e HOUSEHOLD são exibidos corretamente na revisão final', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask45m],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    // Seleciona os 3 ambientes
    ['room-suite', 'room-social', 'room-lavabo'].forEach(roomId => {
      const cb = document.getElementById(`check-task-${sampleTask45m.id}-${roomId}`) as HTMLInputElement;
      act(() => {
        cb.click();
      });
    });

    act(() => {
      (document.getElementById('btn-next-step-1') as HTMLButtonElement).click();
    });

    // Configura público padrão como FLEXIBLE
    const toggleTargetBtn = Array.from(document.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Definir público de execução padrão')
    ) as HTMLButtonElement;
    act(() => {
      toggleTargetBtn.click();
    });

    const commonTargetContainer = document.getElementById('common-target-selector')!;
    const flexBtn = Array.from(commonTargetContainer.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Pode ser qualquer um')
    ) as HTMLButtonElement;
    act(() => {
      flexBtn.click();
    });

    // Personaliza room-social para EXTERNAL_SUPPORT (Ruthe)
    act(() => {
      (document.getElementById(`btn-customize-${sampleTask45m.id}-room-social`) as HTMLButtonElement).click();
    });
    const socialPanel = document.getElementById(`customize-panel-${sampleTask45m.id}-room-social`)!;
    const socialExtBtn = Array.from(socialPanel.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Ajuda externa')
    ) as HTMLButtonElement;
    act(() => {
      socialExtBtn.click();
    });
    const socialSelect = socialPanel.querySelector('#select-external-support') as HTMLSelectElement;
    if (socialSelect) {
      act(() => {
        changeSelectValue(socialSelect, 'support-ruthe');
      });
    }

    // Personaliza room-lavabo para HOUSEHOLD (Pessoas da casa)
    act(() => {
      (document.getElementById(`btn-customize-${sampleTask45m.id}-room-lavabo`) as HTMLButtonElement).click();
    });
    const lavaboPanel = document.getElementById(`customize-panel-${sampleTask45m.id}-room-lavabo`)!;
    const lavaboHouseholdBtn = Array.from(lavaboPanel.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Pessoas da casa')
    ) as HTMLButtonElement;
    act(() => {
      lavaboHouseholdBtn.click();
    });

    // Avança para Etapa 3
    act(() => {
      (document.getElementById('btn-next-step-2') as HTMLButtonElement).click();
    });

    const suiteReview = document.getElementById(`review-summary-${sampleTask45m.id}-room-suite`)?.textContent || '';
    const socialReview = document.getElementById(`review-summary-${sampleTask45m.id}-room-social`)?.textContent || '';
    const lavaboReview = document.getElementById(`review-summary-${sampleTask45m.id}-room-lavabo`)?.textContent || '';

    if (!suiteReview.includes('Flexível') || suiteReview.includes('Apoio externo')) {
      throw new Error(`Revisão de Suíte (FLEXIBLE) incorreta: "${suiteReview}"`);
    }
    if (!socialReview.includes('Ajuda externa (Ruthe)')) {
      throw new Error(`Revisão de Social (EXTERNAL_SUPPORT) incorreta: "${socialReview}"`);
    }
    if (!lavaboReview.includes('Pessoas da casa')) {
      throw new Error(`Revisão de Lavabo (HOUSEHOLD) incorreta: "${lavaboReview}"`);
    }
  });

  // 3. Paridade estrita entre Etapa 2, revisão final e payload submetido
  await record('B55HF1-AB-03', 'Paridade estrita entre resumo da Etapa 2, revisão da Etapa 3 e payload final', async () => {
    document.body.innerHTML = '';
    let capturedPayload: BatchAddRoutineInput[] = [];

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask45m],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async payload => {
          capturedPayload = payload;
        }
      })
    );

    ['room-suite', 'room-social'].forEach(roomId => {
      const cb = document.getElementById(`check-task-${sampleTask45m.id}-${roomId}`) as HTMLInputElement;
      act(() => {
        cb.click();
      });
    });

    act(() => {
      (document.getElementById('btn-next-step-1') as HTMLButtonElement).click();
    });

    // Padrão: ONE_TIME 2026-12-20 às 11:00 + FLEXIBLE
    act(() => {
      changeSelectValue(document.getElementById('select-common-freq') as HTMLSelectElement, 'ONE_TIME');
    });
    act(() => {
      changeInputValue(document.getElementById('input-common-date') as HTMLInputElement, '2026-12-20');
    });
    act(() => {
      changeInputValue(document.getElementById('input-common-time') as HTMLInputElement, '11:00');
    });
    const toggleTargetBtn = Array.from(document.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Definir público de execução padrão')
    ) as HTMLButtonElement;
    act(() => {
      toggleTargetBtn.click();
    });
    const commonTargetContainer = document.getElementById('common-target-selector')!;
    const flexBtn = Array.from(commonTargetContainer.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Pode ser qualquer um')
    ) as HTMLButtonElement;
    act(() => {
      flexBtn.click();
    });

    // Personaliza room-social para WEEKLY Ter e Qui às 14:15
    act(() => {
      (document.getElementById(`btn-customize-${sampleTask45m.id}-room-social`) as HTMLButtonElement).click();
    });
    act(() => {
      changeSelectValue(document.getElementById(`freq-${sampleTask45m.id}-room-social`) as HTMLSelectElement, 'WEEKLY');
    });
    // Desmarca padrão Seg (1) e marca Ter (2) e Qui (4)
    act(() => {
      (document.getElementById(`btn-day-${sampleTask45m.id}-room-social-1`) as HTMLButtonElement).click();
      (document.getElementById(`btn-day-${sampleTask45m.id}-room-social-2`) as HTMLButtonElement).click();
      (document.getElementById(`btn-day-${sampleTask45m.id}-room-social-4`) as HTMLButtonElement).click();
    });
    act(() => {
      changeInputValue(document.getElementById(`time-${sampleTask45m.id}-room-social`) as HTMLInputElement, '14:15');
    });

    const step2SuiteText = document.getElementById(`summary-text-${sampleTask45m.id}-room-suite`)?.textContent || '';
    const step2SocialText = document.getElementById(`summary-text-${sampleTask45m.id}-room-social`)?.textContent || '';

    // Avança para Etapa 3
    act(() => {
      (document.getElementById('btn-next-step-2') as HTMLButtonElement).click();
    });

    const step3SuiteText = document.getElementById(`review-summary-${sampleTask45m.id}-room-suite`)?.textContent || '';
    const step3SocialText = document.getElementById(`review-summary-${sampleTask45m.id}-room-social`)?.textContent || '';

    if (step2SuiteText !== step3SuiteText) {
      throw new Error(`Divergência Etapa 2 vs Etapa 3 em Suíte: "${step2SuiteText}" !== "${step3SuiteText}"`);
    }
    if (step2SocialText !== step3SocialText) {
      throw new Error(`Divergência Etapa 2 vs Etapa 3 em Social: "${step2SocialText}" !== "${step3SocialText}"`);
    }

    // Verifica que os formatadores puros compartilhados produzem exatamente os mesmos textos
    if (
      formatFrequencyLabel('ONE_TIME', undefined, undefined, '2026-12-20') !== 'Pontual (2026-12-20)' ||
      formatExecutionTargetLabel('FLEXIBLE', null, sampleSupports) !== 'Flexível'
    ) {
      throw new Error('Funções puras compartilhadas formatFrequencyLabel/formatExecutionTargetLabel retornaram saída inesperada');
    }

    // Confirma gravação e valida payload final
    await act(async () => {
      (document.getElementById('btn-multi-room-confirm') as HTMLButtonElement).click();
    });

    const suitePayload = capturedPayload.find(p => p.roomId === 'room-suite');
    const socialPayload = capturedPayload.find(p => p.roomId === 'room-social');

    if (!suitePayload || suitePayload.frequency !== 'ONE_TIME' || suitePayload.startDate !== '2026-12-20' || suitePayload.preferredTime !== '11:00' || suitePayload.executionTarget !== 'FLEXIBLE') {
      throw new Error(`Payload de Suíte diverge da revisão: ${JSON.stringify(suitePayload)}`);
    }
    if (
      !socialPayload ||
      socialPayload.frequency !== 'WEEKLY' ||
      JSON.stringify(socialPayload.preferredDays) !== JSON.stringify([2, 4]) ||
      socialPayload.preferredTime !== '14:15' ||
      socialPayload.executionTarget !== 'FLEXIBLE'
    ) {
      throw new Error(`Payload de Social diverge da revisão: ${JSON.stringify(socialPayload)}`);
    }
  });

  // 4. Nova rotina com duração personalizada persistida em estimated_minutes (AUD-08)
  await record('B55HF1-AB-04', 'Nova rotina persiste durationMinutes em estimated_minutes até o payload Firestore', async () => {
    document.body.innerHTML = '';
    let capturedPayload: BatchAddRoutineInput[] = [];

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask45m],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async payload => {
          capturedPayload = payload;
        }
      })
    );

    act(() => {
      (document.getElementById(`check-task-${sampleTask45m.id}-room-suite`) as HTMLInputElement).click();
    });
    act(() => {
      (document.getElementById('btn-next-step-1') as HTMLButtonElement).click();
    });
    act(() => {
      (document.getElementById('btn-next-step-2') as HTMLButtonElement).click();
    });
    await act(async () => {
      (document.getElementById('btn-multi-room-confirm') as HTMLButtonElement).click();
    });

    if (capturedPayload.length !== 1 || capturedPayload[0].durationMinutes !== 45) {
      throw new Error(`TaskMultiRoomSetupView deveria enviar durationMinutes: 45, enviou: ${capturedPayload[0]?.durationMinutes}`);
    }

    const builtRoutine = buildFamilyTaskFromBatchInput({
      item: capturedPayload[0],
      master: sampleTask45m,
      familyId: isolatedFamily.id,
      routineId: 'ft-new-45',
      today: '2026-11-06',
      now: '2026-11-06T12:00:00.000Z'
    });

    if (builtRoutine.estimated_minutes !== 45 || builtRoutine.estimatedMinutes !== 45) {
      throw new Error(`FamilyTask criada deveria conter estimated_minutes: 45, obteve: ${builtRoutine.estimated_minutes}`);
    }

    const firestoreDoc = FirestoreMappers.fromFamilyTask(builtRoutine);
    if (firestoreDoc.estimated_minutes !== 45) {
      throw new Error(`Payload Firestore deveria persistir estimated_minutes: 45, obteve: ${firestoreDoc.estimated_minutes}`);
    }
  });

  // 5. Reativação preservando duração configurada (AUD-08)
  await record('B55HF1-AB-05', 'Reativação preserva duração configurada em estimated_minutes e não fabrica valor em legado', async () => {
    const archivedConfiguredRoutine: FamilyTask = {
      id: 'ft-archived-55m',
      family_id: isolatedFamily.id,
      familyId: isolatedFamily.id,
      task_master_id: sampleTask45m.id,
      taskMasterId: sampleTask45m.id,
      name: sampleTask45m.name,
      room_id: 'room-social',
      roomId: 'room-social',
      frequency: 'WEEKLY',
      preferred_days: [1],
      preferred_time: '08:30',
      estimated_minutes: 55,
      estimatedMinutes: 55,
      active: false,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };

    const archivedLegacyRoutine: FamilyTask = {
      id: 'ft-archived-legacy',
      family_id: isolatedFamily.id,
      familyId: isolatedFamily.id,
      task_master_id: 'custom-legacy-tm',
      taskMasterId: 'custom-legacy-tm',
      name: 'Rotina Legada Arquivada',
      room_id: 'room-lavabo',
      roomId: 'room-lavabo',
      frequency: 'DAILY',
      preferred_time: '10:00',
      active: false,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };

    // 5A. Via fluxo UI TaskMultiRoomSetupView
    document.body.innerHTML = '';
    let capturedReactivationPayload: BatchAddRoutineInput[] = [];
    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask45m],
        rooms: sampleRooms,
        familyTasks: [archivedConfiguredRoutine],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async payload => {
          capturedReactivationPayload = payload;
        }
      })
    );

    act(() => {
      (document.getElementById(`check-task-${sampleTask45m.id}-room-social`) as HTMLInputElement).click();
    });
    act(() => {
      (document.getElementById('btn-next-step-1') as HTMLButtonElement).click();
    });
    act(() => {
      (document.getElementById('btn-next-step-2') as HTMLButtonElement).click();
    });
    await act(async () => {
      (document.getElementById('btn-multi-room-confirm') as HTMLButtonElement).click();
    });

    if (capturedReactivationPayload[0]?.durationMinutes !== 55) {
      throw new Error(`Reativação via UI deveria preservar durationMinutes: 55, obteve: ${capturedReactivationPayload[0]?.durationMinutes}`);
    }

    // 5B. Via buildFamilyTaskFromBatchInput mesmo quando item.durationMinutes não é informado
    const reactivatedFromBatch = buildFamilyTaskFromBatchInput({
      item: {
        taskMasterId: sampleTask45m.id,
        name: sampleTask45m.name,
        roomId: 'room-social',
        frequency: 'WEEKLY',
        preferredDays: [1],
        preferredTime: '08:30',
        executionTarget: 'HOUSEHOLD'
      },
      existing: archivedConfiguredRoutine,
      master: sampleTask45m,
      familyId: isolatedFamily.id,
      today: '2026-11-06',
      now: '2026-11-06T12:00:00.000Z'
    });

    if (reactivatedFromBatch.id !== archivedConfiguredRoutine.id || reactivatedFromBatch.estimated_minutes !== 55 || reactivatedFromBatch.estimatedMinutes !== 55) {
      throw new Error(`Reativação em lote deveria manter ID e estimated_minutes=55, obteve: ${JSON.stringify(reactivatedFromBatch)}`);
    }

    // 5C. Legado sem duração configurada não deve receber valor artificial ao reativar
    const reactivatedLegacy = buildFamilyTaskFromBatchInput({
      item: {
        taskMasterId: 'custom-legacy-tm',
        name: 'Rotina Legada Arquivada',
        roomId: 'room-lavabo',
        frequency: 'DAILY',
        preferredTime: '10:00',
        executionTarget: 'HOUSEHOLD'
      },
      existing: archivedLegacyRoutine,
      master: undefined,
      familyId: isolatedFamily.id,
      today: '2026-11-06',
      now: '2026-11-06T12:00:00.000Z'
    });

    if (reactivatedLegacy.estimated_minutes !== undefined || reactivatedLegacy.estimatedMinutes !== undefined) {
      throw new Error(`Reativação de rotina legada sem duração não deveria injetar valor artificial, obteve: ${reactivatedLegacy.estimated_minutes}`);
    }
  });

  // 6. Ocorrência com horário final calculado pela duração estimada (AUD-08)
  await record('B55HF1-AB-06', 'Ocorrências geradas e restauradas calculam scheduled_end pela duração estimada', async () => {
    const routine50m: FamilyTask = {
      id: 'ft-dur-50m',
      family_id: isolatedFamily.id,
      familyId: isolatedFamily.id,
      task_master_id: sampleTask45m.id,
      taskMasterId: sampleTask45m.id,
      name: sampleTask45m.name,
      room_id: 'room-suite',
      roomId: 'room-suite',
      frequency: 'DAILY',
      preferred_time: '09:15',
      preferredTime: '09:15',
      estimated_minutes: 50,
      estimatedMinutes: 50,
      active: true,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };

    const syncRes = await RoutineContinuityService.syncRoutineOccurrences({
      family: isolatedFamily,
      routines: [routine50m],
      existingAssignments: [],
      isDemoMode: true
    });

    if (syncRes.newAssignments.length === 0) {
      throw new Error('syncRoutineOccurrences deveria gerar ocorrências para rotina diária');
    }

    const firstOcc = syncRes.newAssignments[0];
    if (firstOcc.scheduled_start !== '09:15' || firstOcc.scheduled_end !== '10:05') {
      throw new Error(`Ocorrência deveria ter scheduled_start='09:15' e scheduled_end='10:05' (+50m), obteve start=${firstOcc.scheduled_start}, end=${firstOcc.scheduled_end}`);
    }

    // Verifica também restauração de ocorrência CANCELLED durante reativação
    const inactiveRoutine = { ...routine50m, active: false };
    const cancelledOcc: TaskAssignment = {
      id: firstOcc.id,
      family_id: isolatedFamily.id,
      family_task_id: routine50m.id,
      task_id: sampleTask45m.id,
      room_id: 'room-suite',
      member_id: '',
      scheduled_date: firstOcc.scheduled_date,
      scheduled_start: '09:15',
      status: 'CANCELLED',
      score: 0,
      assigned_reason: '',
      is_unassigned: true
    };

    const reactivateRes = await RoutineContinuityService.reactivateRoutine({
      familyId: isolatedFamily.id,
      routineId: routine50m.id,
      existingRoutines: [inactiveRoutine],
      existingAssignments: [cancelledOcc],
      isDemoMode: true,
      timezone: isolatedFamily.timezone
    });

    const restored = reactivateRes.restoredAssignments.find(a => a.id === firstOcc.id);
    if (!restored || restored.scheduled_end !== '10:05') {
      throw new Error(`Ocorrência restaurada na reativação deveria calcular scheduled_end='10:05', obteve: ${restored?.scheduled_end}`);
    }
  });

  // 7. Hidratação de rotina legada após recarregamento (AUD-08)
  await record('B55HF1-AB-07', 'Hidratação de rotina legada após recarregamento preserva legado e resolve fallback corretamente', () => {
    const knownMaster = allMasterTasks[0]; // tm-1 (duration_minutes definido no catálogo)

    // 7A. Documento legado no Firestore sem estimated_minutes (ou com estimated_minutes: null) vinculado a TaskMaster
    const hydratedFromNullMaster = FirestoreMappers.toFamilyTask('ft-legacy-master', {
      family_id: isolatedFamily.id,
      task_master_id: knownMaster.id,
      room_id: 'room-suite',
      frequency: 'DAILY',
      preferred_time: '08:00',
      estimated_minutes: null,
      active: true
    });

    if (hydratedFromNullMaster.estimated_minutes !== undefined) {
      throw new Error(`toFamilyTask não deve fabricar estimated_minutes persistido em documento legado null, obteve: ${hydratedFromNullMaster.estimated_minutes}`);
    }

    const legacyAsgWithMaster: TaskAssignment = {
      id: 'ft-legacy-master_2026-11-06',
      family_id: isolatedFamily.id,
      family_task_id: 'ft-legacy-master',
      task_id: knownMaster.id,
      room_id: 'room-suite',
      member_id: '',
      scheduled_date: '2026-11-06',
      scheduled_start: '08:00',
      status: 'SCHEDULED',
      score: 0,
      assigned_reason: '',
      is_unassigned: true
    };

    const hydratedTasksWithMaster = mapAssignmentsToTasks({
      assignments: [legacyAsgWithMaster],
      rooms: sampleRooms,
      familyTasks: [hydratedFromNullMaster],
      allMasterTasks
    });

    if (hydratedTasksWithMaster[0].durationMinutes !== knownMaster.duration_minutes) {
      throw new Error(`Hidratação de rotina legada deveria herdar duration_minutes=${knownMaster.duration_minutes} do TaskMaster, obteve: ${hydratedTasksWithMaster[0].durationMinutes}`);
    }

    // 7B. Documento legado no Firestore usando apenas camelCase estimatedMinutes: 40
    const hydratedCamelLegacy = FirestoreMappers.toFamilyTask('ft-legacy-camel', {
      familyId: isolatedFamily.id,
      taskMasterId: knownMaster.id,
      roomId: 'room-social',
      frequency: 'WEEKLY',
      preferredDays: [1, 3],
      preferredTime: '09:00',
      estimatedMinutes: 40,
      active: true
    });

    if (hydratedCamelLegacy.estimated_minutes !== 40 || hydratedCamelLegacy.estimatedMinutes !== 40) {
      throw new Error(`toFamilyTask deveria hidratar camelCase legado estimatedMinutes=40, obteve: ${hydratedCamelLegacy.estimated_minutes}`);
    }

    // 7C. Documento legado customizado sem estimated_minutes e sem TaskMaster -> fallback 20m na hidratação/geração
    const hydratedCustomLegacy = FirestoreMappers.toFamilyTask('ft-legacy-custom', {
      family_id: isolatedFamily.id,
      name: 'Regar plantas da varanda',
      room_id: 'room-lavabo',
      frequency: 'DAILY',
      preferred_time: '07:30',
      active: true
    });

    if (hydratedCustomLegacy.estimated_minutes !== undefined) {
      throw new Error('Documento legado customizado sem duração deve manter estimated_minutes undefined no FamilyTask');
    }

    const customAsg: TaskAssignment = {
      id: 'ft-legacy-custom_2026-11-06',
      family_id: isolatedFamily.id,
      family_task_id: 'ft-legacy-custom',
      task_id: 'ft-legacy-custom',
      room_id: 'room-lavabo',
      member_id: '',
      scheduled_date: '2026-11-06',
      scheduled_start: '07:30',
      status: 'SCHEDULED',
      score: 0,
      assigned_reason: '',
      is_unassigned: true
    };

    const hydratedCustomTasks = mapAssignmentsToTasks({
      assignments: [customAsg],
      rooms: sampleRooms,
      familyTasks: [hydratedCustomLegacy],
      allMasterTasks
    });

    if (hydratedCustomTasks[0].durationMinutes !== 20 || hydratedCustomTasks[0].estimatedMinutes !== undefined) {
      throw new Error(`Rotina custom legada sem duração deveria usar fallback durationMinutes=20 e estimatedMinutes=undefined, obteve durationMinutes=${hydratedCustomTasks[0].durationMinutes}, estimatedMinutes=${hydratedCustomTasks[0].estimatedMinutes}`);
    }
  });

  // 8. Preservação e separação estrita da duração real de execução vs duração estimada (AUD-08)
  await record('B55HF1-AB-08', 'Duração real de execução (completion_duration) é preservada sem se confundir com duração estimada', async () => {
    const routine25m: FamilyTask = {
      id: 'ft-est-25m',
      family_id: isolatedFamily.id,
      familyId: isolatedFamily.id,
      task_master_id: sampleTask45m.id,
      taskMasterId: sampleTask45m.id,
      name: sampleTask45m.name,
      room_id: 'room-suite',
      roomId: 'room-suite',
      frequency: 'DAILY',
      preferred_time: '10:00',
      preferredTime: '10:00',
      estimated_minutes: 25,
      estimatedMinutes: 25,
      active: true,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };

    const completedWithRealDuration = FirestoreMappers.toTaskAssignment('ft-est-25m_2026-11-06', {
      family_id: isolatedFamily.id,
      family_task_id: 'ft-est-25m',
      task_id: sampleTask45m.id,
      room_id: 'room-suite',
      member_id: 'mem-1',
      scheduled_date: '2026-11-06',
      scheduled_start: '10:00',
      scheduled_end: '10:25',
      status: 'COMPLETED',
      completed_at: '2026-11-06T11:08:00.000Z',
      completion_duration: 68,
      completed_by: 'mem-1',
      is_unassigned: false
    });

    const mappedTasks = mapAssignmentsToTasks({
      assignments: [completedWithRealDuration],
      rooms: sampleRooms,
      familyTasks: [routine25m],
      allMasterTasks
    });

    const task = mappedTasks[0];
    if (task.durationMinutes !== 25 || task.estimatedMinutes !== 25) {
      throw new Error(`Duração estimada da Task deveria ser 25m (nunca completion_duration 68m), obteve durationMinutes=${task.durationMinutes}`);
    }
    if (task.completionDuration !== 68) {
      throw new Error(`Duração real completionDuration deveria ser preservada em 68, obteve: ${task.completionDuration}`);
    }

    // Sincronização de futuras ocorrências usa a duração estimada (25m) e mantém a conclusão real (68m) intocada
    const syncRes = await RoutineContinuityService.syncRoutineOccurrences({
      family: isolatedFamily,
      routines: [routine25m],
      existingAssignments: [completedWithRealDuration],
      isDemoMode: true
    });

    const preservedCompleted = syncRes.allAssignments.find(a => a.id === completedWithRealDuration.id);
    const futureScheduled = syncRes.allAssignments.find(a => a.id !== completedWithRealDuration.id);

    if (!preservedCompleted || preservedCompleted.completion_duration !== 68 || preservedCompleted.status !== 'COMPLETED') {
      throw new Error('syncRoutineOccurrences não deve sobrescrever ocorrência COMPLETED nem seu completion_duration');
    }
    if (!futureScheduled || futureScheduled.scheduled_end !== '10:25') {
      throw new Error(`Próxima ocorrência deveria calcular scheduled_end='10:25' (25m estimados, não 68m reais), obteve: ${futureScheduled?.scheduled_end}`);
    }
  });

  // 9. Não regressão e verificação de limites de escopo (Blocos C & D não iniciados, Motor 2.0, Scheduler e fam-mtm1580s intocados)
  await record('B55HF1-AB-09', 'Motor 2.0, Scheduler, Blocos C/D e família real fam-mtm1580s permanecem intocados', () => {
    const enginePath = path.resolve(process.cwd(), 'src/domain/distribution/DistributionEngine.ts');
    const engineCode = fs.readFileSync(enginePath, 'utf-8');
    if (engineCode.includes('TaskMultiRoomSetupView') || engineCode.includes('B55HF1')) {
      throw new Error('Motor 2.0 não deve ser alterado nesta fase');
    }

    const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
    const appContextCode = fs.readFileSync(appContextPath, 'utf-8');
    if (appContextCode.includes('fam-mtm1580s')) {
      throw new Error('Identificador de família real fam-mtm1580s não deve aparecer no código-fonte');
    }
    if (!appContextCode.includes('return { added: addedCount, reactivated: reactivatedCount, skipped: skippedCount, failed };')) {
      throw new Error('Bloco C (contrato BatchAddResult) não deveria ser alterado antes da autorização');
    }

    const catalogPath = path.resolve(process.cwd(), 'src/components/TaskCatalogView.tsx');
    const catalogCode = fs.readFileSync(catalogPath, 'utf-8');
    if (!catalogCode.includes('setIsConfigModalOpen(false);')) {
      throw new Error('Bloco D (fluxo de erro parcial no TaskCatalogView) não deveria ser implementado antes da autorização');
    }

    const estResolved = resolveTaskEstimatedMinutes(
      { estimated_minutes: 30 } as FamilyTask,
      { duration_minutes: 15 } as TaskMaster
    );
    if (estResolved !== 30 || RoutineGenerator.getDeterministicOccurrenceId('r1', '2026-11-06') !== 'r1_2026-11-06') {
      throw new Error('Funções canônicas de resolução e geração determinística devem permanecer consistentes');
    }
  });

  return results;
}
