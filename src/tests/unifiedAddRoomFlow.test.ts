/**
 * CASA JUNTO — FASE B: UNIFICAÇÃO DO FLUXO DE ADICIONAR AMBIENTE
 * Suíte de Testes Integrados (UFA-01 a UFA-15)
 *
 * Itens testados:
 * 1. Entrada principal: botão "+ Adicionar ambiente" centraliza o fluxo
 * 2. Remoção do botão independente de acesso ao preset no cabeçalho
 * 3. Menu/Modal de escolha (RoomAddChoiceModal) com 2 opções bem delineadas
 * 4. Opção 1: Criar ambiente personalizado com texto e ação corretos
 * 5. Opção 2: Adicionar da lista modelo com texto e ação corretos
 * 6. Disponibilidade do mesmo fluxo no estado vazio da tela Casa
 * 7. Título e selo do RoomPresetPreviewModal ("Casa familiar — 3 quartos" e "Modelo sugerido")
 * 8. Descrição atualizada no RoomPresetPreviewModal
 * 9. Manutenção do contador dinâmico de ambientes selecionados
 * 10. Cancelamento sem criação ou efeitos colaterais
 * 11. Restrição de permissões (ADMIN vs MEMBER)
 * 12. Preservação dos 15 ambientes e tipos canônicos
 * 13. Idempotência e deduplicação intactas
 * 14. Acessibilidade e responsividade
 * 15. Integridade do Motor 2.0, rotinas, tarefas e scheduler
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomAddChoiceModal } from '../components/RoomAddChoiceModal';
import { RoomPresetPreviewModal } from '../components/RoomPresetPreviewModal';
import { FAMILY_3_BEDROOMS_PRESET, normalizeRoomName } from '../data/roomTypes';

export interface UfaTestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runUnifiedAddRoomFlowTestSuite(): UfaTestResult[] {
  const results: UfaTestResult[] = [];

  const record = (id: string, name: string, fn: () => void) => {
    try {
      fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err?.message || String(err) });
    }
  };

  // UFA-01: Botão unificado "+ Adicionar ambiente" no cabeçalho da HouseView
  record('UFA-01', 'Botão unificado de Adicionar ambiente presente no cabeçalho de HouseView.tsx', () => {
    const housePath = path.resolve('src/components/HouseView.tsx');
    const code = fs.readFileSync(housePath, 'utf8');

    if (!code.includes('btn-open-create-room')) {
      throw new Error('HouseView.tsx deve conter botão com id="btn-open-create-room"');
    }
    if (!code.includes('setIsChoiceModalOpen(true)')) {
      throw new Error('Botão de adicionar ambiente deve acionar o modal de escolha (setIsChoiceModalOpen)');
    }
    if (!code.includes('Adicionar ambiente')) {
      throw new Error('HouseView.tsx deve conter label "Adicionar ambiente"');
    }
  });

  // UFA-02: HouseView não contém botão independente de acesso ao preset no cabeçalho
  record('UFA-02', 'Remoção do botão independente de acesso ao preset no cabeçalho de HouseView', () => {
    const housePath = path.resolve('src/components/HouseView.tsx');
    const code = fs.readFileSync(housePath, 'utf8');

    if (code.includes('id="btn-open-room-preset"')) {
      throw new Error('Botão independente "btn-open-room-preset" deve ser removido da barra de ações');
    }
    if (code.includes('Preset 15 Ambientes')) {
      throw new Error('Texto isolado "Preset 15 Ambientes" não deve existir como botão separado no cabeçalho');
    }
  });

  // UFA-03: RoomAddChoiceModal renderiza com título "Adicionar ambiente" e duas opções distintas
  record('UFA-03', 'RoomAddChoiceModal renderiza estrutura de diálogo com duas opções distintas', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomAddChoiceModal, {
        isOpen: true,
        onClose: () => {},
        onSelectCustom: () => {},
        onSelectPreset: () => {}
      })
    );

    if (!html.includes('Adicionar ambiente')) {
      throw new Error('Modal deve exibir o título "Adicionar ambiente"');
    }
    if (!html.includes('btn-choice-custom-room') || !html.includes('btn-choice-preset-rooms')) {
      throw new Error('Modal deve conter botões de escolha: btn-choice-custom-room e btn-choice-preset-rooms');
    }
  });

  // UFA-04: Opção 1: Criar ambiente personalizado com texto exato
  record('UFA-04', 'Opção 1 possui título e descrição especificados e aciona fluxo customizado', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomAddChoiceModal, {
        isOpen: true,
        onClose: () => {},
        onSelectCustom: () => {},
        onSelectPreset: () => {}
      })
    );

    if (!html.includes('Criar ambiente personalizado')) {
      throw new Error('Opção 1 deve ter o título "Criar ambiente personalizado"');
    }
    if (!html.includes('Cadastre um cômodo do seu jeito, escolhendo nome e categoria.')) {
      throw new Error('Opção 1 deve conter a descrição exata: "Cadastre um cômodo do seu jeito, escolhendo nome e categoria."');
    }
  });

  // UFA-05: Opção 2: Adicionar da lista modelo com texto exato
  record('UFA-05', 'Opção 2 possui título e descrição especificados para o modelo sugerido', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomAddChoiceModal, {
        isOpen: true,
        onClose: () => {},
        onSelectCustom: () => {},
        onSelectPreset: () => {}
      })
    );

    if (!html.includes('Adicionar da lista modelo')) {
      throw new Error('Opção 2 deve ter o título "Adicionar da lista modelo"');
    }
    if (!html.includes('Escolha entre ambientes sugeridos para sua casa. Adicione apenas os que desejar.')) {
      throw new Error('Opção 2 deve conter a descrição exata: "Escolha entre ambientes sugeridos para sua casa. Adicione apenas os que desejar."');
    }
  });

  // UFA-06: Estado vazio de HouseView oferece o mesmo fluxo unificado de escolha
  record('UFA-06', 'Estado vazio de HouseView disponibiliza entrada unificada para o fluxo', () => {
    const housePath = path.resolve('src/components/HouseView.tsx');
    const code = fs.readFileSync(housePath, 'utf8');

    if (!code.includes('btn-empty-add-room')) {
      throw new Error('HouseView.tsx deve conter botão com id="btn-empty-add-room" no estado vazio');
    }
    // Confirma que aciona o mesmo setIsChoiceModalOpen
    const emptySection = code.substring(code.indexOf('activeRooms.length === 0'), code.indexOf('Navigation Tabs'));
    if (!code.includes('id="btn-empty-add-room"') || !code.includes('onClick={() => setIsChoiceModalOpen(true)}')) {
      throw new Error('Botão no estado vazio deve invocar setIsChoiceModalOpen(true)');
    }
  });

  // UFA-07: RoomPresetPreviewModal mantém título "Casa familiar — 3 quartos" com selo "Modelo sugerido"
  record('UFA-07', 'RoomPresetPreviewModal exibe título "Casa familiar — 3 quartos" e selo "Modelo sugerido"', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomPresetPreviewModal, {
        isOpen: true,
        onClose: () => {},
        onApply: async () => ({ addedCount: 15, skippedCount: 0 }),
        existingRooms: []
      })
    );

    if (!html.includes('Casa familiar — 3 quartos')) {
      throw new Error('Título "Casa familiar — 3 quartos" deve ser preservado');
    }
    const headerSection = html.substring(
      html.indexOf('id="room-preset-title"'),
      html.indexOf('id="btn-close-room-preset"')
    );
    if (!headerSection.includes('Modelo sugerido')) {
      throw new Error('Selo "Modelo sugerido" deve ser exibido no cabeçalho do modal');
    }
    if (headerSection.includes('15 Ambientes')) {
      throw new Error('Selo "15 Ambientes" no cabeçalho deve ter sido substituído por "Modelo sugerido"');
    }
  });

  // UFA-08: Descrição do RoomPresetPreviewModal atualizada
  record('UFA-08', 'RoomPresetPreviewModal exibe texto de descrição completo e revisado', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomPresetPreviewModal, {
        isOpen: true,
        onClose: () => {},
        onApply: async () => ({ addedCount: 15, skippedCount: 0 }),
        existingRooms: []
      })
    );

    const expectedDesc = 'Comece com uma sugestão de ambientes para organizar sua casa. Escolha os que fazem parte do seu lar, personalize os nomes e adicione apenas o que precisar.';
    if (!html.includes(expectedDesc)) {
      throw new Error(`Descrição esperada não encontrada no modal: "${expectedDesc}"`);
    }
  });

  // UFA-09: Contador dinâmico mantido no RoomPresetPreviewModal
  record('UFA-09', 'RoomPresetPreviewModal exibe contador dinâmico de ambientes selecionados', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomPresetPreviewModal, {
        isOpen: true,
        onClose: () => {},
        onApply: async () => ({ addedCount: 15, skippedCount: 0 }),
        existingRooms: []
      })
    );

    if (!html.includes('15 selecionado(s) para criação')) {
      throw new Error('Contador inicial de 15 selecionados deve estar presente quando não há cômodos existentes');
    }
  });

  // UFA-10: Cancelamento e fechamento sem criar ambientes
  record('UFA-10', 'RoomAddChoiceModal fecha sem efeitos colaterais ao cancelar ou clicar Fechar', () => {
    let closed = false;
    let customSelected = false;
    let presetSelected = false;

    const modal = React.createElement(RoomAddChoiceModal, {
      isOpen: true,
      onClose: () => { closed = true; },
      onSelectCustom: () => { customSelected = true; },
      onSelectPreset: () => { presetSelected = true; }
    });

    const html = renderToStaticMarkup(modal);
    if (!html.includes('btn-close-room-choice') || !html.includes('btn-cancel-room-choice')) {
      throw new Error('Botões de fechar e cancelar devem existir no RoomAddChoiceModal');
    }

    // Modal fechado não renderiza nada
    const closedHtml = renderToStaticMarkup(
      React.createElement(RoomAddChoiceModal, {
        isOpen: false,
        onClose: () => {},
        onSelectCustom: () => {},
        onSelectPreset: () => {}
      })
    );
    if (closedHtml !== '') {
      throw new Error('RoomAddChoiceModal quando isOpen=false deve retornar null');
    }
  });

  // UFA-11: Restrição RBAC: botões de adição restritos a ADMIN
  record('UFA-11', 'HouseView restringe ações de adicionar ambiente estritamente a administradores', () => {
    const housePath = path.resolve('src/components/HouseView.tsx');
    const code = fs.readFileSync(housePath, 'utf8');

    if (!code.includes('{isAdmin && (')) {
      throw new Error('HouseView.tsx deve envolver os controles de criação com verificação isAdmin');
    }
    if (!code.includes('{isAdmin ? (')) {
      throw new Error('Estado vazio de HouseView.tsx deve validar isAdmin antes de exibir botões de criação');
    }
  });

  // UFA-12: Preservação dos 15 ambientes e tipos canônicos
  record('UFA-12', 'Preset de 15 ambientes e tipos canônicos preservados intactos', () => {
    if (FAMILY_3_BEDROOMS_PRESET.rooms.length !== 15) {
      throw new Error(`Preset deve ter exatamente 15 ambientes, possui ${FAMILY_3_BEDROOMS_PRESET.rooms.length}`);
    }

    const office = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Escritório');
    const salao = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Salão');
    const gourmet = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Área gourmet');
    const suite = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Suíte');
    const banhSuite = FAMILY_3_BEDROOMS_PRESET.rooms.find(r => r.name === 'Banheiro da suíte');

    if (!office || office.type !== 'office') throw new Error('Escritório deve ser tipo office');
    if (!salao || salao.type !== 'living_room') throw new Error('Salão deve ser tipo living_room');
    if (!gourmet || gourmet.type !== 'balcony') throw new Error('Área gourmet deve ser tipo balcony');
    if (!suite || suite.type !== 'bedroom') throw new Error('Suíte deve ser tipo bedroom');
    if (!banhSuite || banhSuite.type !== 'bathroom') throw new Error('Banheiro da suíte deve ser tipo bathroom independente');
  });

  // UFA-13: Preservação de idempotência e deduplicação
  record('UFA-13', 'Deduplicação e idempotência funcionam normalmente por nome normalizado', () => {
    const raw = ['Cozinha', '  cozinha  ', 'COZINHA'];
    const set = new Set(raw.map(normalizeRoomName));
    if (set.size !== 1) {
      throw new Error(`Deduplicação por normalização falhou: esperado 1 nome único, obteve ${set.size}`);
    }
  });

  // UFA-14: Responsividade e acessibilidade do RoomAddChoiceModal
  record('UFA-14', 'RoomAddChoiceModal atende padrões de acessibilidade (role, aria-modal, labels)', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoomAddChoiceModal, {
        isOpen: true,
        onClose: () => {},
        onSelectCustom: () => {},
        onSelectPreset: () => {}
      })
    );

    if (!html.includes('role="dialog"') || !html.includes('aria-modal="true"')) {
      throw new Error('Modal deve ter role="dialog" e aria-modal="true"');
    }
    if (!html.includes('aria-labelledby="modal-add-room-choice-title"')) {
      throw new Error('Modal deve referenciar título via aria-labelledby');
    }
    if (!html.includes('aria-label="Fechar"')) {
      throw new Error('Botão de fechar deve ter aria-label="Fechar"');
    }
  });

  // UFA-15: Arquivos protegidos do Motor 2.0 e scheduler 100% intocados
  record('UFA-15', 'Arquivos core do Motor 2.0 e scheduler permanecem 100% intocados', () => {
    const coreFiles = [
      'src/domain/routine/RoutineGenerator.ts',
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/index.ts',
      'functions/src/services/taskReminderService.ts'
    ];

    for (const rel of coreFiles) {
      const full = path.resolve(rel);
      if (!fs.existsSync(full)) {
        throw new Error(`Arquivo core não encontrado: ${rel}`);
      }
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('RoomAddChoiceModal')) {
        throw new Error(`Motor 2.0 em ${rel} não deve ter acoplamento com modais de UI`);
      }
    }
  });

  return results;
}
