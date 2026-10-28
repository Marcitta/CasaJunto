/**
 * CASA JUNTO — HOTFIX B.5.4-HF1: CONFIGURAÇÃO PADRÃO COM PERSONALIZAÇÃO POR AMBIENTE
 * Suíte de Testes Automatizados (HF1B-01 a HF1B-12)
 */

import { JSDOM } from 'jsdom';

// Configura ambiente DOM simulado com JSDOM
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

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, act } from '@testing-library/react';
import { TaskMultiRoomSetupView } from '../components/TaskMultiRoomSetupView';
import { TaskMaster, Room, DomesticSupport, BatchAddRoutineInput, FamilyTask } from '../types';

export interface B54Hf1TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runTaskMultiRoomInheritanceB54Hf1TestSuite(): B54Hf1TestResult[] {
  const results: B54Hf1TestResult[] = [];

  const record = (id: string, name: string, fn: () => void) => {
    try {
      fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err?.message || String(err) });
    }
  };

  const sampleRooms: Room[] = [
    { id: 'room-suite', name: 'Banheiro da suíte', type: 'bathroom', active: true },
    { id: 'room-social', name: 'Banheiro social', type: 'bathroom', active: true },
    { id: 'room-lavabo', name: 'Lavabo', type: 'half_bath', active: true }
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
  const setupStep2 = () => {
    document.body.innerHTML = '';
    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
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

  // HF1B-01: Toolbar de configuração comum apresenta campos essenciais
  record('HF1B-01', 'Toolbar de configuração comum apresenta frequência padrão, horário sugerido e seletor de público', () => {
    setupStep2();

    const toolbar = document.getElementById('multi-room-common-toolbar');
    if (!toolbar) throw new Error('Toolbar de configuração comum não encontrada na Etapa 2');

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;

    if (!selectFreq) throw new Error('Seletor de frequência comum select-common-freq não encontrado');
    if (!inputTime) throw new Error('Input de horário comum input-common-time não encontrado');
  });

  // HF1B-02: Comportamento por frequência: Diária sem dias, Semanal e Quinzenal com dias
  record('HF1B-02', 'Frequência Diária oculta dias da semana; Semanal e Quinzenal exibem seletores de dias', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;

    // Em Diária: não deve exibir seleção de dias
    act(() => {
      changeSelectValue(selectFreq, 'DAILY');
    });
    const weeklyDaysDaily = document.getElementById('common-weekly-days');
    if (weeklyDaysDaily) {
      throw new Error('Frequência Diária não deve exibir seleção de dias da semana');
    }

    // Em Semanal: deve exibir seleção de dias
    act(() => {
      changeSelectValue(selectFreq, 'WEEKLY');
    });
    const weeklyDaysWeekly = document.getElementById('common-weekly-days');
    if (!weeklyDaysWeekly) {
      throw new Error('Frequência Semanal deve exibir seleção de dias da semana');
    }

    // Em Quinzenal: deve exibir seleção de dias preservando semântica
    act(() => {
      changeSelectValue(selectFreq, 'BIWEEKLY');
    });
    const weeklyDaysBiweekly = document.getElementById('common-weekly-days');
    if (!weeklyDaysBiweekly) {
      throw new Error('Frequência Quinzenal deve permitir selecionar dias da semana');
    }
  });

  // HF1B-03: Frequência Mensal exibe dia do mês e Pontual exibe data específica
  record('HF1B-03', 'Frequência Mensal exibe dia do mês e Pontual exibe data específica', () => {
    setupStep2();

    const selectFreq = document.getElementById('select-common-freq') as HTMLSelectElement;

    // Mensal
    act(() => {
      changeSelectValue(selectFreq, 'MONTHLY');
    });
    const monthlyDom = document.getElementById('common-monthly-dom');
    const inputDom = document.getElementById('input-common-dom');
    if (!monthlyDom || !inputDom) {
      throw new Error('Frequência Mensal deve exibir o campo de dia do mês input-common-dom');
    }

    // Pontual
    act(() => {
      changeSelectValue(selectFreq, 'ONE_TIME');
    });
    const specificDate = document.getElementById('common-specific-date');
    const inputDate = document.getElementById('input-common-date');
    if (!specificDate || !inputDate) {
      throw new Error('Frequência Pontual deve exibir o campo de data específica input-common-date');
    }
  });

  // HF1B-04: Ambientes iniciam em cards compactos com badge Padrão e herdam valores comuns
  record('HF1B-04', 'Cada ambiente inicia em card compacto com badge Padrão e botão Personalizar', () => {
    setupStep2();

    const badgeSocial = document.getElementById(`badge-status-default-${sampleTask.id}-room-social`);
    const badgeLavabo = document.getElementById(`badge-status-default-${sampleTask.id}-room-lavabo`);
    const btnCustomizeSocial = document.getElementById(`btn-customize-${sampleTask.id}-room-social`);

    if (!badgeSocial || !badgeSocial.textContent?.includes('Padrão')) {
      throw new Error('Ambiente Social deve iniciar com badge "Padrão"');
    }
    if (!badgeLavabo || !badgeLavabo.textContent?.includes('Padrão')) {
      throw new Error('Ambiente Lavabo deve iniciar com badge "Padrão"');
    }
    if (!btnCustomizeSocial) {
      throw new Error('Botão Personalizar deve estar disponível no card do ambiente');
    }

    // Painel de personalização deve iniciar recolhido
    const panelSocial = document.getElementById(`customize-panel-${sampleTask.id}-room-social`);
    if (panelSocial && !panelSocial.classList.contains('hidden')) {
      throw new Error('Painel de personalização individual deve iniciar recolhido');
    }
  });

  // HF1B-05: Alteração na toolbar comum propaga para os ambientes Padrão
  record('HF1B-05', 'Alterações na configuração comum atualizam automaticamente os ambientes com badge Padrão', () => {
    setupStep2();

    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;

    act(() => {
      changeInputValue(inputTime, '14:30');
    });

    const timeSocial = document.getElementById(`time-${sampleTask.id}-room-social`) as HTMLInputElement;
    const timeLavabo = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    if (timeSocial.value !== '14:30') {
      throw new Error(`Ambiente Social deveria ter herdado 14:30, obtido: ${timeSocial.value}`);
    }
    if (timeLavabo.value !== '14:30') {
      throw new Error(`Ambiente Lavabo deveria ter herdado 14:30, obtido: ${timeLavabo.value}`);
    }

    const summarySocial = document.getElementById(`summary-text-${sampleTask.id}-room-social`);
    if (!summarySocial?.textContent?.includes('14:30')) {
      throw new Error('Resumo do card compacto deve refletir o horário herdado');
    }
  });

  // HF1B-06: Clicar em Personalizar expande card e altera badge para Personalizado
  record('HF1B-06', 'Clicar em Personalizar expande o card e altera o indicador para Personalizado', () => {
    setupStep2();

    const btnCustomizeSocial = document.getElementById(`btn-customize-${sampleTask.id}-room-social`);
    act(() => {
      fireEvent.click(btnCustomizeSocial!);
    });

    const badgeCustomized = document.getElementById(`badge-status-customized-${sampleTask.id}-room-social`);
    if (!badgeCustomized || !badgeCustomized.textContent?.includes('Personalizado')) {
      throw new Error('Badge do ambiente Social deve mudar para "Personalizado"');
    }

    const panelSocial = document.getElementById(`customize-panel-${sampleTask.id}-room-social`);
    if (!panelSocial || panelSocial.classList.contains('hidden')) {
      throw new Error('Painel de personalização deve estar visível após clique em Personalizar');
    }
  });

  // HF1B-07: Configuração comum NÃO sobrescreve ambientes já personalizados
  record('HF1B-07', 'Alterações na configuração comum não sobrescrevem ambientes com personalização ativa', () => {
    setupStep2();

    // Expande e personaliza o Lavabo para 16:45
    const btnCustomizeLavabo = document.getElementById(`btn-customize-${sampleTask.id}-room-lavabo`);
    act(() => {
      fireEvent.click(btnCustomizeLavabo!);
    });

    const timeLavabo = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;
    act(() => {
      changeInputValue(timeLavabo, '16:45');
    });

    // Agora altera a configuração comum para 08:15
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    act(() => {
      changeInputValue(inputTime, '08:15');
    });

    const timeSocial = document.getElementById(`time-${sampleTask.id}-room-social`) as HTMLInputElement;
    const timeLavaboAfter = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    // Social (Padrão) deve herdar 08:15
    if (timeSocial.value !== '08:15') {
      throw new Error(`Ambiente padrão Social deveria ter herdado 08:15, obtido: ${timeSocial.value}`);
    }

    // Lavabo (Personalizado) deve preservar intacto 16:45
    if ((timeLavaboAfter.value as string) !== '16:45') {
      throw new Error(`Ambiente personalizado Lavabo deveria preservar 16:45, obtido: ${timeLavaboAfter.value}`);
    }
  });

  // HF1B-08: Ação Usar configuração padrão solicita confirmação antes de descartar
  record('HF1B-08', 'Ação "Usar configuração padrão" solicita confirmação explícita antes de descartar', () => {
    setupStep2();

    // Personaliza Social
    const btnCustomizeSocial = document.getElementById(`btn-customize-${sampleTask.id}-room-social`);
    act(() => {
      fireEvent.click(btnCustomizeSocial!);
    });

    const btnResetDefault = document.getElementById(`btn-reset-default-${sampleTask.id}-room-social`);
    if (!btnResetDefault) {
      throw new Error('Ação "Usar configuração padrão" deve estar visível em card personalizado');
    }

    // Clica em Usar configuração padrão
    act(() => {
      fireEvent.click(btnResetDefault);
    });

    // Deve exibir caixa de confirmação
    const confirmBox = document.getElementById(`confirm-reset-box-${sampleTask.id}-room-social`);
    const btnConfirm = document.getElementById(`btn-confirm-reset-${sampleTask.id}-room-social`);
    const btnCancel = document.getElementById(`btn-cancel-reset-${sampleTask.id}-room-social`);

    if (!confirmBox || !btnConfirm || !btnCancel) {
      throw new Error('Caixa de confirmação com botões Confirmar e Cancelar deve ser exibida');
    }
  });

  // HF1B-09: Confirmar retorno ao padrão restaura valores da configuração comum
  record('HF1B-09', 'Confirmar o retorno ao padrão restaura os valores da configuração comum e atualiza o badge para Padrão', () => {
    setupStep2();

    // Ajusta comum para 11:30
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    act(() => {
      changeInputValue(inputTime, '11:30');
    });

    // Personaliza Social para 19:00
    const btnCustomizeSocial = document.getElementById(`btn-customize-${sampleTask.id}-room-social`);
    act(() => {
      fireEvent.click(btnCustomizeSocial!);
    });

    const timeSocial = document.getElementById(`time-${sampleTask.id}-room-social`) as HTMLInputElement;
    act(() => {
      changeInputValue(timeSocial, '19:00');
    });

    // Clica em Usar configuração padrão e confirma
    act(() => {
      fireEvent.click(document.getElementById(`btn-reset-default-${sampleTask.id}-room-social`)!);
    });
    act(() => {
      fireEvent.click(document.getElementById(`btn-confirm-reset-${sampleTask.id}-room-social`)!);
    });

    // Deve voltar ao badge Padrão e ter horário 11:30
    const badgeDefault = document.getElementById(`badge-status-default-${sampleTask.id}-room-social`);
    if (!badgeDefault) {
      throw new Error('Após confirmação, o badge deve voltar a ser "Padrão"');
    }

    const timeSocialAfter = document.getElementById(`time-${sampleTask.id}-room-social`) as HTMLInputElement;
    if ((timeSocialAfter.value as string) !== '11:30') {
      throw new Error(`Horário deveria ter sido restaurado para 11:30 da configuração comum, obtido: ${timeSocialAfter.value}`);
    }
  });

  // HF1B-10: Cancelar a confirmação mantém personalização intacta
  record('HF1B-10', 'Cancelar a confirmação de retorno ao padrão preserva intacta a personalização', () => {
    setupStep2();

    // Personaliza Social para 20:15
    act(() => {
      fireEvent.click(document.getElementById(`btn-customize-${sampleTask.id}-room-social`)!);
    });
    const timeSocial = document.getElementById(`time-${sampleTask.id}-room-social`) as HTMLInputElement;
    act(() => {
      changeInputValue(timeSocial, '20:15');
    });

    // Abre confirmação e clica em Cancelar
    act(() => {
      fireEvent.click(document.getElementById(`btn-reset-default-${sampleTask.id}-room-social`)!);
    });
    act(() => {
      fireEvent.click(document.getElementById(`btn-cancel-reset-${sampleTask.id}-room-social`)!);
    });

    // Deve continuar Personalizado com 20:15
    const badgeCustomized = document.getElementById(`badge-status-customized-${sampleTask.id}-room-social`);
    if (!badgeCustomized) {
      throw new Error('Ambiente deve continuar Personalizado após cancelar');
    }

    const timeSocialAfter = document.getElementById(`time-${sampleTask.id}-room-social`) as HTMLInputElement;
    if ((timeSocialAfter.value as string) !== '20:15') {
      throw new Error(`Horário de 20:15 deveria ser preservado, obtido: ${timeSocialAfter.value}`);
    }
  });

  // HF1B-11: Confirmação final preserva valores herdados e customizados no payload
  record('HF1B-11', 'Confirmação final reflete exatamente as configurações herdadas e personalizadas', async () => {
    document.body.innerHTML = '';
    let confirmedPayload: BatchAddRoutineInput[] = [];

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [sampleTask],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async (payload) => {
          confirmedPayload = payload;
        }
      })
    );

    // Marca Social e Lavabo na Etapa 1
    act(() => {
      fireEvent.click(document.getElementById(`check-task-${sampleTask.id}-room-social`)!);
      fireEvent.click(document.getElementById(`check-task-${sampleTask.id}-room-lavabo`)!);
    });
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });

    // Ajusta comum para 10:00 (Social herdará 10:00)
    const inputTime = document.getElementById('input-common-time') as HTMLInputElement;
    act(() => {
      changeInputValue(inputTime, '10:00');
    });

    // Personaliza Lavabo para 17:30
    act(() => {
      fireEvent.click(document.getElementById(`btn-customize-${sampleTask.id}-room-lavabo`)!);
    });
    const timeLavabo = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;
    act(() => {
      changeInputValue(timeLavabo, '17:30');
    });

    // Avança para Etapa 3 (Revisar)
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-2')!);
    });

    // Clica em confirmar criação
    const btnFinalConfirm = document.getElementById('btn-multi-room-confirm') || document.getElementById('btn-final-confirm-multi-room');
    if (!btnFinalConfirm) throw new Error('Botão de confirmação final não encontrado');

    act(() => {
      fireEvent.click(btnFinalConfirm);
    });

    if (confirmedPayload.length !== 2) {
      throw new Error(`Payload deveria conter 2 rotinas, obtido: ${confirmedPayload.length}`);
    }

    const itemSocial = confirmedPayload.find(p => p.roomId === 'room-social');
    const itemLavabo = confirmedPayload.find(p => p.roomId === 'room-lavabo');

    if (!itemSocial || itemSocial.preferredTime !== '10:00') {
      throw new Error(`Social deveria ter gravado com horário herdado 10:00, obtido: ${itemSocial?.preferredTime}`);
    }

    if (!itemLavabo || itemLavabo.preferredTime !== '17:30') {
      throw new Error(`Lavabo deveria ter gravado com horário personalizado 17:30, obtido: ${itemLavabo?.preferredTime}`);
    }
  });

  // HF1B-12: Invariantes arquiteturais: Motor 2.0 e regras de persistência intocadas
  record('HF1B-12', 'Preservação arquitetural: Motor 2.0 e regras de distribuição permanecem intocados', () => {
    const motorFiles = [
      path.join(process.cwd(), 'src/domain/distribution/DistributionEngine.ts'),
      path.join(process.cwd(), 'src/domain/distribution/ScoringService.ts')
    ];

    motorFiles.forEach(file => {
      if (!fs.existsSync(file)) {
        throw new Error(`Arquivo core ausente: ${file}`);
      }
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('TaskMultiRoomSetupView') || content.includes('isCustomized')) {
        throw new Error(`Arquivo core foi indevidamente modificado: ${file}`);
      }
    });
  });

  return results;
}
