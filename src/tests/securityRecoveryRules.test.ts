/**
 * CASA JUNTO — DATA-RECOVERY-CASA-CROCE-1B
 * SECURITY RULES SUITE (SEC-REC-01 .. SEC-REC-12)
 * 
 * Validação formal da restauração do isolamento multi-tenant e RBAC estrito:
 * SEC-REC-01: ADMIN da Family A lê dados da Family A → ALLOW.
 * SEC-REC-02: ADMIN da Family A tenta ler familyTasks da Family B → DENY.
 * SEC-REC-03: ADMIN A tenta ler assignments da Family B → DENY.
 * SEC-REC-04: ADMIN A tenta ler rooms da Family B → DENY.
 * SEC-REC-05: ADMIN A tenta ler chaosSessions da Family B → DENY.
 * SEC-REC-06: MEMBER A lê dados permitidos da própria Family A → ALLOW conforme RBAC.
 * SEC-REC-07: MEMBER A tenta ler dados da Family B → DENY.
 * SEC-REC-08: Usuário autenticado sem membership não pode ler dados tenant-scoped → DENY.
 * SEC-REC-09: Usuário não autenticado → DENY.
 * SEC-REC-10: Own FamilyMembership get → ALLOW.
 * SEC-REC-11: Own ACTIVE memberships query → ALLOW.
 * SEC-REC-12: Memberships de outro UID → DENY.
 */

export interface SecRecTestResult {
  id: string;
  name: string;
  expected: 'ALLOW' | 'DENY';
  actual: 'ALLOW' | 'DENY';
  passed: boolean;
  reason?: string;
}

export interface SecurityContext {
  authUid: string | null;
}

export interface MockDatabaseState {
  documents: Map<string, Record<string, any>>;
}

/**
 * Avaliador canônico das regras de leitura de firestore.rules
 * Reflete estritamente as regras implantadas de isolamento multi-tenant.
 */
export function evaluateSecurityRulesRead(
  ctx: SecurityContext,
  docPath: string,
  state: MockDatabaseState
): { allowed: boolean; reason: string } {
  // Regra geral: Usuário não autenticado não acessa nada protegido
  if (!ctx.authUid) {
    return { allowed: false, reason: 'Unauthenticated: request.auth == null' };
  }

  const authUid = ctx.authUid;
  const parts = docPath.split('/');

  // Helper isMemberOfFamily(familyId)
  const isMemberOfFamily = (familyId: string): boolean => {
    const membershipPath = `familyMemberships/${familyId}_${authUid}`;
    const m = state.documents.get(membershipPath);
    return Boolean(m && m.status === 'ACTIVE');
  };

  // Helper isAdminOfFamily(familyId)
  const isAdminOfFamily = (familyId: string): boolean => {
    const membershipPath = `familyMemberships/${familyId}_${authUid}`;
    const m = state.documents.get(membershipPath);
    return Boolean(m && m.status === 'ACTIVE' && m.role === 'ADMIN');
  };

  // Helper callerMemberId(familyId)
  const callerMemberId = (familyId: string): string => {
    const membershipPath = `familyMemberships/${familyId}_${authUid}`;
    const m = state.documents.get(membershipPath);
    return m?.memberId || m?.member_id || '';
  };

  // 1. Users collection
  if (parts[0] === 'users' && parts.length === 2) {
    return { allowed: true, reason: 'allow read: if isAuthenticated()' };
  }

  // 2. Family Memberships: /familyMemberships/{membershipId}
  if (parts[0] === 'familyMemberships' && parts.length === 2) {
    const docData = state.documents.get(docPath);
    if (!docData) {
      // Documento inexistente ou tentativa de acesso
      return { allowed: false, reason: 'Membership document not found or access denied' };
    }
    const isOwner = docData.userId === authUid || docData.user_id === authUid;
    const isFamilyMember = isMemberOfFamily(docData.familyId || docData.family_id);

    if (isOwner || isFamilyMember) {
      return { allowed: true, reason: 'Own membership or family member lookup allowed' };
    }
    return { allowed: false, reason: 'Cannot read other user membership' };
  }

  // 3. Family root and subcollections: /families/{familyId}/...
  if (parts[0] === 'families') {
    const familyId = parts[1];

    if (!isMemberOfFamily(familyId)) {
      return { allowed: false, reason: `Tenant isolation: auth.uid is not active member of family ${familyId}` };
    }

    // Raiz da família: /families/{familyId}
    if (parts.length === 2) {
      return { allowed: true, reason: 'isMemberOfFamily(familyId) allowed' };
    }

    const subcollection = parts[2];

    // Chaos Sessions: /families/{familyId}/chaosSessions/{sessionId}
    if (subcollection === 'chaosSessions') {
      if (isAdminOfFamily(familyId)) {
        return { allowed: true, reason: 'ADMIN can read any chaos session in family' };
      }
      const sessionData = state.documents.get(docPath);
      const cMemberId = callerMemberId(familyId);
      const participants: string[] = sessionData?.participantMemberIds || [];
      if (sessionData?.status === 'ACTIVE' && participants.includes(cMemberId)) {
        return { allowed: true, reason: 'MEMBER can read ACTIVE session where participant' };
      }
      return { allowed: false, reason: 'MEMBER cannot read non-active or non-participating chaos session' };
    }

    // Demais subcoleções tenant-scoped (familyTasks, assignments, rooms, house, members, etc.)
    if (['familyTasks', 'assignments', 'rooms', 'house', 'members', 'skills', 'preferences', 'protectedTimes', 'availabilities', 'calendarEvents', 'householdHelp', 'auditLogs', 'chaosState'].includes(subcollection)) {
      return { allowed: true, reason: `isMemberOfFamily(familyId) allowed for subcollection ${subcollection}` };
    }
  }

  return { allowed: false, reason: 'No matching rule allowing read' };
}

