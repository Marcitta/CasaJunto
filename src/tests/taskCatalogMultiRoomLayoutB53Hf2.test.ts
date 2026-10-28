/**
 * CASA JUNTO — HOTFIX B.5.3-HF2: LAYOUT DE COLUNA ÚNICA NO MODAL MULTIAMBIENTE
 * Suíte de Testes de Layout e Usabilidade (HF2-01 a HF2-10)
 */

import { JSDOM } from 'jsdom';

// Configura ambiente DOM simulado com JSDOM antes de carregar o React Testing Library
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true
});

Object.defineProperty(global, 'window', { value: dom.window, writable: true, configurable: true });
Object.defineProperty(global, 'document', { value: dom.window.document, writable: true, configurable: true });
try {
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
} catch {}
Object.defineProperty(global, 'HTMLElement', { value: dom.window.HTMLElement, writable: true, configurable: true });
Object.defineProperty(global, 'HTMLInputElement', { value: dom.window.HTMLInputElement, writable: true, configurable: true });
Object.defineProperty(global, 'CustomEvent', { value: dom.window.CustomEvent, writable: true, configurable: true });
Object.defineProperty(global, 'KeyboardEvent', { value: dom.window.KeyboardEvent, writable: true, configurable: true });
Object.defineProperty(global, 'MouseEvent', { value: dom.window.MouseEvent, writable: true, configurable: true });
Object.defineProperty(global, 'Node', { value: dom.window.Node, writable: true, configurable: true });

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { BatchConfigurationModal } from '../components/BatchConfigurationModal';
import { TaskMaster, Room, DomesticSupport, BatchAddRoutineInput } from '../types';

