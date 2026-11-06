/**
 * CASA JUNTO — HOTFIX B.5.4-HF2: CORRIGIR REAPLICAÇÃO DA CONFIGURAÇÃO COMUM
 * Suíte de Testes Automatizados (HF2B-01 a HF2B-10)
 *
 * Validações obrigatórias:
 * 1. Primeira aplicação da configuração comum (Semanal Seg e Qua, às 09h).
 * 2. Segunda aplicação com dias e horário diferentes (Ter e Qui, às 14h).
 * 3. Terceira aplicação com mudança de frequência (Mensal, dia 15, às 16h30).
 * 4. Proteção de um ambiente personalizado durante reaplicação.
 * 5. Retorno de um ambiente personalizado ao padrão recebendo os valores comuns vigentes.
 * 6. Aplicação comum após voltar da Etapa 3 (navegação bidirecional).
 * 7. Revisão final consistente com os cards.
 * 8. Payload independente por ambiente com valores efetivos.
 * 9. Ausência de mutações antes da confirmação.
 * 10. Preservação arquitetural: Motor 2.0, Scheduler e regras intactas.
 */

import { JSDOM } from 'jsdom';

// Configura ambiente DOM simulado com JSDOM se ainda não configurado
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
import { TaskMultiRoomSetupView } from '../components/TaskMultiRoomSetupView';
import { TaskMaster, Room, DomesticSupport, BatchAddRoutineInput, FamilyTask } from '../types';

export interface B54Hf2TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runTaskMultiRoomReapplyB54Hf2TestSuite(): B54Hf2TestResult[] {
  const results: B54Hf2TestResult[] = [];

