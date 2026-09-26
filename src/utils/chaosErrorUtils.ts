/**
 * Utilitário de formatação de mensagens amigáveis de erro e diagnóstico estruturado para o Modo Caos.
 */

export interface StructuredChaosErrorDiagnostic {
  context: string;
  code: string;
  message: string;
  timestamp: string;
  details?: Record<string, any>;
}

let lastDiagnosticError: StructuredChaosErrorDiagnostic | null = null;

export function getLastChaosDiagnosticError(): StructuredChaosErrorDiagnostic | null {
  return lastDiagnosticError;
}

export function logStructuredChaosError(context: string, error: any, details?: Record<string, any>): StructuredChaosErrorDiagnostic {
  const rawMsg = typeof error === 'string' ? error : (error?.message || error?.code || 'UNKNOWN_ERROR');
  let code = 'UNKNOWN_CHAOS_ERROR';

  if (rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('Missing or insufficient permissions')) {
    code = 'PERMISSION_DENIED';
  } else if (rawMsg.includes('ACTIVE_SESSION_EXISTS') || rawMsg.includes('SESSION_ALREADY_ACTIVE')) {
    code = 'ACTIVE_SESSION_EXISTS';
  } else if (rawMsg.includes('PARTICIPANT_INACTIVE') || rawMsg.includes('INACTIVE_MEMBER_REJECTED')) {
    code = 'PARTICIPANT_INACTIVE';
  } else if (rawMsg.includes('FAMILY_TASK_INACTIVE') || rawMsg.includes('INACTIVE_TASK_REJECTED')) {
    code = 'FAMILY_TASK_INACTIVE';
  } else if (rawMsg.includes('ALREADY_COMPLETED_TODAY')) {
    code = 'ALREADY_COMPLETED_TODAY';
  } else if (rawMsg.includes('NO_ELIGIBLE_PARTICIPANT')) {
    code = 'NO_ELIGIBLE_PARTICIPANT';
  } else if (rawMsg.includes('TASK_NOT_CHAOS_ELIGIBLE')) {
    code = 'TASK_NOT_CHAOS_ELIGIBLE';
  } else if (rawMsg.includes('FORBIDDEN_MEMBER_ACCESS')) {
    code = 'FORBIDDEN_MEMBER_ACCESS';
  } else if (rawMsg.includes('SESSION_NOT_FOUND')) {
    code = 'SESSION_NOT_FOUND';
  } else if (rawMsg.includes('DUPLICATE_TASK_REJECTED')) {
    code = 'DUPLICATE_TASK_REJECTED';
  } else if (rawMsg.includes('TENANT_ISOLATION_VIOLATION')) {
    code = 'TENANT_ISOLATION_VIOLATION';
  }

  const diagnostic: StructuredChaosErrorDiagnostic = {
    context,
    code,
    message: rawMsg,
    timestamp: new Date().toISOString(),
    details
  };

  lastDiagnosticError = diagnostic;
  try {
    console.error('[ModoCaos:Diagnostic]', JSON.stringify(diagnostic, (key, value) => {
      if (key === 'src' || (typeof value === 'object' && value !== null && 'src' in value && 'i' in value)) {
        return '[Circular]';
      }
      return value;
    }, 2));
  } catch {
    console.error('[ModoCaos:Diagnostic]', diagnostic.context, diagnostic.code, diagnostic.message);
  }
  return diagnostic;
}

export function mapChaosErrorToHumanMessage(error: any): string {
  const msg = typeof error === 'string' ? error : (error?.message || '');

  if (msg.includes('PERMISSION_DENIED') || msg.includes('insufficient permissions')) {
    return 'Permissão insuficiente para iniciar o Modo Caos. Verifique se você é administrador.';
  }
  if (msg.includes('ACTIVE_SESSION_EXISTS') || msg.includes('SESSION_ALREADY_ACTIVE')) {
    return 'Já existe uma sessão do Modo Caos em andamento.';
  }
  if (msg.includes('PARTICIPANT_INACTIVE') || msg.includes('INACTIVE_MEMBER_REJECTED')) {
    return 'Um dos moradores selecionados não está mais ativo na casa.';
  }
  if (msg.includes('FAMILY_TASK_INACTIVE') || msg.includes('INACTIVE_TASK_REJECTED')) {
    return 'Uma das tarefas selecionadas está inativa.';
  }
  if (msg.includes('ALREADY_COMPLETED_TODAY')) {
    return 'Esta tarefa já foi concluída hoje.';
  }
  if (msg.includes('NO_ELIGIBLE_PARTICIPANT')) {
    return 'Nenhum participante elegível para realizar as tarefas.';
  }
  if (msg.includes('TASK_NOT_CHAOS_ELIGIBLE')) {
    return 'Uma das tarefas selecionadas não está elegível para o Modo Caos.';
  }
  if (msg.includes('DUPLICATE_TASK_REJECTED')) {
    return 'Uma tarefa não pode ser incluída mais de uma vez na mesma sessão.';
  }
  if (msg.includes('MEMBER_NOT_IN_FAMILY') || msg.includes('TENANT_ISOLATION_VIOLATION')) {
    return 'Um dos moradores ou tarefas selecionados não pertence a esta família.';
  }
  if (msg.includes('NO_PARTICIPANTS') || msg.includes('pelo menos um participante')) {
    return 'Selecione ao menos um morador participante.';
  }
  if (msg.includes('NO_TASKS') || msg.includes('EMPTY_TASK_LIST') || msg.includes('pelo menos uma tarefa')) {
    return 'Selecione pelo menos uma tarefa para a força-tarefa.';
  }
  if (msg.includes('NO_ACTIVE_MEMBERS')) {
    return 'Nenhum morador ativo selecionado para participar.';
  }
  if (msg.includes('SESSION_NOT_ACTIVE')) {
    return 'A sessão não está ativa no momento.';
  }
  if (msg.includes('INVALID_DURATION') || msg.includes('INVALID_EXTENSION_MINUTES')) {
    return 'Duração ou extensão inválida. Escolha uma das opções disponíveis.';
  }
  if (msg.includes('FORBIDDEN_MEMBER_ACCESS') || msg.includes('Apenas administradores')) {
    return 'Apenas administradores podem gerenciar o Modo Caos.';
  }
  if (msg.includes('SESSION_NOT_FOUND')) {
    return 'Sessão do Modo Caos não encontrada.';
  }
  if (msg.includes('INVALID_STATUS_TRANSITION') || msg.includes('ACTIVE_CANNOT_BE_CANCELLED')) {
    return 'A sessão não permite esta operação no momento.';
  }

  if (msg && !msg.startsWith('SOMETHING') && msg.length > 5 && !msg.includes('_')) {
    return msg;
  }

  return 'Não foi possível processar o Modo Caos. Tente novamente.';
}

export const formatChaosError = mapChaosErrorToHumanMessage;

