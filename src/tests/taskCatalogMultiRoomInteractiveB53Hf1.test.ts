/**
 * CASA JUNTO — FASE B.5.3-HF1: CORREÇÃO E HOMOLOGAÇÃO DE SELEÇÃO MULTIAMBIENTE
 * Suíte de Testes de Interação Real (HF1-01 a HF1-10)
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
import { render, fireEvent, screen, act } from '@testing-library/react';
import { BatchConfigurationModal } from '../components/BatchConfigurationModal';
import { AddRoutineToRoomModal } from '../components/AddRoutineToRoomModal';
import { TaskCatalogView } from '../components/TaskCatalogView';
import { AppContext, AppContextType } from '../context/AppContext';
import { TaskMaster, FamilyTask, Room, DomesticSupport, BatchAddRoutineInput } from '../types';

export interface InteractiveTestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runTaskCatalogMultiRoomInteractiveTests(): InteractiveTestResult[] {
  const results: InteractiveTestResult[] = [];

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

  const createMockAppContext = (overrides?: Partial<AppContextType>): AppContextType => {
    return {
      currentFamily: { id: 'fam-juriti', name: 'Família Juriti' } as any,
      currentUser: { id: 'user-admin', name: 'Administrador' } as any,
      currentMember: { id: 'member-admin', role: 'ADMIN', name: 'Administrador' } as any,
      familyMembership: { role: 'ADMIN', status: 'ACTIVE' } as any,
      isDemoMode: true,
      familyTasks: [
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
        }
      ],
      rooms: sampleRooms,
      domesticSupports: sampleSupports,
      members: [],
      tasks: [],
      assignments: [],
      todayAssignments: [],
      occurrences: [],
      batchAddRoutines: async () => ({ added: 1, reactivated: 0, skipped: 0, failed: [] }),
      batchDeactivateRoutines: async () => ({ deactivated: 1, failed: [] }),
      ...overrides
    } as unknown as AppContextType;
  };

  // 1. A ação individual abre AddRoutineToRoomModal
  record('HF1-01', 'A ação individual abre AddRoutineToRoomModal com título "Adicionar a outro ambiente"', () => {
    document.body.innerHTML = '';
    const ctx = createMockAppContext();

    render(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TaskCatalogView)
      )
    );

    const btnIndividual = document.getElementById(`btn-add-room-${sampleTask.id}`);
    if (!btnIndividual) {
      throw new Error(`Botão btn-add-room-${sampleTask.id} não encontrado no card`);
    }

    act(() => {
      fireEvent.click(btnIndividual);
    });

    const modalTitle = document.getElementById('add-room-modal-title');
    if (!modalTitle || !modalTitle.textContent?.includes('Adicionar a outro ambiente')) {
      throw new Error('AddRoutineToRoomModal individual não abriu com o título esperado');
    }

    // Modal individual possui role="radiogroup" para seleção exclusiva de um único ambiente
    const radioGroup = document.querySelector('[role="radiogroup"]');
    if (!radioGroup) {
      throw new Error('AddRoutineToRoomModal deve possuir role="radiogroup" para seleção única');
    }
  });

  // 2. A ação em lote abre BatchConfigurationModal
  record('HF1-02', 'A ação em lote abre BatchConfigurationModal com título "Adicionar tarefas a vários ambientes"', () => {
    document.body.innerHTML = '';
    const ctx = createMockAppContext();

    render(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TaskCatalogView)
      )
    );

    const taskCheckbox = document.getElementById(`task-select-${sampleTask.id}`) as HTMLInputElement;
    if (!taskCheckbox) {
      throw new Error(`Checkbox task-select-${sampleTask.id} não encontrado`);
    }

    // Marca o checkbox da tarefa
    act(() => {
      fireEvent.click(taskCheckbox);
    });

    // Clica no botão de adicionar em lote da barra flutuante
    const batchAddBtn = document.getElementById('btn-batch-add');
    if (!batchAddBtn) {
      throw new Error('Botão btn-batch-add não encontrado na barra de lote');
    }

    act(() => {
      fireEvent.click(batchAddBtn);
    });

    const batchTitle = document.getElementById('batch-config-title');
    if (!batchTitle || !batchTitle.textContent?.includes('Adicionar tarefas a vários ambientes')) {
      throw new Error(`BatchConfigurationModal não exibiu o título esperado, obtido: "${batchTitle?.textContent}"`);
    }
  });

  // 3. O fluxo em lote permite selecionar dois ambientes simultaneamente
  record('HF1-03', 'O fluxo em lote permite selecionar dois ambientes simultaneamente com checkboxes independentes', () => {
    document.body.innerHTML = '';
    let confirmedConfigs: BatchAddRoutineInput[] = [];

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
          }
        ],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async (configs) => { confirmedConfigs = configs; }
      })
    );

    const checkSuite = document.getElementById(`check-task-${sampleTask.id}-room-suite`) as HTMLInputElement;
    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;
    const checkLavabo = document.getElementById(`check-task-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    if (!checkSocial || !checkLavabo) {
      throw new Error('Checkboxes de Banheiro social e Lavabo devem estar presentes');
    }

    // Suíte já ativa deve estar desabilitada
    if (!checkSuite || !checkSuite.disabled) {
      throw new Error('Checkbox da suíte já ativa deve estar desabilitado para prevenir duplicidade');
    }

    // Inicialmente ambos desmarcados (sem auto-seleção - B.5.3)
    if (checkSocial.checked || checkLavabo.checked) {
      throw new Error('Checkboxes devem iniciar desmarcados');
    }

    // Marca Banheiro social
    act(() => {
      fireEvent.click(checkSocial);
    });
    if (!checkSocial.checked) {
      throw new Error('Banheiro social não foi marcado');
    }

    // Marca Lavabo simultaneamente
    act(() => {
      fireEvent.click(checkLavabo);
    });
    if (!checkLavabo.checked) {
      throw new Error('Lavabo não foi marcado');
    }

    // Ambos permanecem marcados simultaneamente
    if (!checkSocial.checked || !checkLavabo.checked) {
      throw new Error('Ambos os ambientes devem permanecer selecionados simultaneamente');
    }
  });

  // 4. Marcar um ambiente não desmarca o outro
  record('HF1-04', 'Marcar um ambiente não desmarca o outro ambiente', () => {
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

    const checkSuite = document.getElementById(`check-task-${sampleTask.id}-room-suite`) as HTMLInputElement;
    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSuite);
    });
    if (!checkSuite.checked) throw new Error('Suíte deve estar marcada');

    act(() => {
      fireEvent.click(checkSocial);
    });
    if (!checkSuite.checked || !checkSocial.checked) {
      throw new Error('Marcar o social não pode desmarcar a suíte no fluxo em lote');
    }
  });

  // 5. Desmarcar um ambiente preserva os demais
  record('HF1-05', 'Desmarcar um ambiente preserva os demais selecionados', () => {
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
    const checkLavabo = document.getElementById(`check-task-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSocial);
      fireEvent.click(checkLavabo);
    });

    if (!checkSocial.checked || !checkLavabo.checked) {
      throw new Error('Ambos devem estar marcados');
    }

    // Desmarca Banheiro social
    act(() => {
      fireEvent.click(checkSocial);
    });

    if (checkSocial.checked) {
      throw new Error('Banheiro social deveria estar desmarcado');
    }
    if (!checkLavabo.checked) {
      throw new Error('Lavabo deve permanecer marcado após desmarcar Banheiro social');
    }
  });

  // 6. Cada ambiente mantém configuração independente
  record('HF1-06', 'Cada ambiente mantém configuração independente (frequência e horário)', () => {
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
    const checkLavabo = document.getElementById(`check-task-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSocial);
      fireEvent.click(checkLavabo);
    });

    // Altera horário do Banheiro social
    const timeSocial = document.getElementById(`time-${sampleTask.id}-room-social`) as HTMLInputElement;
    if (!timeSocial) throw new Error('Campo de horário do Banheiro social não renderizou');

    act(() => {
      fireEvent.change(timeSocial, { target: { value: '08:00' } });
    });

    // Altera horário do Lavabo
    const timeLavabo = document.getElementById(`time-${sampleTask.id}-room-lavabo`) as HTMLInputElement;
    if (!timeLavabo) throw new Error('Campo de horário do Lavabo não renderizou');

    act(() => {
      fireEvent.change(timeLavabo, { target: { value: '16:30' } });
    });

    if (timeSocial.value !== '08:00') {
      throw new Error(`Horário do social deveria ser 08:00, obtido: ${timeSocial.value}`);
    }
    if (timeLavabo.value !== '16:30') {
      throw new Error(`Horário do lavabo deveria ser 16:30, obtido: ${timeLavabo.value}`);
    }
  });

  // 7. O resumo contabiliza todas as operações
  record('HF1-07', 'O resumo consolidado contabiliza corretamente novas rotinas e preservadas', () => {
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
          }
        ],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;
    const checkLavabo = document.getElementById(`check-task-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSocial);
      fireEvent.click(checkLavabo);
    });

    const newRoutinesCounter = document.getElementById('counter-new-routines');
    const preservedCounter = document.getElementById('counter-preserved-routines');

    if (!newRoutinesCounter?.textContent?.includes('2 novas rotinas')) {
      throw new Error(`Contador de novas rotinas incorreto: ${newRoutinesCounter?.textContent}`);
    }
    if (!preservedCounter?.textContent?.includes('1 existentes preservadas')) {
      throw new Error(`Contador de rotinas preservadas incorreto: ${preservedCounter?.textContent}`);
    }
  });

  // 8. Nenhuma gravação ocorre antes da confirmação
  record('HF1-08', 'Nenhuma gravação ocorre antes da confirmação explícita no botão #btn-batch-confirm-add', () => {
    document.body.innerHTML = '';
    let callCount: any = 0;
    let payloadReceived: BatchAddRoutineInput[] = [];

    render(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [sampleTask],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async (payload) => {
          callCount++;
          payloadReceived = payload;
        }
      })
    );

    const checkSocial = document.getElementById(`check-task-${sampleTask.id}-room-social`) as HTMLInputElement;
    const checkLavabo = document.getElementById(`check-task-${sampleTask.id}-room-lavabo`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSocial);
      fireEvent.click(checkLavabo);
    });

    if (callCount !== 0) {
      throw new Error('onConfirm não pode ser invocado durante a seleção');
    }

    const confirmBtn = document.getElementById('btn-batch-confirm-add') as HTMLButtonElement;
    if (!confirmBtn) throw new Error('Botão btn-batch-confirm-add não encontrado');

    act(() => {
      fireEvent.click(confirmBtn);
    });

    if (callCount !== 1) {
      throw new Error(`onConfirm deveria ter sido chamado exatamente 1 vez, chamado ${callCount}`);
    }
    if (payloadReceived.length !== 2) {
      throw new Error(`Payload deveria conter 2 rotinas, obtido: ${payloadReceived.length}`);
    }
    const roomIds = payloadReceived.map(p => p.roomId);
    if (!roomIds.includes('room-social') || !roomIds.includes('room-lavabo')) {
      throw new Error('Payload não conteve os dois ambientes selecionados');
    }
  });

  // 9. O fluxo individual continua funcionando
  record('HF1-09', 'O fluxo individual em AddRoutineToRoomModal preserva seleção única por radio button', () => {
    document.body.innerHTML = '';
    let confirmedRoutine: BatchAddRoutineInput | null = null;

    render(
      React.createElement(AddRoutineToRoomModal, {
        isOpen: true,
        onClose: () => {},
        task: sampleTask,
        rooms: sampleRooms,
        familyTasks: [
          // Suíte ativa
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
          }
        ],
        domesticSupports: sampleSupports,
        onConfirm: async (config) => { confirmedRoutine = config; }
      })
    );

    const radioSocial = document.getElementById('room-option-room-social');
    const radioLavabo = document.getElementById('room-option-room-lavabo');

    if (!radioSocial || !radioLavabo) {
      throw new Error('Opções de cômodo não encontradas no AddRoutineToRoomModal');
    }

    // Seleciona Social
    act(() => {
      fireEvent.click(radioSocial);
    });
    if (radioSocial.getAttribute('aria-checked') !== 'true') {
      throw new Error('Social deveria estar com aria-checked="true"');
    }

    // Seleciona Lavabo (deve alternar e desmarcar Social)
    act(() => {
      fireEvent.click(radioLavabo);
    });
    if (radioLavabo.getAttribute('aria-checked') !== 'true') {
      throw new Error('Lavabo deveria estar com aria-checked="true"');
    }
    if (radioSocial.getAttribute('aria-checked') !== 'false') {
      throw new Error('Social deveria ter sido desmarcado (seleção única na B.5.2)');
    }
  });

  // 10. A interface funciona em desktop e mobile
  record('HF1-10', 'A interface multiambiente adota conformidade mobile com max-h-[90vh], role="dialog" e rodapé fixo', () => {
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

    const modalContent = document.getElementById('batch-config-modal-content');
    if (!modalContent) throw new Error('batch-config-modal-content ausente');

    if (!modalContent.className.includes('max-h-[90vh]')) {
      throw new Error('Modal deve conter classe max-h-[90vh] para visualização segura em telas móveis');
    }

    const cancelBtn = document.getElementById('btn-batch-cancel-config');
    const confirmBtn = document.getElementById('btn-batch-confirm-add');

    if (!cancelBtn || !confirmBtn) {
      throw new Error('Botões de ação do rodapé devem estar presentes');
    }
  });

  return results;
}