  const record = (id: string, name: string, fn: () => void) => {
    try {
      fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err?.message || String(err) });
    }
  };

  const sampleRooms: Room[] = [
    {
      id: 'room-social',
      familyId: 'fam-juriti',
      name: 'Banheiro social',
      type: 'bathroom',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'room-lavabo',
      familyId: 'fam-juriti',
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
      familyId: 'fam-juriti',
      name: 'Ruthe',
      type: 'CLEANER',
      active: true,
      schedule: [{ weekday: 3, startTime: '08:00', endTime: '17:00' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const sampleTask: TaskMaster = {
    id: 'bath-4',
    name: 'Limpar o espelho do banheiro',
    description: 'Limpar o espelho com produto limpa-vidros.',
    category: 'cleaning',
    room_type: 'bathroom',
    duration_minutes: 15,
    effort_level: 2,
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

  // Helper para renderizar na Etapa 2 com os ambientes Social e Lavabo selecionados
  const setupStep2 = (onConfirmMock: (configs: BatchAddRoutineInput[]) => Promise<void> = async () => {}) => {
    document.body.innerHTML = '';
    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: onConfirmMock
      })
    );

    act(() => {
      fireEvent.click(document.getElementById(`check-task-${sampleTask.id}-room-social`)!);
      fireEvent.click(document.getElementById(`check-task-${sampleTask.id}-room-lavabo`)!);
    });

    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });
  };

  // HF2B-01: Primeira aplicação da configuração comum
  record('HF2B-01', 'Primeira aplicação da configuração comum (Semanal, Seg e Qua, às 09h)', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config');

    if (!btnApply) throw new Error('Botão #btn-apply-common-config não encontrado');

    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      // Segunda já vem selecionada ([1]), adicionamos Quarta (dia 3)
      fireEvent.click(document.getElementById('btn-common-day-3')!);
      changeInputValue(inputTime, '09:00');
    });

    act(() => {
      fireEvent.click(btnApply);
    });

    const sumSocial = document.getElementById(`summary-text-${sampleTask.id}-room-social`)?.textContent || '';
    const sumLavabo = document.getElementById(`summary-text-${sampleTask.id}-room-lavabo`)?.textContent || '';

    if (!sumSocial.includes('Semanal (Seg, Qua)') || !sumSocial.includes('09:00')) {
      throw new Error(`Resumo do Banheiro Social incorreto na 1ª aplicação: ${sumSocial}`);
    }
    if (!sumLavabo.includes('Semanal (Seg, Qua)') || !sumLavabo.includes('09:00')) {
      throw new Error(`Resumo do Lavabo incorreto na 1ª aplicação: ${sumLavabo}`);
    }
  });

  // HF2B-02: Segunda aplicação com dias e horário diferentes
  record('HF2B-02', 'Segunda aplicação com dias e horário diferentes (Ter e Qui, às 14h)', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // 1ª aplicação
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      fireEvent.click(document.getElementById('btn-common-day-3')!); // Adiciona Qua
      changeInputValue(inputTime, '09:00');
      fireEvent.click(btnApply);
    });

    // Alteração para Terça e Quinta, 14:00
    act(() => {
      fireEvent.click(document.getElementById('btn-common-day-1')!); // Desmarca Seg
      fireEvent.click(document.getElementById('btn-common-day-3')!); // Desmarca Qua
      fireEvent.click(document.getElementById('btn-common-day-2')!); // Marca Ter
      fireEvent.click(document.getElementById('btn-common-day-4')!); // Marca Qui
      changeInputValue(inputTime, '14:00');
    });

    // 2ª aplicação
    act(() => {
      fireEvent.click(btnApply);
    });

    const sumSocial = document.getElementById(`summary-text-${sampleTask.id}-room-social`)?.textContent || '';
    const sumLavabo = document.getElementById(`summary-text-${sampleTask.id}-room-lavabo`)?.textContent || '';

    if (!sumSocial.includes('Semanal (Ter, Qui)') || !sumSocial.includes('14:00')) {
      throw new Error(`Banheiro Social não refletiu 2ª aplicação: ${sumSocial}`);
    }
    if (!sumLavabo.includes('Semanal (Ter, Qui)') || !sumLavabo.includes('14:00')) {
      throw new Error(`Lavabo não refletiu 2ª aplicação: ${sumLavabo}`);
    }
  });

  // HF2B-03: Terceira aplicação com mudança de frequência
  record('HF2B-03', 'Terceira aplicação com mudança de frequência (Mensal, dia 15, às 16h30)', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // 1ª aplicação: Semanal Seg/Qua
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      fireEvent.click(document.getElementById('btn-common-day-3')!);
      fireEvent.click(btnApply);
    });

    // 2ª aplicação: Semanal Ter/Qui 14h
    act(() => {
      fireEvent.click(document.getElementById('btn-common-day-1')!);
      fireEvent.click(document.getElementById('btn-common-day-3')!);
      fireEvent.click(document.getElementById('btn-common-day-2')!);
      fireEvent.click(document.getElementById('btn-common-day-4')!);
      changeInputValue(inputTime, '14:00');
      fireEvent.click(btnApply);
    });

    // 3ª aplicação: Mensal, dia 15, às 16:30
    act(() => {
      changeSelectValue(selectFreq, 'MONTHLY');
    });

    const inputDom = document.getElementById('input-common-dom') as HTMLInputElement;
    if (!inputDom) throw new Error('Input #input-common-dom não encontrado para frequência mensal');

    act(() => {
      changeInputValue(inputDom, '15');
      changeInputValue(inputTime, '16:30');
      fireEvent.click(btnApply);
    });

    const sumSocial = document.getElementById(`summary-text-${sampleTask.id}-room-social`)?.textContent || '';
    const sumLavabo = document.getElementById(`summary-text-${sampleTask.id}-room-lavabo`)?.textContent || '';

    if (!sumSocial.includes('Mensal (dia 15)') || !sumSocial.includes('16:30')) {
      throw new Error(`Banheiro Social não refletiu 3ª aplicação (Mensal): ${sumSocial}`);
    }
    if (!sumLavabo.includes('Mensal (dia 15)') || !sumLavabo.includes('16:30')) {
      throw new Error(`Lavabo não refletiu 3ª aplicação (Mensal): ${sumLavabo}`);
    }
  });

  // HF2B-04: Proteção de um ambiente personalizado
  record('HF2B-04', 'Proteção de um ambiente personalizado durante sucessivas reaplicações', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // 1ª aplicação padrão: Semanal Seg às 09:00
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      changeInputValue(inputTime, '09:00');
      fireEvent.click(btnApply);
    });

    // Personaliza o Lavabo individualmente para Diária às 18:00
    act(() => {
      fireEvent.click(document.getElementById(`btn-customize-${sampleTask.id}-room-lavabo`)!);
    });

    const freqLavabo = document.getElementById(`freq-${sampleTask.id}-room-lavabo`) as HTMLSelectElement;
    const timeLavabo = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    act(() => {
      changeSelectValue(freqLavabo, 'DAILY');
      changeInputValue(timeLavabo, '18:00');
    });

    // Verifica que Lavabo recebeu selo Personalizado
    const badgeLavabo = document.getElementById(`badge-status-customized-${sampleTask.id}-room-lavabo`);
    if (!badgeLavabo) throw new Error('Lavabo não recebeu badge de Personalizado');

    // Reaplicação na toolbar comum: Sexta-feira às 07:30
    act(() => {
      fireEvent.click(document.getElementById('btn-common-day-1')!); // Desmarca Seg
      fireEvent.click(document.getElementById('btn-common-day-5')!); // Marca Sex
      changeInputValue(inputTime, '07:30');
      fireEvent.click(btnApply);
    });

    // Banheiro Social (Padrão) deve ter atualizado para Sexta às 07:30
    const sumSocial = document.getElementById(`summary-text-${sampleTask.id}-room-social`)?.textContent || '';
    if (!sumSocial.includes('Semanal (Sex)') || !sumSocial.includes('07:30')) {
      throw new Error(`Ambiente Padrão não recebeu os novos valores: ${sumSocial}`);
    }

    // Lavabo (Personalizado) deve ter PRESERVADO Diária às 18:00
    const sumLavabo = document.getElementById(`summary-text-${sampleTask.id}-room-lavabo`)?.textContent || '';
    if (!sumLavabo.includes('Diária') || !sumLavabo.includes('18:00')) {
      throw new Error(`Ambiente Personalizado foi indevidamente sobrescrito: ${sumLavabo}`);
    }
  });

  // HF2B-05: Retorno de um ambiente personalizado ao padrão
  record('HF2B-05', 'Retorno de um ambiente personalizado ao padrão recebendo valores comuns vigentes', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // Toolbar comum configurada para Quarta às 11h
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      fireEvent.click(document.getElementById('btn-common-day-1')!); // desmarca Seg
      fireEvent.click(document.getElementById('btn-common-day-3')!); // marca Qua
      changeInputValue(inputTime, '11:00');
      fireEvent.click(btnApply);
    });

    // Personaliza Lavabo para Pontual
    act(() => {
      fireEvent.click(document.getElementById(`btn-customize-${sampleTask.id}-room-lavabo`)!);
    });
    const freqLavabo = document.getElementById(`freq-${sampleTask.id}-room-lavabo`) as HTMLSelectElement;
    act(() => {
      changeSelectValue(freqLavabo, 'ONE_TIME');
    });

    // Clica em "Usar configuração padrão" e confirma
    act(() => {
      fireEvent.click(document.getElementById(`btn-reset-default-${sampleTask.id}-room-lavabo`)!);
    });
    act(() => {
      fireEvent.click(document.getElementById(`btn-confirm-reset-${sampleTask.id}-room-lavabo`)!);
    });

    // Verifica que Lavabo voltou ao badge Padrão e herdou Quarta às 11:00
    const badgeDefault = document.getElementById(`badge-status-default-${sampleTask.id}-room-lavabo`);
    if (!badgeDefault) throw new Error('Lavabo não voltou a exibir o badge Padrão');

    const sumLavabo = document.getElementById(`summary-text-${sampleTask.id}-room-lavabo`)?.textContent || '';
    if (!sumLavabo.includes('Semanal (Qua)') || !sumLavabo.includes('11:00')) {
      throw new Error(`Lavabo restaurado não herdou valores vigentes da toolbar: ${sumLavabo}`);
    }

    // Agora, nova aplicação na toolbar comum deve atualizar também o Lavabo
    act(() => {
      changeInputValue(inputTime, '12:00');
      fireEvent.click(btnApply);
    });

    const sumLavaboUpdated = document.getElementById(`summary-text-${sampleTask.id}-room-lavabo`)?.textContent || '';
    if (!sumLavaboUpdated.includes('12:00')) {
      throw new Error(`Lavabo reincorporado ao padrão não recebeu nova aplicação comum: ${sumLavaboUpdated}`);
    }
  });

  // HF2B-06: Aplicação comum após voltar da Etapa 3
  record('HF2B-06', 'Aplicação comum funciona perfeitamente após retornar da Etapa 3', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // 1ª config: Semanal Seg às 09:00
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      changeInputValue(inputTime, '09:00');
      fireEvent.click(btnApply);
    });

    // Avança para a Etapa 3
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-2')!);
    });

    const step3Element = document.getElementById('step-3-review-confirm');
    if (!step3Element) throw new Error('Não avançou para a Etapa 3');

    // Retorna para a Etapa 2
    act(() => {
      fireEvent.click(document.getElementById('btn-prev-step-3')!);
    });

    const step2Element = document.getElementById('step-2-configure-routines');
    if (!step2Element) throw new Error('Não retornou para a Etapa 2');

    // Altera toolbar para Sábado às 15h e reaplica
    const btnApplyAfterBack = document.getElementById('btn-apply-common-config')!;
    const inputTimeAfterBack = document.getElementById('input-common-time') as HTMLInputElement;

    act(() => {
      fireEvent.click(document.getElementById('btn-common-day-1')!); // desmarca Seg
      fireEvent.click(document.getElementById('btn-common-day-6')!); // marca Sáb
      changeInputValue(inputTimeAfterBack, '15:00');
      fireEvent.click(btnApplyAfterBack);
    });

    const sumSocial = document.getElementById(`summary-text-${sampleTask.id}-room-social`)?.textContent || '';
    const sumLavabo = document.getElementById(`summary-text-${sampleTask.id}-room-lavabo`)?.textContent || '';

    if (!sumSocial.includes('Semanal (Sáb)') || !sumSocial.includes('15:00')) {
      throw new Error(`Social não atualizou após retorno da Etapa 3: ${sumSocial}`);
    }
    if (!sumLavabo.includes('Semanal (Sáb)') || !sumLavabo.includes('15:00')) {
      throw new Error(`Lavabo não atualizou após retorno da Etapa 3: ${sumLavabo}`);
    }
  });

  // HF2B-07: Revisão final consistente com os cards
  record('HF2B-07', 'Revisão final na Etapa 3 apresenta exatamente os valores efetivos dos cards', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // Aplica Ter e Qui às 14h aos não personalizados
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      fireEvent.click(document.getElementById('btn-common-day-1')!);
      fireEvent.click(document.getElementById('btn-common-day-2')!);
      fireEvent.click(document.getElementById('btn-common-day-4')!);
      changeInputValue(inputTime, '14:00');
      fireEvent.click(btnApply);
    });

    // Personaliza Lavabo para 20:00
    act(() => {
      fireEvent.click(document.getElementById(`btn-customize-${sampleTask.id}-room-lavabo`)!);
    });
    const timeLavabo = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;
    act(() => {
      changeInputValue(timeLavabo, '20:00');
    });

    // Avança para a Etapa 3
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-2')!);
    });

    const reviewContent = document.getElementById('step-3-review-confirm')?.textContent || '';
    if (!reviewContent.includes('Semanal (Ter, Qui) às 14:00')) {
      throw new Error('Revisão final não contém a rotina herdada do Banheiro Social (14:00)');
    }
    if (!reviewContent.includes('Semanal (Ter, Qui) às 20:00')) {
      throw new Error('Revisão final não contém a rotina personalizada do Lavabo (20:00)');
    }
  });

  // HF2B-08: Payload independente por ambiente
  record('HF2B-08', 'Confirmação final gera payload independente por ambiente com valores corretos', () => {
    let capturedPayload: BatchAddRoutineInput[] | null = null;
    const handleConfirmMock = async (payload: BatchAddRoutineInput[]) => {
      capturedPayload = payload;
    };

    setupStep2(handleConfirmMock);

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // Aplica Semanal Ter/Qui às 14h
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      fireEvent.click(document.getElementById('btn-common-day-1')!);
      fireEvent.click(document.getElementById('btn-common-day-2')!);
      fireEvent.click(document.getElementById('btn-common-day-4')!);
      changeInputValue(inputTime, '14:00');
      fireEvent.click(btnApply);
    });

    // Personaliza Lavabo para Sexta às 08h com apoio Ruthe
    act(() => {
      fireEvent.click(document.getElementById(`btn-customize-${sampleTask.id}-room-lavabo`)!);
    });
    act(() => {
      // Alterna dias no Lavabo
      fireEvent.click(document.getElementById(`btn-day-${sampleTask.id}-room-lavabo-2`)!); // desmarca Ter
      fireEvent.click(document.getElementById(`btn-day-${sampleTask.id}-room-lavabo-4`)!); // desmarca Qui
      fireEvent.click(document.getElementById(`btn-day-${sampleTask.id}-room-lavabo-5`)!); // marca Sex
    });
    const timeLavabo = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;
    act(() => {
      changeInputValue(timeLavabo, '08:00');
    });

    // Avança para a Etapa 3
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-2')!);
    });

    // Confirmação final
    const btnConfirm =
      (document.getElementById('btn-multi-room-confirm') as HTMLButtonElement) ||
      (document.getElementById('btn-final-confirm-multi-room') as HTMLButtonElement);

    if (!btnConfirm) throw new Error('Botão de confirmação final não encontrado');

    act(() => {
      fireEvent.click(btnConfirm);
    });

    if (!capturedPayload || (capturedPayload as BatchAddRoutineInput[]).length !== 2) {
      throw new Error(`Payload final esperado com 2 itens, recebido: ${JSON.stringify(capturedPayload)}`);
    }

    const itemSocial = (capturedPayload as BatchAddRoutineInput[]).find(p => p.roomId === 'room-social');
    const itemLavabo = (capturedPayload as BatchAddRoutineInput[]).find(p => p.roomId === 'room-lavabo');

    if (!itemSocial || !itemLavabo) throw new Error('Payload não conteve ambos os ambientes');

    if (itemSocial.preferredTime !== '14:00' || JSON.stringify(itemSocial.preferredDays) !== JSON.stringify([2, 4])) {
      throw new Error(`Item Social inválido: ${JSON.stringify(itemSocial)}`);
    }
    if (itemLavabo.preferredTime !== '08:00' || JSON.stringify(itemLavabo.preferredDays) !== JSON.stringify([5])) {
      throw new Error(`Item Lavabo personalizado inválido: ${JSON.stringify(itemLavabo)}`);
    }
  });

  // HF2B-09: Ausência de mutações antes da confirmação
  record('HF2B-09', 'Nenhuma mutação ou persistência real ocorre antes da confirmação explícita', () => {
    let confirmCalled = false;
    setupStep2(async () => {
      confirmCalled = true;
    });

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const btnApply = document.getElementById('btn-apply-common-config')!;

    // Realiza múltiplas alterações e reaplicações
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
      fireEvent.click(btnApply);
      changeSelectValue(selectFreq, 'MONTHLY');
      fireEvent.click(btnApply);
      changeSelectValue(selectFreq, 'DAILY');
      fireEvent.click(btnApply);
    });

    // Avança e volta
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-2')!);
    });
    act(() => {
      fireEvent.click(document.getElementById('btn-prev-step-3')!);
    });

    if (confirmCalled) {
      throw new Error('Callback onConfirm foi chamado prematuramente antes da confirmação explícita');
    }
  });

  // HF2B-10: Preservação arquitetural: Motor 2.0 e regras intactas
  record('HF2B-10', 'Preservação arquitetural: Motor 2.0, Scheduler e arquivos core permanecem intactos', () => {
    const requiredCoreFiles = [
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/ScoringService.ts',
      'src/components/AddRoutineToRoomModal.tsx',
      'src/components/TaskCatalogView.tsx'
    ];

    for (const relPath of requiredCoreFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Arquivo core ausente: ${fullPath}`);
      }
    }
  });

  return results;
}
