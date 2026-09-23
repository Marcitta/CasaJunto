/**
 * editTaskModalUX.test.ts
 * 
 * CASA JUNTO — UX-TASK-EDIT-1 TEST SUITE
 * REMOVE INTERNAL TECHNICAL LANGUAGE FROM EDIT TASK MODAL
 * 
 * Tests ET01 - ET08:
 * ET01 — No "Configuração Canônica" eyebrow in EditFamilyTaskModal
 * ET02 — Displays friendly title/eyebrow "Editar tarefa da casa"
 * ET03 — No "STAB-001" or "STAB" reference in UI
 * ET04 — Information block titled "Como funcionam as alterações"
 * ET05 — Friendly bullet points about completed history and upcoming tasks
 * ET06 — Simplified form labels: "Ambiente *", "Frequência", "Dias da semana"
 * ET07 — Simplified description label: "Descrição / Instruções"
 * ET08 — No technical jargon ("canonical", "gate", "engine", "technical IDs") in UI
 */

import fs from 'fs';
import path from 'path';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export async function runEditTaskModalUXTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const modalPath = path.resolve(process.cwd(), 'src/components/EditFamilyTaskModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf-8');

  // ET01: No "Configuração Canônica"
  const hasCanonicalEyebrow = modalContent.includes('Configuração Canônica');
  results.push({
    id: 'ET01',
    name: 'Remoção de "Configuração Canônica" da UI do modal',
    passed: !hasCanonicalEyebrow,
    expected: 'Sem "Configuração Canônica"',
    actual: `hasCanonicalEyebrow: ${hasCanonicalEyebrow}`
  });

  // ET02: Eyebrow / title "Editar tarefa da casa"
  const hasFriendlyTitle = modalContent.includes('Editar tarefa da casa');
  results.push({
    id: 'ET02',
    name: 'Presença do identificador amigável "Editar tarefa da casa"',
    passed: hasFriendlyTitle,
    expected: 'Contém "Editar tarefa da casa"',
    actual: `hasFriendlyTitle: ${hasFriendlyTitle}`
  });

  // ET03: No "STAB-001" or "STAB"
  const hasStabReference = modalContent.includes('STAB-001') || modalContent.includes('(STAB');
  results.push({
    id: 'ET03',
    name: 'Remoção de referências a "STAB-001" na interface',
    passed: !hasStabReference,
    expected: 'Sem referências a "STAB-001"',
    actual: `hasStabReference: ${hasStabReference}`
  });

  // ET04: Information block titled "Como funcionam as alterações"
  const hasFriendlyNoticeTitle = modalContent.includes('Como funcionam as alterações');
  results.push({
    id: 'ET04',
    name: 'Título do bloco informativo refinado para "Como funcionam as alterações"',
    passed: hasFriendlyNoticeTitle,
    expected: 'Contém "Como funcionam as alterações"',
    actual: `hasFriendlyNoticeTitle: ${hasFriendlyNoticeTitle}`
  });

  // ET05: Friendly bullets in notice
  const hasFriendlyBullets = 
    modalContent.includes('O que já foi concluído continua no histórico.') &&
    modalContent.includes('As alterações valem para as próximas tarefas.');
  results.push({
    id: 'ET05',
    name: 'Explicações amigáveis no bloco informativo (histórico e próximas tarefas)',
    passed: hasFriendlyBullets,
    expected: 'Contém bullets naturais sem jargão técnico',
    actual: `hasFriendlyBullets: ${hasFriendlyBullets}`
  });

  // ET06: Form labels: "Ambiente *", "Frequência", "Dias da semana"
  const hasAmbienteLabel = modalContent.includes('<span>Ambiente *</span>');
  const hasFrequenciaLabel = modalContent.includes('<span>Frequência</span>');
  const hasDiasSemanaLabel = modalContent.includes('<span>Dias da semana</span>');
  const hasAllMicrocopy = hasAmbienteLabel && hasFrequenciaLabel && hasDiasSemanaLabel;
  results.push({
    id: 'ET06',
    name: 'Microcopy simplificado dos campos: "Ambiente *", "Frequência", "Dias da semana"',
    passed: hasAllMicrocopy,
    expected: 'Labels amigáveis presentes',
    actual: `Ambiente: ${hasAmbienteLabel}, Frequência: ${hasFrequenciaLabel}, Dias: ${hasDiasSemanaLabel}`
  });

  // ET07: Description label: "Descrição / Instruções"
  const hasDescricaoLabel = modalContent.includes('Descrição / Instruções');
  const noTechnicalDescLabel = !modalContent.includes('Descrição / Instruções da família');
  results.push({
    id: 'ET07',
    name: 'Microcopy refinado do campo de descrição: "Descrição / Instruções"',
    passed: hasDescricaoLabel && noTechnicalDescLabel,
    expected: 'Campo renomeado para "Descrição / Instruções"',
    actual: `Descricao: ${hasDescricaoLabel}, Sem sufixo redundante: ${noTechnicalDescLabel}`
  });

  // ET08: No technical dev terms in rendered UI
  const hasGateInUI = modalContent.includes('gate');
  const hasCanonicalInUI = modalContent.includes('canonical') || modalContent.includes('canônico');
  results.push({
    id: 'ET08',
    name: 'Ausência total de jargões técnicos na interface do modal',
    passed: !hasGateInUI && !hasCanonicalInUI,
    expected: 'Sem jargão como gate ou canonical na UI',
    actual: `hasGate: ${hasGateInUI}, hasCanonical: ${hasCanonicalInUI}`
  });

  return results;
}