/**
 * Avaliador de Query de coleção para /familyMemberships
 */
export function evaluateMembershipsQuery(
  ctx: SecurityContext,
  queryFilter: { userId?: string; status?: string }
): { allowed: boolean; reason: string } {
  if (!ctx.authUid) {
    return { allowed: false, reason: 'Unauthenticated query' };
  }
  // No Firestore, a query para familyMemberships com where('userId', '==', auth.uid)
  // é autorizada porque cada documento retornado satisfaz resource.data.userId == request.auth.uid
  if (queryFilter.userId === ctx.authUid) {
    return { allowed: true, reason: 'Own memberships query allowed' };
  }
  return { allowed: false, reason: 'Querying memberships of another user is denied' };
}

export function runSecurityRecoveryRulesTestSuite(): SecRecTestResult[] {
  const results: SecRecTestResult[] = [];

  // Configuração do Mock State com duas famílias distintas
  const state: MockDatabaseState = {
    documents: new Map()
  };

  const UID_ADMIN_A = 'uid-admin-family-a';
  const UID_MEMBER_A = 'uid-member-family-a';
  const UID_ADMIN_B = 'uid-admin-family-b';
  const UID_STRANGER = 'uid-stranger-no-membership';

  const FAM_A = 'family-alpha';
  const FAM_B = 'family-beta';

  // Família A
  state.documents.set(`families/${FAM_A}`, { id: FAM_A, name: 'Family Alpha' });
  state.documents.set(`familyMemberships/${FAM_A}_${UID_ADMIN_A}`, {
    id: `${FAM_A}_${UID_ADMIN_A}`,
    familyId: FAM_A,
    userId: UID_ADMIN_A,
    memberId: 'mem-admin-a',
    role: 'ADMIN',
    status: 'ACTIVE'
  });
  state.documents.set(`familyMemberships/${FAM_A}_${UID_MEMBER_A}`, {
    id: `${FAM_A}_${UID_MEMBER_A}`,
    familyId: FAM_A,
    userId: UID_MEMBER_A,
    memberId: 'mem-member-a',
    role: 'MEMBER',
    status: 'ACTIVE'
  });
  state.documents.set(`families/${FAM_A}/familyTasks/task-a1`, { id: 'task-a1', title: 'Limpar Sala' });
  state.documents.set(`families/${FAM_A}/assignments/asg-a1`, { id: 'asg-a1', task_id: 'task-a1' });
  state.documents.set(`families/${FAM_A}/rooms/room-a1`, { id: 'room-a1', name: 'Sala' });
  state.documents.set(`families/${FAM_A}/chaosSessions/chaos-a1`, {
    id: 'chaos-a1',
    status: 'ACTIVE',
    participantMemberIds: ['mem-admin-a', 'mem-member-a']
  });

  // Família B
  state.documents.set(`families/${FAM_B}`, { id: FAM_B, name: 'Family Beta' });
  state.documents.set(`familyMemberships/${FAM_B}_${UID_ADMIN_B}`, {
    id: `${FAM_B}_${UID_ADMIN_B}`,
    familyId: FAM_B,
    userId: UID_ADMIN_B,
    memberId: 'mem-admin-b',
    role: 'ADMIN',
    status: 'ACTIVE'
  });
  state.documents.set(`families/${FAM_B}/familyTasks/task-b1`, { id: 'task-b1', title: 'Lavar Louça Beta' });
  state.documents.set(`families/${FAM_B}/assignments/asg-b1`, { id: 'asg-b1', task_id: 'task-b1' });
  state.documents.set(`families/${FAM_B}/rooms/room-b1`, { id: 'room-b1', name: 'Cozinha Beta' });
  state.documents.set(`families/${FAM_B}/chaosSessions/chaos-b1`, {
    id: 'chaos-b1',
    status: 'ACTIVE',
    participantMemberIds: ['mem-admin-b']
  });

  // SEC-REC-01: ADMIN da Family A lê dados da Family A → ALLOW.
  {
    const res = evaluateSecurityRulesRead({ authUid: UID_ADMIN_A }, `families/${FAM_A}/familyTasks/task-a1`, state);
    const passed = res.allowed;
    results.push({
      id: 'SEC-REC-01',
      name: 'ADMIN da Family A lê dados da Family A → ALLOW',
      expected: 'ALLOW',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-02: ADMIN da Family A tenta ler familyTasks da Family B → DENY.
  {
    const res = evaluateSecurityRulesRead({ authUid: UID_ADMIN_A }, `families/${FAM_B}/familyTasks/task-b1`, state);
    const passed = !res.allowed;
    results.push({
      id: 'SEC-REC-02',
      name: 'ADMIN da Family A tenta ler familyTasks da Family B → DENY',
      expected: 'DENY',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-03: ADMIN A tenta ler assignments da Family B → DENY.
  {
    const res = evaluateSecurityRulesRead({ authUid: UID_ADMIN_A }, `families/${FAM_B}/assignments/asg-b1`, state);
    const passed = !res.allowed;
    results.push({
      id: 'SEC-REC-03',
      name: 'ADMIN A tenta ler assignments da Family B → DENY',
      expected: 'DENY',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-04: ADMIN A tenta ler rooms da Family B → DENY.
  {
    const res = evaluateSecurityRulesRead({ authUid: UID_ADMIN_A }, `families/${FAM_B}/rooms/room-b1`, state);
    const passed = !res.allowed;
    results.push({
      id: 'SEC-REC-04',
      name: 'ADMIN A tenta ler rooms da Family B → DENY',
      expected: 'DENY',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-05: ADMIN A tenta ler chaosSessions da Family B → DENY.
  {
    const res = evaluateSecurityRulesRead({ authUid: UID_ADMIN_A }, `families/${FAM_B}/chaosSessions/chaos-b1`, state);
    const passed = !res.allowed;
    results.push({
      id: 'SEC-REC-05',
      name: 'ADMIN A tenta ler chaosSessions da Family B → DENY',
      expected: 'DENY',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-06: MEMBER A lê dados permitidos da própria Family A → ALLOW conforme RBAC.
  {
    const resTasks = evaluateSecurityRulesRead({ authUid: UID_MEMBER_A }, `families/${FAM_A}/familyTasks/task-a1`, state);
    const resChaos = evaluateSecurityRulesRead({ authUid: UID_MEMBER_A }, `families/${FAM_A}/chaosSessions/chaos-a1`, state);
    const allowed = resTasks.allowed && resChaos.allowed;
    results.push({
      id: 'SEC-REC-06',
      name: 'MEMBER A lê dados permitidos da própria Family A → ALLOW conforme RBAC',
      expected: 'ALLOW',
      actual: allowed ? 'ALLOW' : 'DENY',
      passed: allowed,
      reason: `Tasks: ${resTasks.reason}; Chaos: ${resChaos.reason}`
    });
  }

  // SEC-REC-07: MEMBER A tenta ler dados da Family B → DENY.
  {
    const res = evaluateSecurityRulesRead({ authUid: UID_MEMBER_A }, `families/${FAM_B}/familyTasks/task-b1`, state);
    const passed = !res.allowed;
    results.push({
      id: 'SEC-REC-07',
      name: 'MEMBER A tenta ler dados da Family B → DENY',
      expected: 'DENY',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-08: Usuário autenticado sem membership não pode ler dados tenant-scoped → DENY.
  {
    const res = evaluateSecurityRulesRead({ authUid: UID_STRANGER }, `families/${FAM_A}/familyTasks/task-a1`, state);
    const passed = !res.allowed;
    results.push({
      id: 'SEC-REC-08',
      name: 'Usuário autenticado sem membership não pode ler dados tenant-scoped → DENY',
      expected: 'DENY',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-09: Usuário não autenticado → DENY.
  {
    const res = evaluateSecurityRulesRead({ authUid: null }, `families/${FAM_A}/familyTasks/task-a1`, state);
    const passed = !res.allowed;
    results.push({
      id: 'SEC-REC-09',
      name: 'Usuário não autenticado → DENY',
      expected: 'DENY',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-10: Own FamilyMembership get → ALLOW.
  {
    const res = evaluateSecurityRulesRead(
      { authUid: UID_ADMIN_A },
      `familyMemberships/${FAM_A}_${UID_ADMIN_A}`,
      state
    );
    const passed = res.allowed;
    results.push({
      id: 'SEC-REC-10',
      name: 'Own FamilyMembership get → ALLOW',
      expected: 'ALLOW',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-11: Own ACTIVE memberships query → ALLOW.
  {
    const res = evaluateMembershipsQuery(
      { authUid: UID_ADMIN_A },
      { userId: UID_ADMIN_A, status: 'ACTIVE' }
    );
    const passed = res.allowed;
    results.push({
      id: 'SEC-REC-11',
      name: 'Own ACTIVE memberships query → ALLOW',
      expected: 'ALLOW',
      actual: res.allowed ? 'ALLOW' : 'DENY',
      passed,
      reason: res.reason
    });
  }

  // SEC-REC-12: Memberships de outro UID → DENY.
  {
    // Tentativa do UID_STRANGER de ler o membership do UID_ADMIN_B diretamente
    const resDirect = evaluateSecurityRulesRead(
      { authUid: UID_STRANGER },
      `familyMemberships/${FAM_B}_${UID_ADMIN_B}`,
      state
    );
    // Tentativa do UID_STRANGER de executar query sobre os memberships do UID_ADMIN_B
    const resQuery = evaluateMembershipsQuery(
      { authUid: UID_STRANGER },
      { userId: UID_ADMIN_B, status: 'ACTIVE' }
    );

    const passed = !resDirect.allowed && !resQuery.allowed;
    results.push({
      id: 'SEC-REC-12',
      name: 'Memberships de outro UID → DENY',
      expected: 'DENY',
      actual: passed ? 'DENY' : 'ALLOW',
      passed,
      reason: `Direct get: ${resDirect.reason}; Query: ${resQuery.reason}`
    });
  }

  return results;
}