export interface HF2TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runTaskCatalogMultiRoomLayoutHF2Tests(): HF2TestResult[] {
  const results: HF2TestResult[] = [];

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
    description: 'Limpar o espelho com produto limpa-vidros e pano de microfibra.',
    category: 'cleaning',
    room_type: 'bathroom',
    duration_minutes: 15,
    effort_level: 2,
    frequency_type: 'weekly'
  };

  const sampleTaskBox: TaskMaster = {
    id: 'bath-box',
    name: 'Limpar vidros do box',
    description: 'Remover manchas de sabonete e água dos vidros do box.',
    category: 'cleaning',
    room_type: 'bathroom',
    duration_minutes: 30,
    effort_level: 3,
    frequency_type: 'weekly'
  };

  // HF2-01: Coluna única em todos os tamanhos de tela (sem grid-cols-2)
  record('HF2-01', 'Substituição do grid por coluna única sem grid-cols-2 na lista de ambientes', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const taskCard = document.getElementById(`batch-task-card-${sampleTask.id}`);
    if (!taskCard) throw new Error('Card da tarefa não encontrado');

    // Verifica que o container de ambientes usa flex-col ou coluna única e NÃO grid-cols-2
    const roomListContainer = taskCard.querySelector('.flex.flex-col.gap-3.w-full');
    if (!roomListContainer) {
      throw new Error('Container de cômodos deve utilizar classe flex flex-col gap-3 w-full para coluna única');
    }

    if (roomListContainer.className.includes('grid-cols-2') || roomListContainer.className.includes('md:grid-cols-2')) {
      throw new Error('Container de cômodos não deve conter grid-cols-2 ou md:grid-cols-2');
    }
  });

  // HF2-02: Cada ambiente ocupa toda a largura disponível
  record('HF2-02', 'Cada ambiente ocupa toda a largura disponível (w-full)', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    sampleRooms.forEach(room => {
      const roomElement = document.getElementById(`task-${sampleTask.id}-${room.id}`);
      if (!roomElement) throw new Error(`Elemento do cômodo ${room.name} não encontrado`);
      if (!roomElement.className.includes('w-full')) {
        throw new Error(`Elemento do cômodo ${room.name} deve possuir a classe w-full para ocupar toda a largura`);
      }
    });
  });

  // HF2-03: Frequência e Horário lado a lado no desktop/tablet e empilháveis no mobile
  record('HF2-03', 'Frequência e Horário possuem classes responsivas grid-cols-1 sm:grid-cols-2', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;
    act(() => {
      fireEvent.click(checkSocial);
    });

    const freqSelect = document.getElementById(`freq-${sampleTask.id}-room-social`);
    const timeInput = document.getElementById(`time-${sampleTask.id}-room-social`);
    if (!freqSelect || !timeInput) {
      throw new Error('Campos de frequência e horário não foram renderizados após selecionar o cômodo');
    }

    const freqContainer = freqSelect.closest('.grid');
    if (!freqContainer) {
      throw new Error('Container dos campos Frequência e Horário deve ser um grid');
    }
    if (!freqContainer.className.includes('grid-cols-1') || !freqContainer.className.includes('sm:grid-cols-2')) {
      throw new Error('Container deve utilizar grid-cols-1 sm:grid-cols-2 para empilhar no mobile e lado a lado no tablet/desktop');
    }
  });

  // HF2-04: Dias da semana apresentados sem sobreposição com espaçamento e touch-target adequados
  record('HF2-04', 'Dias da semana apresentados com flex-wrap, touch target de min-h-[38px] e gap-2', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;
    act(() => {
      fireEvent.click(checkSocial);
    });

    // Como sampleTask é weekly, botões de dias devem estar visíveis
    const btnSeg = document.getElementById(`btn-day-${sampleTask.id}-room-social-1`);
    if (!btnSeg) {
      throw new Error('Botão de dia da semana não encontrado para tarefa semanal');
    }

    if (!btnSeg.className.includes('min-h-[38px]')) {
      throw new Error('Botões de dias da semana devem ter altura confortável min-h-[38px]');
    }

    const daysContainer = btnSeg.parentElement;
    if (!daysContainer || !daysContainer.className.includes('flex-wrap')) {
      throw new Error('Container dos dias deve conter flex-wrap para evitar quebra/corte horizontal');
    }
  });

  // HF2-05: Exibição clara do público de execução e da pessoa de apoio
  record('HF2-05', 'Exibição clara de ExecutionTargetSelector ocupando toda a largura do card', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;
    act(() => {
      fireEvent.click(checkSocial);
    });

    const roomCard = document.getElementById(`task-${sampleTask.id}-room-social`);
    if (!roomCard) throw new Error('Card do cômodo não encontrado');

    const supportSelector = roomCard.querySelector('select');
    if (!roomCard.textContent?.includes('Quem normalmente faz esta tarefa?')) {
      throw new Error('ExecutionTargetSelector deve ser exibido com clareza no corpo do cômodo');
    }
  });

  // HF2-06: Preservação dos selos Disponível, Já ativa e Reativar
  record('HF2-06', 'Preservação visual dos selos Disponível, Já ativa e Reativar', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [
          // Suíte já ativa
          {
            id: 'ft-suite-1',
            familyId: 'fam-juriti',
            taskMasterId: 'bath-4',
            name: 'Limpar o espelho do banheiro',
            roomId: 'room-suite',
            frequency: 'WEEKLY',
            preferredDays: [3],
            preferredTime: '09:00',
            estimatedMinutes: 15,
            active: true,
            executionTarget: 'HOUSEHOLD',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          // Social arquivada
          {
            id: 'ft-social-archived',
            familyId: 'fam-juriti',
            taskMasterId: 'bath-4',
            name: 'Limpar o espelho do banheiro',
            roomId: 'room-social',
            frequency: 'WEEKLY',
            preferredDays: [3],
            preferredTime: '09:00',
            estimatedMinutes: 15,
            active: false,
            executionTarget: 'HOUSEHOLD',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const badgeAlready = document.getElementById(`room-status-already-${sampleTask.id}-room-suite`);
    const badgeReactivate = document.getElementById(`room-status-reactivate-${sampleTask.id}-room-social`);
    const badgeAvailable = document.getElementById(`room-status-available-${sampleTask.id}-room-lavabo`);

    if (!badgeAlready || !badgeAlready.textContent?.includes('Já ativa')) {
      throw new Error('Selo Já ativa não encontrado ou incorreto');
    }
    if (!badgeReactivate || !badgeReactivate.textContent?.includes('Reativar')) {
      throw new Error('Selo Reativar não encontrado ou incorreto');
    }
    if (!badgeAvailable || !badgeAvailable.textContent?.includes('Disponível')) {
      throw new Error('Selo Disponível não encontrado ou incorreto');
    }
  });

  // HF2-07: Resumo consolidado e rodapé sempre visíveis e acessíveis
  record('HF2-07', 'Resumo consolidado e rodapé de confirmação sempre acessíveis', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const summarySection = document.getElementById('batch-config-confirmation-summary');
    const footerSummary = document.getElementById('batch-config-summary');
    const confirmBtn = document.getElementById('btn-batch-confirm-add');
    const cancelBtn = document.getElementById('btn-batch-cancel-config');

    if (!summarySection || !footerSummary || !confirmBtn || !cancelBtn) {
      throw new Error('Elementos do resumo e rodapé devem estar sempre presentes e acessíveis');
    }
  });

  // HF2-08: Barra superior de configuração comum preservada
  record('HF2-08', 'Barra superior de configuração comum preservada e funcional', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const quickApplyBar = document.getElementById('batch-config-quick-apply');
    const globalRoomSelect = document.getElementById('select-global-room');
    const globalTimeInput = document.getElementById('input-global-time');
    const globalApplyBtn = document.getElementById('btn-apply-global-time');

    if (!quickApplyBar || !globalRoomSelect || !globalTimeInput || !globalApplyBtn) {
      throw new Error('Barra de configuração comum rápida deve estar presente');
    }
  });

  // HF2-09: Avisos de incompatibilidade têm espaço suficiente e texto completo
  record('HF2-09', 'Avisos de incompatibilidade têm espaço suficiente e não cortam texto', () => {
    document.body.innerHTML = '';
    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTaskBox], // Limpar vidros do box no Lavabo gera aviso
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const checkLavabo = document.getElementById(`check-task-${sampleTaskBox.id}-room-lavabo`) as HTMLInputElement;
    act(() => {
      fireEvent.click(checkLavabo);
    });

    const warningEl = document.getElementById(`compat-warning-${sampleTaskBox.id}-room-lavabo`);
    if (!warningEl) {
      throw new Error('Aviso de compatibilidade do box no lavabo deve estar visível');
    }

    if (!warningEl.textContent?.includes('box')) {
      throw new Error('Texto do aviso de compatibilidade deve mencionar box');
    }

    const confirmCheckbox = document.getElementById(`confirm-compat-${sampleTaskBox.id}-room-lavabo`);
    if (!confirmCheckbox) {
      throw new Error('Checkbox de confirmação de compatibilidade deve estar acessível');
    }
  });

  // HF2-10: Dois ambientes selecionados simultaneamente em layout de coluna única
  record('HF2-10', 'Dois ambientes selecionados simultaneamente em coluna única geram payload correto', () => {
    document.body.innerHTML = '';
    let confirmed: BatchAddRoutineInput[] = [];

    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async (payload) => { confirmed = payload; }
      })
    );

    const checkSuite = document.getElementById(`check-task-${sampleTask.id}-room-suite`) as HTMLInputElement;
    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSuite);
      fireEvent.click(checkSocial);
    });

    if (!checkSuite.checked || !checkSocial.checked) {
      throw new Error('Ambos os ambientes devem estar marcados');
    }

    const confirmBtn = document.getElementById('btn-batch-confirm-add') as HTMLButtonElement;
    act(() => {
      fireEvent.click(confirmBtn);
    });

    if (confirmed.length !== 2) {
      throw new Error(`Deveriam ser geradas 2 rotinas independentes, obtido: ${confirmed.length}`);
    }
    const roomIds = confirmed.map(c => c.roomId);
    if (!roomIds.includes('room-suite') || !roomIds.includes('room-social')) {
      throw new Error('Payload deve conter room-suite e room-social');
    }
  });

  return results;
}
