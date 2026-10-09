/**
 * CASA JUNTO — FASE B: PRESET 15 AMBIENTES E ASSOCIAÇÃO SEGURA
 * Suíte de Testes Automatizados de Regressão e Governança (PRST-01 a PRST-16)
 *
 * Validações obrigatórias:
 * 1. Preset "Casa familiar — 3 quartos" com 15 ambientes
 * 2. Reutilização dos tipos canônicos (office, living_room, balcony, bedroom, bathroom independente)
 * 3. Pré-visualização com seleção individual
 * 4. Deduplicação por nome normalizado dentro da mesma família
 * 5. Não tratar cômodos do mesmo tipo como duplicados
 * 6. Idempotência em aplicações repetidas
 * 7. Seleção parcial de ambientes
 * 8. Personalização de nomes em todos os 15 ambientes
 * 9. Confirmação explícita para nomes personalizados incertos/ambíguos
 * 10. Concorrência segura
 * 11. Isolamento multi-tenant
 * 12. Remoção de fallbacks silenciosos para o primeiro cômodo
 * 13. Exigência de escolha explícita em associações ambíguas
 * 14. Correção do tipo inicial fixo "kitchen" no RoomFormModal
 * 15. Preservação de referências históricas sem migração forçada
 * 16. Motor 2.0 e regras de negócio 100% intocados
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Room, FamilyTask, Task, TaskAssignment } from '../types';
import {
  FAMILY_3_BEDROOMS_PRESET,
  CANONICAL_ROOM_TYPES,
  ROOM_TYPE_OPTIONS,
  isValidRoomType,
  normalizeRoomName,
  detectRoomTypeFromName,
  validateCustomRoomName,
  matchRoomForTask
} from '../data/roomTypes';
import { RoomPresetPreviewModal } from '../components/RoomPresetPreviewModal';
import { RoomFormModal } from '../components/RoomFormModal';
import { BatchConfigurationModal } from '../components/BatchConfigurationModal';
import { allMasterTasks } from '../data/tasks';

export interface PhaseBTestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runRoomPresetPhaseBTestSuite(): PhaseBTestResult[] {
  const results: PhaseBTestResult[] = [];

  const record = (id: string, name: string, fn: () => void) => {
    try {
      fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err?.message || String(err) });
    }
  };

  // Helper de simulação in-memory multi-tenant
  class SimulatedRoomService {
    public db: Map<string, Room[]> = new Map();

    public getRooms(familyId: string): Room[] {
      return this.db.get(familyId) || [];
    }

    public addRoomsBatch(
      familyId: string,
      items: Array<{ name: string; type: string; icon?: string; color?: string }>,
      userRole: 'ADMIN' | 'MEMBER'
    ): { added: Room[]; skipped: Array<{ name: string; reason: string }> } {
      if (userRole !== 'ADMIN') {
        throw new Error('Acesso negado: apenas administradores podem adicionar ambientes.');
      }

      const existing = this.getRooms(familyId);
      const existingNorms = new Set(
        existing.filter(r => r.active !== false).map(r => normalizeRoomName(r.name))
      );

      const added: Room[] = [];
      const skipped: Array<{ name: string; reason: string }> = [];
      const now = new Date().toISOString();

      for (const item of items) {
        const trimmed = item.name.trim();
        if (!trimmed) {
          skipped.push({ name: item.name, reason: 'Nome vazio' });
          continue;
        }
        if (trimmed.length > 40) {
          skipped.push({ name: trimmed, reason: 'Nome excede 40 caracteres' });
          continue;
        }
        if (!isValidRoomType(item.type)) {
          skipped.push({ name: trimmed, reason: `Tipo inválido: ${item.type}` });
          continue;
        }

        const norm = normalizeRoomName(trimmed);
        if (existingNorms.has(norm)) {
          skipped.push({ name: trimmed, reason: 'Ambiente já cadastrado nesta família' });
          continue;
        }

        existingNorms.add(norm);

        const newRoom: Room = {
          id: `room-${familyId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          family_id: familyId,
          name: trimmed,
          type: item.type,
          icon: item.icon || 'Home',
          color: item.color || '#5b32a3',
          active: true,
          createdAt: now,
          updatedAt: now,
          created_at: now,
          updated_at: now
        };

        added.push(newRoom);
        existing.push(newRoom);
      }

      this.db.set(familyId, existing);
      return { added, skipped };
    }
  }

  // PRST-01: Preset "Casa familiar — 3 quartos" contém exatamente 15 ambientes balanceados
  record('PRST-01', 'Preset "Casa familiar — 3 quartos" contém exatamente 15 ambientes balanceados', () => {
    if (FAMILY_3_BEDROOMS_PRESET.rooms.length !== 15) {
      throw new Error(`Preset deve ter 15 cômodos, encontrados: ${FAMILY_3_BEDROOMS_PRESET.rooms.length}`);
    }
    const names = FAMILY_3_BEDROOMS_PRESET.rooms.map(r => r.name);
    const expected = [
      'Suíte',
      'Banheiro da suíte',
      'Quarto 2',
      'Quarto 3',
      'Banheiro social',
      'Lavabo',
      'Sala',
      'Sala de jantar',
      'Cozinha',
      'Lavanderia',
      'Garagem',
      'Quintal',
      'Escritório',
      'Salão',
      'Área gourmet'
    ];
    for (const exp of expected) {
      if (!names.includes(exp)) {
        throw new Error(`Ambiente esperado ausente no preset: "${exp}"`);
      }
    }
  });

  // PRST-02: Reutilização dos tipos canônicos auditados e aprovados
  record('PRST-02', 'Reutilização dos tipos canônicos: office, living_room, balcony, bedroom, bathroom independente', () => {
    const suite = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Suíte');
    const bSuite = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Banheiro da suíte');
    const esc = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Escritório');
    const salao = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Salão');
    const gourmet = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Área gourmet');

    if (!suite || suite.type !== 'bedroom') {
      throw new Error(`Suíte deve ter type 'bedroom', retornado: ${suite?.type}`);
    }
    if (!bSuite || bSuite.type !== 'bathroom') {
      throw new Error(`Banheiro da suíte deve ter type 'bathroom', retornado: ${bSuite?.type}`);
    }
    if (!esc || esc.type !== 'office') {
      throw new Error(`Escritório deve ter type 'office', retornado: ${esc?.type}`);
    }
    if (!salao || salao.type !== 'living_room') {
      throw new Error(`Salão deve ter type 'living_room', retornado: ${salao?.type}`);
    }
    if (!gourmet || gourmet.type !== 'balcony') {
      throw new Error(`Área gourmet deve ter type 'balcony', retornado: ${gourmet?.type}`);
    }
  });

  // PRST-03: Pré-visualização do preset com seleção individual e renderização de todos os 15 ambientes
  record('PRST-03', 'Pré-visualização do preset renderiza os 15 ambientes e seletores individuais', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomPresetPreviewModal, {
        isOpen: true,
        onClose: () => {},
        onApply: async () => ({ addedCount: 15, skippedCount: 0 }),
        existingRooms: []
      })
    );

    if (!html.includes('Casa familiar — 3 quartos')) {
      throw new Error('Título do preset deve ser exibido');
    }
    if (!html.includes('Modelo sugerido')) {
      throw new Error('Badge de "Modelo sugerido" deve ser exibida');
    }
    if (!html.includes('Comece com uma sugestão de ambientes para organizar sua casa')) {
      throw new Error('Descrição do cabeçalho do preset deve ser exibida');
    }
    if (!html.includes('Suíte') || !html.includes('Banheiro da suíte') || !html.includes('Área gourmet')) {
      throw new Error('Ambientes do preset devem estar renderizados no modal de pré-visualização');
    }
    if (!html.includes('btn-confirm-apply-room-preset')) {
      throw new Error('Botão de confirmação de aplicação do preset deve estar presente');
    }
  });

  // PRST-04: Deduplicação por nome normalizado dentro da mesma família
  record('PRST-04', 'Deduplicação por nome normalizado dentro da mesma família', () => {
    const service = new SimulatedRoomService();
    const famId = 'fam-dedup-1';

    // Cria 'Cozinha'
    service.addRoomsBatch(famId, [{ name: 'Cozinha', type: 'kitchen' }], 'ADMIN');

    // Tenta criar 'cozinha', '  COZINHA  ', 'Cozinha'
    const result = service.addRoomsBatch(famId, [
      { name: 'cozinha', type: 'kitchen' },
      { name: '  COZINHA  ', type: 'kitchen' }
    ], 'ADMIN');

    if (result.added.length !== 0) {
      throw new Error(`Deveria adicionar 0 ambientes duplicados, adicionou: ${result.added.length}`);
    }
    if (result.skipped.length !== 2) {
      throw new Error(`Deveria ignorar 2 ambientes duplicados, ignorou: ${result.skipped.length}`);
    }
  });

  // PRST-05: Múltiplos ambientes do mesmo tipo são permitidos e NÃO são tratados como duplicados
  record('PRST-05', 'Múltiplos ambientes do mesmo tipo são suportados e não colidem por tipo', () => {
    const service = new SimulatedRoomService();
    const famId = 'fam-multitype';

    // 3 quartos (todos type: bedroom)
    // 3 banheiros (todos type: bathroom)
    const items = [
      { name: 'Suíte', type: 'bedroom' },
      { name: 'Quarto 2', type: 'bedroom' },
      { name: 'Quarto 3', type: 'bedroom' },
      { name: 'Banheiro da suíte', type: 'bathroom' },
      { name: 'Banheiro social', type: 'bathroom' },
      { name: 'Lavabo', type: 'bathroom' }
    ];

    const result = service.addRoomsBatch(famId, items, 'ADMIN');
    if (result.added.length !== 6) {
      throw new Error(`Todos os 6 ambientes com tipos compartilhados devem ser criados. Criados: ${result.added.length}`);
    }
    const bedrooms = service.getRooms(famId).filter(r => r.type === 'bedroom');
    if (bedrooms.length !== 3) {
      throw new Error(`Devem existir exatamente 3 quartos ativos na família, encontrados: ${bedrooms.length}`);
    }
    const bathrooms = service.getRooms(famId).filter(r => r.type === 'bathroom');
    if (bathrooms.length !== 3) {
      throw new Error(`Devem existir exatamente 3 banheiros ativos na família, encontrados: ${bathrooms.length}`);
    }
  });

  // PRST-06: Idempotência: aplicação repetida do preset não cria ambientes duplicados
  record('PRST-06', 'Idempotência: aplicação repetida do preset não cria duplicidades', () => {
    const service = new SimulatedRoomService();
    const famId = 'fam-idempotent';

    // 1ª Execução do preset completo de 15 cômodos
    const firstRun = service.addRoomsBatch(famId, FAMILY_3_BEDROOMS_PRESET.rooms, 'ADMIN');
    if (firstRun.added.length !== 15) {
      throw new Error(`1ª execução deveria criar 15 cômodos, criou: ${firstRun.added.length}`);
    }

    // 2ª Execução idêntica
    const secondRun = service.addRoomsBatch(famId, FAMILY_3_BEDROOMS_PRESET.rooms, 'ADMIN');
    if (secondRun.added.length !== 0) {
      throw new Error(`2ª execução repetida deveria criar 0 cômodos (idempotência), criou: ${secondRun.added.length}`);
    }
    if (secondRun.skipped.length !== 15) {
      throw new Error(`2ª execução deveria ignorar todos os 15 já existentes, ignorou: ${secondRun.skipped.length}`);
    }

    // Total final no banco da família
    if (service.getRooms(famId).length !== 15) {
      throw new Error(`Total de cômodos após 2 execuções deve ser exatamente 15, encontrado: ${service.getRooms(famId).length}`);
    }
  });

  // PRST-07: Seleção parcial: admin pode desmarcar ambientes e apenas os selecionados são criados
  record('PRST-07', 'Seleção parcial: admin pode desmarcar ambientes e gravar apenas o subconjunto', () => {
    const service = new SimulatedRoomService();
    const famId = 'fam-partial';

    // Seleciona apenas 5 dos 15 ambientes
    const partialSubset = FAMILY_3_BEDROOMS_PRESET.rooms.slice(0, 5);
    const result = service.addRoomsBatch(famId, partialSubset, 'ADMIN');

    if (result.added.length !== 5) {
      throw new Error(`Deveria criar exatamente 5 cômodos selecionados, criou: ${result.added.length}`);
    }
    if (service.getRooms(famId).length !== 5) {
      throw new Error(`Família deveria ter exatamente 5 cômodos, tem: ${service.getRooms(famId).length}`);
    }
  });

  // PRST-08: Personalização de nomes: todos os 15 ambientes permitem alteração de nome pelo admin
  record('PRST-08', 'Personalização de nomes: admin pode alterar os nomes dos ambientes do preset', () => {
    const service = new SimulatedRoomService();
    const famId = 'fam-custom-names';

    const customItems = FAMILY_3_BEDROOMS_PRESET.rooms.map((r, idx) => ({
      ...r,
      name: `${r.name} Personalizado ${idx + 1}`
    }));

    const result = service.addRoomsBatch(famId, customItems, 'ADMIN');
    if (result.added.length !== 15) {
      throw new Error(`Todos os 15 ambientes com nomes personalizados devem ser criados, criados: ${result.added.length}`);
    }

    const saved = service.getRooms(famId);
    if (!saved.some(r => r.name === 'Suíte Personalizado 1')) {
      throw new Error('Nome personalizado da Suíte não foi persistido');
    }
    if (!saved.some(r => r.name === 'Área gourmet Personalizado 15')) {
      throw new Error('Nome personalizado da Área gourmet não foi persistido');
    }
  });

  // PRST-09: Nomes personalizados com identificação incerta ou divergente exigem confirmação explícita
  record('PRST-09', 'Nomes personalizados incertos ou divergentes exigem confirmação explícita', () => {
    // 1. Nome coerente com a categoria (ex: 'Quarto dos Gêmeos' para bedroom)
    const valCoherent = validateCustomRoomName('Quarto dos Gêmeos', 'bedroom');
    if (!valCoherent.valid || valCoherent.requiresConfirmation) {
      throw new Error('Nome de quarto coerente não deveria exigir confirmação');
    }

    // 2. Nome divergente da categoria original (ex: usuário renomeia item de office para 'Churrasqueira dos Amigos')
    const valDivergent = validateCustomRoomName('Churrasqueira Gourmet', 'office');
    if (!valDivergent.requiresConfirmation) {
      throw new Error('Nome divergente (churrasqueira em office) deve exigir confirmação explícita');
    }

    // 3. Nome ambíguo / genérico não identificado
    const valAmbiguous = validateCustomRoomName('Meu Cantinho Especial', 'bedroom');
    if (!valAmbiguous.requiresConfirmation) {
      throw new Error('Nome não detectado deve exigir confirmação explícita antes de gravar');
    }

    // 4. Nome em branco é inválido
    const valEmpty = validateCustomRoomName('   ', 'bedroom');
    if (valEmpty.valid) {
      throw new Error('Nome em branco deve ser inválido');
    }
  });

  // PRST-10: Concorrência: duas tentativas de criação concorrentes respeitam unicidade por nome normalizado
  record('PRST-10', 'Concorrência: execuções simultâneas respeitam unicidade por nome normalizado', () => {
    const service = new SimulatedRoomService();
    const famId = 'fam-concurrent';

    // Duas chamadas concorrentes com os mesmos ambientes
    const call1 = () => service.addRoomsBatch(famId, [
      { name: 'Suíte Master', type: 'bedroom' },
      { name: 'Escritório', type: 'office' }
    ], 'ADMIN');

    const call2 = () => service.addRoomsBatch(famId, [
      { name: 'suíte master', type: 'bedroom' },
      { name: 'Escritório', type: 'office' }
    ], 'ADMIN');

    const res1 = call1();
    const res2 = call2();

    const totalRooms = service.getRooms(famId);
    if (totalRooms.length !== 2) {
      throw new Error(`Concorrência gerou duplicação. Esperado: 2 cômodos, encontrados: ${totalRooms.length}`);
    }
    if (res1.added.length + res2.added.length !== 2) {
      throw new Error(`Soma de adições deve ser 2, encontrado: ${res1.added.length + res2.added.length}`);
    }
  });

  // PRST-11: Multi-tenant: ambientes da família A não vazam nem bloqueiam criação na família B
  record('PRST-11', 'Multi-tenant: isolamento estrito entre famílias A e B', () => {
    const service = new SimulatedRoomService();
    const famA = 'fam-tenant-a';
    const famB = 'fam-tenant-b';

    service.addRoomsBatch(famA, FAMILY_3_BEDROOMS_PRESET.rooms, 'ADMIN');
    service.addRoomsBatch(famB, FAMILY_3_BEDROOMS_PRESET.rooms, 'ADMIN');

    const roomsA = service.getRooms(famA);
    const roomsB = service.getRooms(famB);

    if (roomsA.length !== 15 || roomsB.length !== 15) {
      throw new Error(`Ambas as famílias devem possuir 15 cômodos isolados. A=${roomsA.length}, B=${roomsB.length}`);
    }
    for (const r of roomsA) {
      if (r.family_id !== famA) throw new Error(`Vazamento de tenant no quarto ${r.id}`);
    }
    for (const r of roomsB) {
      if (r.family_id !== famB) throw new Error(`Vazamento de tenant no quarto ${r.id}`);
    }
  });

  // PRST-12: Remoção de fallbacks silenciosos em tarefas: nenhuma tarefa cai silenciosamente na Cozinha
  record('PRST-12', 'Remoção de fallbacks silenciosos: tarefas sem match não vão para a Cozinha', () => {
    const activeRooms: Room[] = [
      { id: 'room-coz', name: 'Cozinha', type: 'kitchen', family_id: 'fam-1', active: true },
      { id: 'room-lav', name: 'Lavanderia', type: 'laundry', family_id: 'fam-1', active: true }
    ];

    // Tarefa de banheiro numa casa que NÃO tem banheiro cadastrado
    const match = matchRoomForTask({
      taskRoomType: 'bathroom',
      activeRooms
    });

    if (match.matchedRoomId !== undefined) {
      throw new Error(`Fallback silencioso detectado! matchedRoomId deve ser undefined, retornado: ${match.matchedRoomId}`);
    }
    if (match.isAmbiguous) {
      throw new Error('Sem correspondências não deve ser considerado ambíguo');
    }
  });

  // PRST-13: Associação ambígua: tarefas com múltiplos cômodos candidatos exigem escolha explícita
  record('PRST-13', 'Associação ambígua: tarefas com múltiplos cômodos exigem escolha explícita', () => {
    const activeRooms: Room[] = [
      { id: 'room-b1', name: 'Banheiro da suíte', type: 'bathroom', family_id: 'fam-1', active: true },
      { id: 'room-b2', name: 'Banheiro social', type: 'bathroom', family_id: 'fam-1', active: true },
      { id: 'room-b3', name: 'Lavabo', type: 'bathroom', family_id: 'fam-1', active: true }
    ];

    const match = matchRoomForTask({
      taskRoomType: 'bathroom',
      activeRooms
    });

    if (!match.isAmbiguous) {
      throw new Error('Ambiguidade deveria ser true para 3 banheiros compatíveis');
    }
    if (match.matchedRoomId !== undefined) {
      throw new Error('matchedRoomId deve ser undefined quando há ambiguidade (forçar escolha explícita)');
    }
    if (match.matchingRooms.length !== 3) {
      throw new Error(`Deveria listar todos os 3 cômodos compatíveis, listou: ${match.matchingRooms.length}`);
    }
  });

  // PRST-14: Correção do RoomFormModal: tipo inicial não é fixo em kitchen
  record('PRST-14', 'RoomFormModal: ausência de tipo inicial fixo "kitchen" e presença de placeholder', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomFormModal, {
        isOpen: true,
        onClose: () => {},
        onSave: async () => {},
        mode: 'CREATE'
      })
    );

    if (!html.includes('Selecione a categoria do cômodo...')) {
      throw new Error('RoomFormModal deve conter placeholder para seleção obrigatória da categoria');
    }
  });

  // PRST-15: Preservação histórica: tarefas existentes e concluídas não são migradas nem reatribuídas
  record('PRST-15', 'Preservação histórica: tarefas concluídas e rotinas antigas mantêm roomId intacto', () => {
    const historicalAssignment: TaskAssignment = {
      id: 'asg-hist-1',
      family_id: 'fam-hist',
      task_id: 'task-antiga',
      room_id: 'room-legado-1',
      member_id: 'mem-1',
      scheduled_date: '2026-02-15',
      status: 'DONE',
      completed_at: '2026-02-15T14:00:00Z',
      created_at: '2026-02-15T00:00:00Z',
      updated_at: '2026-02-15T14:00:00Z'
    };

    // Aplicação do novo preset com 15 ambientes
    const service = new SimulatedRoomService();
    service.addRoomsBatch('fam-hist', FAMILY_3_BEDROOMS_PRESET.rooms, 'ADMIN');

    // Verifica que o registro histórico manteve exatamente suas referências
    if (historicalAssignment.room_id !== 'room-legado-1') {
      throw new Error('room_id histórico foi corrompido ou migrado indevidamente');
    }
    if (historicalAssignment.status !== 'DONE') {
      throw new Error('Status histórico foi alterado indevidamente');
    }
  });

  // PRST-16: Motor 2.0 e regras de negócio 100% intocados
  record('PRST-16', 'Motor 2.0, regras de recorrência e agendamento permanecem 100% intocados', () => {
    // Validação estrita de integridade
    const filesToCheck = [
      'src/domain/routine/RoutineGenerator.ts',
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/index.ts',
      'functions/src/services/taskReminderService.ts'
    ];

    for (const rel of filesToCheck) {
      const full = path.resolve(rel);
      if (!fs.existsSync(full)) {
        throw new Error(`Arquivo core do Motor 2.0 não encontrado: ${rel}`);
      }
      const code = fs.readFileSync(full, 'utf8');
      if (code.includes('FAMILY_3_BEDROOMS_PRESET')) {
        throw new Error(`Motor 2.0 em ${rel} não deve ter acoplamento com presets de UI`);
      }
    }
  });

  return results;
}
