/**
 * CasaJunto - Domain Errors
 * Erros padronizados e semânticos para a camada de domínio e regras de negócio.
 */

export abstract class DomainError extends Error {
  public abstract readonly code: string;
  public readonly timestamp: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends DomainError {
  public readonly code = 'UNAUTHORIZED';
  constructor(message: string = 'Acesso não autorizado ao recurso.') {
    super(message);
  }
}

export class FamilyAccessDeniedError extends DomainError {
  public readonly code = 'FAMILY_ACCESS_DENIED';
  constructor(
    public readonly requestedFamilyId: string,
    public readonly userFamilyId?: string,
    message: string = `Acesso negado: o usuário não pertence à família ${requestedFamilyId}.`
  ) {
    super(message);
  }
}

export class TaskNotEligibleError extends DomainError {
  public readonly code = 'TASK_NOT_ELIGIBLE';
  constructor(
    public readonly taskId: string,
    public readonly memberId: string,
    public readonly reason: string
  ) {
    super(`Membro ${memberId} não é elegível para a tarefa ${taskId}: ${reason}`);
  }
}

export class ProtectedTimeConflictError extends DomainError {
  public readonly code = 'PROTECTED_TIME_CONFLICT';
  constructor(
    public readonly memberId: string,
    public readonly protectedTimeLabel: string,
    public readonly timeSlot: string
  ) {
    super(`Conflito com horário protegido (${protectedTimeLabel}) para o morador ${memberId} no horário ${timeSlot}.`);
  }
}

export class UnsafeTaskError extends DomainError {
  public readonly code = 'UNSAFE_TASK';
  constructor(
    public readonly taskId: string,
    public readonly memberAge: number,
    public readonly minimumAge: number,
    public readonly hazardReason: string
  ) {
    super(`Tarefa ${taskId} é insegura para morador com ${memberAge} anos (mínimo ${minimumAge} anos). Motivo: ${hazardReason}`);
  }
}

export class NoEligibleMemberError extends DomainError {
  public readonly code = 'NO_ELIGIBLE_MEMBER';
  constructor(
    public readonly taskId: string,
    public readonly targetDate: string,
    public readonly reason: string
  ) {
    super(`Nenhum morador elegível encontrado para a tarefa ${taskId} em ${targetDate}. Motivo: ${reason}`);
  }
}
