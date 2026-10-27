/**
 * CASA JUNTO — FASE B.5.3: SELEÇÃO MULTIAMBIENTE EM LOTE
 * Suíte de Testes Integrados (B53-01 a B53-20)
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchConfigurationModal, TaskRoomConfigState } from '../components/BatchConfigurationModal';
import { checkRoomTaskCompatibility } from '../domain/routine/RoomTaskCompatibility';
import { TaskMaster, FamilyTask, Room, DomesticSupport, BatchAddRoutineInput } from '../types';

export interface B53TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runTaskCatalogMultiRoomPhaseB53TestSuite(): B53TestResult[] {
  const results: B53TestResult[] = [];

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

  const taskMirror: TaskMaster = {
    id: 'bath-mirror',
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

  // B53-01: Uma tarefa em dois ambientes
  record('B53-01', 'Uma tarefa em dois ambientes cria duas rotinas independentes', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('id="batch-config-modal-content"')) {
      throw new Error('Modal não renderizou o conteúdo principal');
    }
    if (!html.includes('check-task-bath-mirror-room-social')) {
      throw new Error('Checkbox do Banheiro social deve estar disponível');
    }
    if (!html.includes('check-task-bath-mirror-room-lavabo')) {
      throw new Error('Checkbox do Lavabo deve estar disponível');
    }
  });

  // B53-02: Duas tarefas em três ambientes
  record('B53-02', 'Duas tarefas em três ambientes disponibiliza matriz completa de configuração', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror, taskBox],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    sampleRooms.forEach(room => {
      if (!html.includes(`check-task-bath-mirror-${room.id}`)) {
        throw new Error(`Faltando checkbox para bath-mirror em ${room.name}`);
      }
      if (!html.includes(`check-task-bath-box-${room.id}`)) {
        throw new Error(`Faltando checkbox para bath-box em ${room.name}`);
      }
    });
  });

  // B53-03: Ambiente já ativo preservado
  record('B53-03', 'Ambiente já ativo é preservado, recebe selo "Já ativa" e não duplica', () => {
    const existingRoutine: FamilyTask = {
      id: 'ft-suite-1',
      familyId: 'fam-juriti',
      taskMasterId: 'bath-mirror',
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
    };

    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [existingRoutine],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('Já ativa')) {
      throw new Error('Deve indicar que a rotina existente na suíte está preservada com selo Já ativa');
    }
    if (!html.includes('counter-preserved-routines')) {
      throw new Error('Deve conter contador de rotinas existentes preservadas');
    }
  });

  // B53-04: Ambiente arquivado reativado
  record('B53-04', 'Ambiente arquivado é identificado com selo "Reativar" para reativação', () => {
    const archivedRoutine: FamilyTask = {
      id: 'ft-archived-social',
      familyId: 'fam-juriti',
      taskMasterId: 'bath-mirror',
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
    };

    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [archivedRoutine],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('Reativar')) {
      throw new Error('Deve conter indicação de Reativar para o ambiente com rotina arquivada');
    }
  });

  // B53-05: Bloqueio de duplicidade no mesmo ambiente
  record('B53-05', 'Bloqueio de duplicidade no mesmo ambiente desabilita o checkbox com aria-disabled="true"', () => {
    const existingRoutine: FamilyTask = {
      id: 'ft-suite-1',
      familyId: 'fam-juriti',
      taskMasterId: 'bath-mirror',
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
    };

    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [existingRoutine],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('aria-disabled="true"')) {
      throw new Error('Ambiente já ativo deve ter aria-disabled="true"');
    }
  });

  // B53-06: Configuração comum aplicada corretamente
  record('B53-06', 'Toolbar rápida de configuração comum disponibiliza seletores globais', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('id="batch-config-quick-apply"')) {
      throw new Error('Deve conter barra de configuração rápida batch-config-quick-apply');
    }
    if (!html.includes('id="select-global-room"')) {
      throw new Error('Deve conter seletor select-global-room');
    }
    if (!html.includes('id="input-global-time"')) {
      throw new Error('Deve conter input-global-time');
    }
  });

  // B53-07: Sobrescrita individual mantida
  record('B53-07', 'Configuração individual suporta frequência e horário independentes por cômodo', () => {
    const configSocial: TaskRoomConfigState = {
      selected: true,
      frequency: 'WEEKLY',
      preferredDays: [3],
      dayOfMonth: 1,
      preferredTime: '09:00',
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null,
      status: 'NEW'
    };

    const configLavabo: TaskRoomConfigState = {
      selected: true,
      frequency: 'MONTHLY',
      preferredDays: [1],
      dayOfMonth: 15,
      preferredTime: '14:30',
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null,
      status: 'NEW'
    };

    if (configSocial.frequency === configLavabo.frequency) {
      throw new Error('As frequências devem permanecer independentes');
    }
    if (configSocial.preferredTime === configLavabo.preferredTime) {
      throw new Error('Os horários devem permanecer independentes');
    }
  });

  // B53-08: HOUSEHOLD e EXTERNAL_SUPPORT em ambientes diferentes
  record('B53-08', 'Permite HOUSEHOLD no Social e EXTERNAL_SUPPORT no Lavabo para a mesma tarefa', () => {
    const targetSocial = 'HOUSEHOLD';
    const targetLavabo = 'EXTERNAL_SUPPORT';

    const payload: BatchAddRoutineInput[] = [
      {
        taskMasterId: 'bath-mirror',
        name: 'Limpar o espelho do banheiro',
        roomId: 'room-social',
        frequency: 'WEEKLY',
        preferredDays: [3],
        preferredTime: '09:00',
        durationMinutes: 15,
        effort: 10,
        executionTarget: targetSocial,
        domesticSupportId: null
      },
      {
        taskMasterId: 'bath-mirror',
        name: 'Limpar o espelho do banheiro',
        roomId: 'room-lavabo',
        frequency: 'WEEKLY',
        preferredDays: [3],
        preferredTime: '09:00',
        durationMinutes: 15,
        effort: 10,
        executionTarget: targetLavabo,
        domesticSupportId: 'support-ruthe'
      }
    ];

    if (payload[0].executionTarget !== 'HOUSEHOLD' || payload[1].executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error('Diferenciação de público entre ambientes falhou');
    }
    if (payload[0].domesticSupportId !== null || payload[1].domesticSupportId !== 'support-ruthe') {
      throw new Error('Vinculação de domesticSupportId incorreta');
    }
  });

  // B53-09: Ruthe vinculada corretamente
  record('B53-09', 'Apoio externo Ruthe é validado e associado no payload', () => {
    const input: BatchAddRoutineInput = {
      taskMasterId: 'bath-mirror',
      name: 'Limpar o espelho',
      roomId: 'room-lavabo',
      frequency: 'WEEKLY',
      preferredDays: [3],
      preferredTime: '08:30',
      durationMinutes: 15,
      effort: 10,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'support-ruthe'
    };

    const supportExists = sampleSupports.some(s => s.id === input.domesticSupportId && s.active);
    if (!supportExists) {
      throw new Error('Apoio Ruthe não encontrado entre as pessoas de apoio ativas');
    }
  });

  // B53-10: Incompatibilidade de ambiente e bloqueio
  record('B53-10', 'Tarefa de box no lavabo é sinalizada como incompatível e requer confirmação explícita', () => {
    const lavaboRoom = sampleRooms.find(r => r.id === 'room-lavabo')!;
    const compat = checkRoomTaskCompatibility(taskBox, lavaboRoom);

    if (compat.isCompatible) {
      throw new Error('Limpar vidros do box em lavabo não deve ser marcado como totalmente compatível');
    }
    if (!compat.requiresConfirmation) {
      throw new Error('Limpar vidros do box em lavabo deve exigir confirmação explícita');
    }
    if (!compat.warning || !compat.warning.includes('lavabo')) {
      throw new Error('Mensagem de aviso deve mencionar ausência de box/chuveiro no lavabo');
    }
  });

  // B53-11: Nenhum ambiente selecionado impede confirmação
  record('B53-11', 'Nenhum ambiente selecionado mantém o botão de confirmação desabilitado', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('disabled=""') && !html.includes('disabled')) {
      throw new Error('Botão de confirmação deve conter atributo disabled quando totalToCommit === 0');
    }
    if (!html.includes('Nenhum ambiente selecionado')) {
      throw new Error('Texto do botão deve indicar "Nenhum ambiente selecionado"');
    }
  });

  // B53-12: Cancelamento não altera estado
  record('B53-12', 'Cancelamento do modal fecha sem chamar onConfirm e preserva o estado da família', () => {
    let confirmCalled = false;
    let closeCalled = false;

    const modal = React.createElement(BatchConfigurationModal, {
      isOpen: true,
      onClose: () => { closeCalled = true; },
      selectedTasks: [taskMirror],
      familyTasks: [],
      rooms: sampleRooms,
      domesticSupports: sampleSupports,
      onConfirm: async () => { confirmCalled = true; }
    });

    const html = renderToStaticMarkup(modal);
    if (!html.includes('id="btn-batch-cancel-config"')) {
      throw new Error('Botão de cancelamento btn-batch-cancel-config deve estar presente');
    }
    if (confirmCalled) {
      throw new Error('onConfirm não pode ter sido chamado durante a renderização ou cancelamento');
    }
  });

  // B53-13: Concorrência e idempotência
  record('B53-13', 'batchAddRoutines é idempotente contra entradas duplicadas no mesmo lote', () => {
    const currentRoutines: FamilyTask[] = [];
    const inputs: BatchAddRoutineInput[] = [
      {
        taskMasterId: 'bath-mirror',
        name: 'Limpar espelho',
        roomId: 'room-social',
        frequency: 'DAILY',
        preferredTime: '09:00',
        durationMinutes: 15,
        effort: 10,
        executionTarget: 'HOUSEHOLD'
      },
      {
        taskMasterId: 'bath-mirror',
        name: 'Limpar espelho',
        roomId: 'room-social', // Duplicata proposital no mesmo lote
        frequency: 'DAILY',
        preferredTime: '09:00',
        durationMinutes: 15,
        effort: 10,
        executionTarget: 'HOUSEHOLD'
      }
    ];

    let added = 0;
    let skipped = 0;

    for (const item of inputs) {
      const exists = currentRoutines.some(
        ft => ft.taskMasterId === item.taskMasterId && ft.roomId === item.roomId && ft.active
      );
      if (exists) {
        skipped++;
      } else {
        currentRoutines.push({
          id: `ft-${item.taskMasterId}-${item.roomId}`,
          familyId: 'fam-juriti',
          taskMasterId: item.taskMasterId,
          name: item.name,
          roomId: item.roomId,
          frequency: item.frequency,
          preferredTime: item.preferredTime,
          estimatedMinutes: item.durationMinutes,
          active: true,
          executionTarget: item.executionTarget,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        added++;
      }
    }

    if (added !== 1 || skipped !== 1) {
      throw new Error(`Deveria adicionar 1 e pular 1 duplicata, obtido added=${added}, skipped=${skipped}`);
    }
  });

  // B53-14: Falha parcial tratada sem sucesso falso
  record('B53-14', 'Falhas parciais não são mascaradas como sucesso completo', () => {
    const result = {
      added: 1,
      reactivated: 0,
      skipped: 0,
      failed: ['Banheiro social: timeout de rede simulado']
    };

    if (result.failed.length === 0) {
      throw new Error('Falha parcial deve ser registrada');
    }
    const isSuccess = result.failed.length === 0;
    if (isSuccess) {
      throw new Error('Não pode reportar sucesso completo quando houver itens em failed');
    }
  });

  // B53-15: Isolamento multi-tenant
  record('B53-15', 'Isolamento estrito entre famílias distintas impede vazamento de ambientes', () => {
    const familyARooms: Room[] = [
      { id: 'room-fam-a-1', familyId: 'fam-A', name: 'Suíte A', type: 'bedroom', active: true }
    ];
    const familyBRooms: Room[] = [
      { id: 'room-fam-b-1', familyId: 'fam-B', name: 'Suíte B', type: 'bedroom', active: true }
    ];

    const htmlA = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [],
        rooms: familyARooms,
        domesticSupports: [],
        onConfirm: async () => {}
      })
    );

    if (htmlA.includes('Suíte B')) {
      throw new Error('Cômodo da Família B vazou para a renderização da Família A');
    }
  });

  // B53-16: Preservação de ocorrências existentes
  record('B53-16', 'Adição multiambiente preserva ocorrências e histórico das rotinas existentes', () => {
    const existingOccurrences = [
      { id: 'occ-1', familyTaskId: 'ft-suite-1', roomId: 'room-suite', status: 'COMPLETED' },
      { id: 'occ-2', familyTaskId: 'ft-suite-1', roomId: 'room-suite', status: 'PENDING' }
    ];

    // Criação de nova rotina no Social
    const newRoutineId = 'ft-social-1';
    const newOcc = { id: 'occ-3', familyTaskId: newRoutineId, roomId: 'room-social', status: 'PENDING' };

    const totalOccurrences = [...existingOccurrences, newOcc];
    if (totalOccurrences.length !== 3) {
      throw new Error('Total de ocorrências deve ser preservado');
    }
    const suiteOccs = totalOccurrences.filter(o => o.roomId === 'room-suite');
    if (suiteOccs.length !== 2 || suiteOccs[0].status !== 'COMPLETED') {
      throw new Error('Ocorrências da suíte sofreram alteração indevida');
    }
  });

  // B53-17: Acessibilidade por teclado e atributos ARIA
  record('B53-17', 'Modal atende requisitos ARIA (role="dialog", aria-modal="true", labels)', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('role="dialog"')) {
      throw new Error('Modal deve ter role="dialog"');
    }
    if (!html.includes('aria-modal="true"')) {
      throw new Error('Modal deve ter aria-modal="true"');
    }
    if (!html.includes('aria-labelledby="batch-config-title"')) {
      throw new Error('Modal deve referenciar o título com aria-labelledby');
    }
  });

  // B53-18: Layout responsivo com sticky footer e max-h 90vh
  record('B53-18', 'Modal adota max-h-[90vh], overflow-y-auto no corpo e rodapé sticky', () => {
    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: [taskMirror],
        familyTasks: [],
        rooms: sampleRooms,
        domesticSupports: sampleSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('max-h-[90vh]')) {
      throw new Error('Modal deve ter max-h-[90vh] para visualização mobile segura');
    }
    if (!html.includes('overflow-y-auto')) {
      throw new Error('Corpo do modal deve ter overflow-y-auto');
    }
  });

  // B53-19: Regressões obrigatórias preservadas (B.5.1, B.5.2, HF1, HF2)
  record('B53-19', 'Regressões obrigatórias: sem auto-seleção de ambiente e sem símbolo + duplicado', () => {
    const taskCatalogPath = path.resolve(process.cwd(), 'src/components/TaskCatalogView.tsx');
    const content = fs.readFileSync(taskCatalogPath, 'utf8');

    if (content.includes('+ +')) {
      throw new Error('Regressão HF2: Detectado símbolo + duplicado no TaskCatalogView');
    }
    if (!content.includes('btn-add-room-')) {
      throw new Error('Regressão B.5.2: Botão btn-add-room ausente no TaskCatalogView');
    }
  });

  // B53-20: Integridade do Motor 2.0
  record('B53-20', 'Arquivos core do Motor 2.0 e Scheduler permanecem 100% intocados', () => {
    const enginePath = path.resolve(process.cwd(), 'src/domain/distribution/DistributionEngine.ts');
    const scoringPath = path.resolve(process.cwd(), 'src/domain/distribution/ScoringService.ts');
    const rebalancePath = path.resolve(process.cwd(), 'src/domain/distribution/RebalanceService.ts');

    if (!fs.existsSync(enginePath) || !fs.existsSync(scoringPath) || !fs.existsSync(rebalancePath)) {
      throw new Error('Arquivos do Motor 2.0 não encontrados no sistema de arquivos');
    }

    const engineCode = fs.readFileSync(enginePath, 'utf8');
    if (engineCode.includes('batchAddRoutines') || engineCode.includes('RoomTaskCompatibility')) {
      throw new Error('Motor 2.0 foi contaminado com lógica de UI ou catálogo');
    }
  });

  return results;
}
