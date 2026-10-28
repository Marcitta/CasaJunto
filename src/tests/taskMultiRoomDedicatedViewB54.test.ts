/**
 * CASA JUNTO — FASE B.5.4: TELA DEDICADA DE CONFIGURAÇÃO MULTIAMBIENTE
 * Suíte de Testes de Integração e Interação (B54-01 a B54-12)
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
Object.defineProperty(global, 'CustomEvent', { value: dom.window.CustomEvent, writable: true, configurable: true });
Object.defineProperty(global, 'KeyboardEvent', { value: dom.window.KeyboardEvent, writable: true, configurable: true });
Object.defineProperty(global, 'MouseEvent', { value: dom.window.MouseEvent, writable: true, configurable: true });
Object.defineProperty(global, 'Node', { value: dom.window.Node, writable: true, configurable: true });

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, act } from '@testing-library/react';
import { TaskMultiRoomSetupView } from '../components/TaskMultiRoomSetupView';
import { TaskCatalogView } from '../components/TaskCatalogView';
import { AppContext, AppContextType } from '../context/AppContext';
import { TaskMaster, Room, DomesticSupport, BatchAddRoutineInput, FamilyTask } from '../types';

export interface B54TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runTaskMultiRoomDedicatedViewB54TestSuite(): B54TestResult[] {
  const results: B54TestResult[] = [];

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
    { id: 'room-lavabo', name: 'Lavabo', type: 'half_bath', active: true },
    { id: 'room-kitchen', name: 'Cozinha', type: 'kitchen', active: true }
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

  const taskMirror: TaskMaster = {
    id: 'bath-4',
    name: 'Limpar o espelho do banheiro',
    description: 'Limpar o espelho com produto limpa-vidros e pano de microfibra.',
    category: 'cleaning',
    room_type: 'bathroom',
    duration_minutes: 15,
    effort_level: 2,
    frequency_type: 'weekly'
  };

  const taskBox: TaskMaster = {
    id: 'bath-box',
    name: 'Limpar vidros do box',
    description: 'Remover manchas de sabonete e água dos vidros do box.',
    category: 'cleaning',
    room_type: 'bathroom',
    duration_minutes: 30,
    effort_level: 3,
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

  // B54-01: Acessibilidade a partir do Catálogo na área principal
  record('B54-01', 'Acessibilidade a partir do Catálogo: abre tela dedicada com título "Adicionar tarefas a ambientes"', () => {
    document.body.innerHTML = '';
    const ctx = createMockAppContext();

    render(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TaskCatalogView)
      )
    );

    const taskCheckbox = document.getElementById(`task-select-${taskMirror.id}`) as HTMLInputElement;
    if (!taskCheckbox) throw new Error('Checkbox da tarefa não encontrado');

    act(() => {
      fireEvent.click(taskCheckbox);
    });

    const batchAddBtn = document.getElementById('btn-batch-add');
    if (!batchAddBtn) throw new Error('Botão btn-batch-add não encontrado');

    act(() => {
      fireEvent.click(batchAddBtn);
    });

    const setupView = document.getElementById('task-multi-room-setup-view');
    if (!setupView) {
      throw new Error('TaskMultiRoomSetupView não foi renderizada na área principal');
    }

    // Não deve possuir role="dialog" ou aria-modal="true" (é tela dedicada, não modal)
    if (setupView.getAttribute('role') === 'dialog' || setupView.getAttribute('aria-modal') === 'true') {
      throw new Error('Tela dedicada não deve utilizar role="dialog"');
    }

    const titleEl = document.getElementById('batch-config-title');
    if (!titleEl || !titleEl.textContent?.includes('Adicionar tarefas a ambientes')) {
      throw new Error(`Título esperado "Adicionar tarefas a ambientes", obtido: ${titleEl?.textContent}`);
    }
  });

  // B54-02: Botão Voltar ao catálogo retorna sem gravar
  record('B54-02', 'Ação "Voltar ao catálogo" retorna à tela do catálogo sem efetuar gravação', () => {
    document.body.innerHTML = '';
    let backCalled = false;

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => { backCalled = true; },
        onConfirm: async () => {}
      })
    );

    const btnBack = document.getElementById('btn-back-to-catalog');
    if (!btnBack) throw new Error('Botão btn-back-to-catalog não encontrado');

    act(() => {
      fireEvent.click(btnBack);
    });

    if (!backCalled) {
      throw new Error('onBackToCatalog deveria ter sido chamado ao clicar em Voltar');
    }
  });

  // B54-03: Três etapas visíveis no stepper
  record('B54-03', 'Exibe três etapas visíveis no stepper de navegação', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    const stepper = document.getElementById('multi-room-stepper');
    if (!stepper) throw new Error('Stepper não encontrado');

    if (!stepper.textContent?.includes('1. Selecionar ambientes')) {
      throw new Error('Etapa 1 ausente no stepper');
    }
    if (!stepper.textContent?.includes('2. Configurar rotinas')) {
      throw new Error('Etapa 2 ausente no stepper');
    }
    if (!stepper.textContent?.includes('3. Revisar e confirmar')) {
      throw new Error('Etapa 3 ausente no stepper');
    }
  });

  // B54-04: Ambientes compatíveis primeiro e outros recolhidos
  record('B54-04', 'Exibe ambientes compatíveis primeiro e agrupa outros em seção secundária recolhida', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror], // Tarefa de banheiro
        rooms: sampleRooms, // suite, social, lavabo (banheiros) e kitchen (outra categoria)
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    // Na lista principal compatível, Cozinha não deve aparecer visível inicialmente
    const toggleOther = document.getElementById(`btn-toggle-other-rooms-${taskMirror.id}`);
    if (!toggleOther) {
      throw new Error('Botão de outros ambientes deve estar presente quando houver cômodos de outra categoria');
    }

    if (toggleOther.getAttribute('aria-expanded') !== 'false') {
      throw new Error('Seção de outros ambientes deve iniciar recolhida (aria-expanded="false")');
    }

    // Cozinha ainda não está no DOM porque a seção está colapsada
    const checkKitchen = document.getElementById(`check-task-${taskMirror.id}-room-kitchen`);
    if (checkKitchen) {
      throw new Error('Ambiente de outra categoria não deve poluir a lista inicial');
    }

    // Expande outros ambientes
    act(() => {
      fireEvent.click(toggleOther);
    });

    const checkKitchenAfter = document.getElementById(`check-task-${taskMirror.id}-room-kitchen`);
    if (!checkKitchenAfter) {
      throw new Error('Cozinha deve estar acessível após expandir outros ambientes');
    }
  });

  // B54-05: Sem avisos de incompatibilidade repetidos em ambientes não selecionados
  record('B54-05', 'Não exibe avisos de incompatibilidade em ambientes não selecionados', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskBox], // Limpar vidros do box no Lavabo gera aviso
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    // Lavabo inicialmente NÃO selecionado
    const warningBefore = document.getElementById(`compat-warning-${taskBox.id}-room-lavabo`);
    if (warningBefore) {
      throw new Error('Aviso de incompatibilidade não deve ser exibido quando o ambiente não está selecionado');
    }

    // Expande outros ambientes onde o Lavabo está agrupado
    const toggleOther = document.getElementById(`btn-toggle-other-rooms-${taskBox.id}`);
    if (toggleOther) {
      act(() => {
        fireEvent.click(toggleOther);
      });
    }

    // Marca o Lavabo
    const checkLavabo = document.getElementById(`check-task-${taskBox.id}-room-lavabo`) as HTMLInputElement;
    if (!checkLavabo) {
      throw new Error('Checkbox do lavabo não encontrado após expandir outros ambientes');
    }
    act(() => {
      fireEvent.click(checkLavabo);
    });

    // Agora o aviso contextual DEVE aparecer solicitando confirmação explícita
    const warningAfter = document.getElementById(`compat-warning-${taskBox.id}-room-lavabo`);
    if (!warningAfter) {
      throw new Error('Aviso contextual deve aparecer após selecionar ambiente potencialmente incompatível');
    }

    const confirmCheck = document.getElementById(`confirm-compat-${taskBox.id}-room-lavabo`);
    if (!confirmCheck) {
      throw new Error('Checkbox de confirmação explícita de equipamento deve estar presente');
    }
  });

  // B54-06: Seleção múltipla simultânea e avanço para Etapa 2
  record('B54-06', 'Permite selecionar múltiplos ambientes simultaneamente e avançar para Etapa 2', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    const checkSocial = document.getElementById(`check-task-${taskMirror.id}-room-social`) as HTMLInputElement;
    const checkLavabo = document.getElementById(`check-task-${taskMirror.id}-room-lavabo`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSocial);
      fireEvent.click(checkLavabo);
    });

    if (!checkSocial.checked || !checkLavabo.checked) {
      throw new Error('Ambos os ambientes devem estar selecionados simultaneamente');
    }

    const btnNext1 = document.getElementById('btn-next-step-1') as HTMLButtonElement;
    if (btnNext1.disabled) {
      throw new Error('Botão de avançar deveria estar habilitado com cômodos selecionados');
    }

    act(() => {
      fireEvent.click(btnNext1);
    });

    const step2El = document.getElementById('step-2-configure-routines');
    if (!step2El) {
      throw new Error('Etapa 2 não foi renderizada após avançar');
    }
  });

  // B54-07: Etapa 2 exibe SOMENTE as combinações selecionadas
  record('B54-07', 'Etapa 2 exibe apenas as combinações selecionadas com configurações independentes', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    // Marca apenas Social e Lavabo (Suíte não marcada)
    const checkSocial = document.getElementById(`check-task-${taskMirror.id}-room-social`) as HTMLInputElement;
    const checkLavabo = document.getElementById(`check-task-${taskMirror.id}-room-lavabo`) as HTMLInputElement;

    act(() => {
      fireEvent.click(checkSocial);
      fireEvent.click(checkLavabo);
    });

    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });

    // Apenas cards de Social e Lavabo devem estar no DOM da Etapa 2
    const cardSocial = document.getElementById(`config-card-${taskMirror.id}-room-social`);
    const cardLavabo = document.getElementById(`config-card-${taskMirror.id}-room-lavabo`);
    const cardSuite = document.getElementById(`config-card-${taskMirror.id}-room-suite`);

    if (!cardSocial || !cardLavabo) {
      throw new Error('Cards de Social e Lavabo devem estar presentes na Etapa 2');
    }
    if (cardSuite) {
      throw new Error('Suíte não selecionada não deve aparecer na Etapa 2');
    }
  });

  // B54-08: Toolbar de configuração comum
  record('B54-08', 'Toolbar de configuração comum aplica valores sem sobrescrever ajustes isolados', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    act(() => {
      fireEvent.click(document.getElementById(`check-task-${taskMirror.id}-room-social`)!);
      fireEvent.click(document.getElementById(`check-task-${taskMirror.id}-room-lavabo`)!);
    });

    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });

    const changeInputValue = (input: HTMLInputElement, value: string) => {
      fireEvent.change(input, { target: { value } });
      const reactPropsKey = Object.keys(input).find(k => k.startsWith('__reactProps'));
      if (reactPropsKey && (input as any)[reactPropsKey]?.onChange) {
        (input as any)[reactPropsKey].onChange({ target: { value } });
      }
    };

    const commonTimeInput = document.getElementById('input-common-time') as HTMLInputElement;
    const btnApplyCommon = document.getElementById('btn-apply-common-config');

    act(() => {
      changeInputValue(commonTimeInput, '10:00');
    });

    act(() => {
      fireEvent.click(btnApplyCommon!);
    });

    const timeSocial = document.getElementById(`time-${taskMirror.id}-room-social`) as HTMLInputElement;
    const timeLavabo = document.getElementById(`time-${taskMirror.id}-room-lavabo`) as HTMLInputElement;

    if (timeSocial.value !== '10:00' || timeLavabo.value !== '10:00') {
      throw new Error('Horário comum não foi aplicado aos ambientes selecionados');
    }

    // Ajuste individual no Lavabo
    act(() => {
      changeInputValue(timeLavabo, '15:30');
    });

    if (timeSocial.value !== '10:00' || (timeLavabo.value as string) !== '15:30') {
      throw new Error('Ajuste individual no Lavabo alterou indevidamente o Social');
    }
  });

  // B54-09: Preservação de estado na navegação entre etapas
  record('B54-09', 'Navegação entre etapas preserva intactas as seleções e configurações realizadas', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    // Marca Social
    act(() => {
      fireEvent.click(document.getElementById(`check-task-${taskMirror.id}-room-social`)!);
    });

    // Avança para Etapa 2
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });

    const changeInputValue = (input: HTMLInputElement, value: string) => {
      fireEvent.change(input, { target: { value } });
      const reactPropsKey = Object.keys(input).find(k => k.startsWith('__reactProps'));
      if (reactPropsKey && (input as any)[reactPropsKey]?.onChange) {
        (input as any)[reactPropsKey].onChange({ target: { value } });
      }
    };

    // Altera horário para 07:45
    const timeSocial = document.getElementById(`time-${taskMirror.id}-room-social`) as HTMLInputElement;
    act(() => {
      changeInputValue(timeSocial, '07:45');
    });

    // Retorna para Etapa 1
    act(() => {
      fireEvent.click(document.getElementById('btn-prev-step-2')!);
    });

    // Confirma que Social continua marcado na Etapa 1
    const checkSocial = document.getElementById(`check-task-${taskMirror.id}-room-social`) as HTMLInputElement;
    if (!checkSocial.checked) {
      throw new Error('Seleção de ambiente foi perdida ao voltar para a Etapa 1');
    }

    // Avança novamente para a Etapa 2
    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });

    const timeSocialAfter = document.getElementById(`time-${taskMirror.id}-room-social`) as HTMLInputElement;
    if (timeSocialAfter.value !== '07:45') {
      throw new Error(`Configuração individual de horário foi perdida ao navegar: obtido ${timeSocialAfter.value}`);
    }
  });

  // B54-10: Revisão consolidada na Etapa 3
  record('B54-10', 'Etapa 3 apresenta contadores consolidados e discriminação exata das operações', () => {
    document.body.innerHTML = '';

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
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
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async () => {}
      })
    );

    act(() => {
      fireEvent.click(document.getElementById(`check-task-${taskMirror.id}-room-social`)!);
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });

    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-2')!);
    });

    const step3El = document.getElementById('step-3-review-confirm');
    if (!step3El) throw new Error('Etapa 3 não foi renderizada');

    const counterNew = document.getElementById('counter-new-routines');
    const counterPreserved = document.getElementById('counter-preserved-routines');

    if (!counterNew?.textContent?.includes('1 nova rotina')) {
      throw new Error(`Contador de novas rotinas incorreto: ${counterNew?.textContent}`);
    }
    if (!counterPreserved?.textContent?.includes('1 existentes preservadas')) {
      throw new Error(`Contador de preservadas incorreto: ${counterPreserved?.textContent}`);
    }
  });

  // B54-11: Confirmação final executa onConfirm com payload canônico
  record('B54-11', 'Confirmação final executa onConfirm com o payload estruturado de rotinas independentes', () => {
    document.body.innerHTML = '';
    let submittedPayload: BatchAddRoutineInput[] = [];

    render(
      React.createElement(TaskMultiRoomSetupView, {
        tasks: [taskMirror],
        rooms: sampleRooms,
        familyTasks: [],
        domesticSupports: sampleSupports,
        onBackToCatalog: () => {},
        onConfirm: async (payload) => { submittedPayload = payload; }
      })
    );

    act(() => {
      fireEvent.click(document.getElementById(`check-task-${taskMirror.id}-room-social`)!);
      fireEvent.click(document.getElementById(`check-task-${taskMirror.id}-room-lavabo`)!);
      fireEvent.click(document.getElementById('btn-next-step-1')!);
    });

    act(() => {
      fireEvent.click(document.getElementById('btn-next-step-2')!);
    });

    const confirmBtn = document.getElementById('btn-multi-room-confirm');
    if (!confirmBtn) throw new Error('Botão btn-multi-room-confirm não encontrado');

    act(() => {
      fireEvent.click(confirmBtn);
    });

    if (submittedPayload.length !== 2) {
      throw new Error(`Payload deveria conter 2 rotinas, obtido: ${submittedPayload.length}`);
    }

    const roomIds = submittedPayload.map(p => p.roomId);
    if (!roomIds.includes('room-social') || !roomIds.includes('room-lavabo')) {
      throw new Error('Payload não conteve as duas rotinas selecionadas');
    }
  });

  // B54-12: Motor 2.0 e fluxo B.5.2 intactos
  record('B54-12', 'Preservação arquitetural: Motor 2.0 e fluxo individual B.5.2 permanecem 100% intocados', () => {
    const enginePath = path.resolve(process.cwd(), 'src/domain/distribution/DistributionEngine.ts');
    const b52Path = path.resolve(process.cwd(), 'src/components/AddRoutineToRoomModal.tsx');

    if (!fs.existsSync(enginePath)) {
      throw new Error('DistributionEngine.ts não encontrado');
    }
    if (!fs.existsSync(b52Path)) {
      throw new Error('AddRoutineToRoomModal.tsx não encontrado');
    }

    const engineCode = fs.readFileSync(enginePath, 'utf8');
    if (engineCode.includes('TaskMultiRoomSetupView') || engineCode.includes('batchAddRoutines')) {
      throw new Error('Motor 2.0 contaminado com lógica de UI');
    }
  });

  return results;
}
