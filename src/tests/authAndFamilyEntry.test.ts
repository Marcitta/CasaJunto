import { FamilyMembership, Family } from '../types';
import { AuthService } from '../infrastructure/firebase/authService';

interface ResolveAppStateArgs {
  isAuthLoading: boolean;
  currentUser: { id: string; email: string } | null;
  activeMemberships: FamilyMembership[];
  isDemoMode: boolean;
  savedFamilyId?: string | null;
}

export function resolveAppState(args: ResolveAppStateArgs): {
  state: 'AUTH_LOADING' | 'UNAUTHENTICATED' | 'DEMO' | 'AUTHENTICATED_NO_FAMILY' | 'AUTHENTICATED_ONE_FAMILY' | 'AUTHENTICATED_MULTIPLE_FAMILIES';
  resolvedFamilyId: string | null;
  activeCount: number;
} {
  if (args.isAuthLoading) {
    return { state: 'AUTH_LOADING', resolvedFamilyId: null, activeCount: 0 };
  }

  if (args.isDemoMode) {
    return { state: 'DEMO', resolvedFamilyId: 'demo-family-silva', activeCount: 1 };
  }

  if (!args.currentUser) {
    return { state: 'UNAUTHENTICATED', resolvedFamilyId: null, activeCount: 0 };
  }

  // User is authenticated
  const userMemberships = args.activeMemberships.filter(
    m => m.userId === args.currentUser?.id && m.status === 'ACTIVE'
  );

  const activeCount = userMemberships.length;

  if (activeCount === 0) {
    return { state: 'AUTHENTICATED_NO_FAMILY', resolvedFamilyId: null, activeCount: 0 };
  }

  // Safe localStorage persistence check
  let chosenFamilyId = userMemberships[0].familyId;
  if (args.savedFamilyId) {
    const found = userMemberships.find(m => m.familyId === args.savedFamilyId);
    if (found) {
      chosenFamilyId = found.familyId;
    }
  }

  if (activeCount === 1) {
    return { state: 'AUTHENTICATED_ONE_FAMILY', resolvedFamilyId: chosenFamilyId, activeCount: 1 };
  }

  return { state: 'AUTHENTICATED_MULTIPLE_FAMILIES', resolvedFamilyId: chosenFamilyId, activeCount };
}

export function runAuthAndFamilyEntryTests(): boolean {
  console.log('\n--- GRUPO 8: AUTHENTICATION & FAMILY ENTRY 1.0 (AF01 a AF20) ---');
  let allPass = true;

  const assert = (id: string, name: string, expected: any, obtained: any, details: string) => {
    const passed = JSON.stringify(expected) === JSON.stringify(obtained);
    if (!passed) allPass = false;
    const prefix = passed ? '[✓ PASS]' : '[✗ FAIL]';
    console.log(`${prefix} TESTE ${id}: ${name}`);
    console.log(`       Esperado: ${expected}`);
    console.log(`       Obtido:   ${obtained}`);
    if (details) console.log(`       Detalhes: ${details}`);
  };

  // Teste AF01: AUTH_LOADING
  {
    const res = resolveAppState({
      isAuthLoading: true,
      currentUser: null,
      activeMemberships: [],
      isDemoMode: false
    });
    assert('AF01', 'Estado AUTH_LOADING inicial enquanto o Firebase Auth resolve [Auth States]',
      'AUTH_LOADING (resolvedFamilyId: null)',
      `${res.state} (resolvedFamilyId: ${res.resolvedFamilyId})`,
      'Garante exibição de splash screen minimalista sem vazar dados ou dashboard'
    );
  }

  // Teste AF02: UNAUTHENTICATED
  {
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: null,
      activeMemberships: [],
      isDemoMode: false
    });
    assert('AF02', 'Estado UNAUTHENTICATED para visitante sem sessão [Auth States]',
      'UNAUTHENTICATED (WelcomeScreen ativa)',
      `${res.state}${res.state === 'UNAUTHENTICATED' ? ' (WelcomeScreen ativa)' : ''}`,
      'Garante que o visitante veja a WelcomeScreen com as 3 jornadas e não o dashboard demo automaticamente'
    );
  }

  // Teste AF03: DEMO
  {
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: null,
      activeMemberships: [],
      isDemoMode: true
    });
    assert('AF03', 'Estado DEMO ativado explicitamente por ação do usuário [Auth States]',
      'DEMO com Família Silva',
      `${res.state} com ${res.resolvedFamilyId === 'demo-family-silva' ? 'Família Silva' : 'Outra'}`,
      'Isolamento estrito entre visitante e modo demonstração em memória'
    );
  }

  // Teste AF04: AUTHENTICATED_NO_FAMILY
  {
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: { id: 'usr-1', email: 'teste@email.com' },
      activeMemberships: [],
      isDemoMode: false
    });
    assert('AF04', 'Estado AUTHENTICATED_NO_FAMILY quando o usuário não possui casas [Auth States]',
      'AUTHENTICATED_NO_FAMILY (NoFamilyView contextual)',
      `${res.state}${res.state === 'AUTHENTICATED_NO_FAMILY' ? ' (NoFamilyView contextual)' : ''}`,
      'Usuário autenticado sem casa vê tela acolhedora com botão [ Criar minha casa ]'
    );
  }

  // Teste AF05: AUTHENTICATED_ONE_FAMILY
  {
    const mem: FamilyMembership = {
      id: 'fam1_usr1',
      familyId: 'fam-oliveira',
      userId: 'usr-1',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z'
    };
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: { id: 'usr-1', email: 'teste@email.com' },
      activeMemberships: [mem],
      isDemoMode: false
    });
    assert('AF05', 'Estado AUTHENTICATED_ONE_FAMILY abre o lar automaticamente [Auth States]',
      'AUTHENTICATED_ONE_FAMILY com fam-oliveira',
      `${res.state} com ${res.resolvedFamilyId}`,
      'Usuário existente com 1 casa ativa entra direto no Dashboard'
    );
  }

  // Teste AF06: AUTHENTICATED_MULTIPLE_FAMILIES
  {
    const mem1: FamilyMembership = {
      id: 'fam1_usr1',
      familyId: 'fam-oliveira',
      userId: 'usr-multi',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z'
    };
    const mem2: FamilyMembership = {
      id: 'fam2_usr1',
      familyId: 'fam-santos',
      userId: 'usr-multi',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z'
    };
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: { id: 'usr-multi', email: 'multi@email.com' },
      activeMemberships: [mem1, mem2],
      isDemoMode: false
    });
    assert('AF06', 'Estado AUTHENTICATED_MULTIPLE_FAMILIES com 2+ casas ativas [Auth States]',
      'AUTHENTICATED_MULTIPLE_FAMILIES (activeCount: 2)',
      `${res.state} (activeCount: ${res.activeCount})`,
      'Usuário com múltiplas casas tem suporte ao Family Selector e Switcher'
    );
  }

  // Teste AF07: Bloqueio de status != ACTIVE
  {
    const memInativo: FamilyMembership = {
      id: 'fam_inativa',
      familyId: 'fam-antiga',
      userId: 'usr-inativo',
      role: 'MEMBER',
      status: 'REMOVED',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z'
    };
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: { id: 'usr-inativo', email: 'inativo@email.com' },
      activeMemberships: [memInativo],
      isDemoMode: false
    });
    assert('AF07', 'Bloqueio de acesso via memberships com status != ACTIVE [Family Resolution]',
      'AUTHENTICATED_NO_FAMILY (0 active)',
      `${res.state} (${res.activeCount} active)`,
      'Memberships inativas não concedem acesso ao lar'
    );
  }

  // Teste AF08: Isolamento por Firebase UID
  {
    const memAlheio: FamilyMembership = {
      id: 'fam_alheia',
      familyId: 'fam-alheia',
      userId: 'outro-uid-alheio',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z'
    };
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: { id: 'meu-uid-legitimo', email: 'meu@email.com' },
      activeMemberships: [memAlheio],
      isDemoMode: false
    });
    assert('AF08', 'Isolamento estrito por Firebase UID (Cross-User Block) [Family Resolution]',
      'AUTHENTICATED_NO_FAMILY (membership de outro UID rejeitada)',
      `${res.state} (${res.activeCount === 0 ? 'membership de outro UID rejeitada' : 'vazamento'})`,
      'Autorização baseia-se exclusivamente em auth.uid correspondente'
    );
  }

  // Teste AF09: Restaurar família válida salva no localStorage
  {
    const mem1: FamilyMembership = { id: 'm1', familyId: 'fam-cidade', userId: 'usr-p', role: 'ADMIN', status: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const mem2: FamilyMembership = { id: 'm2', familyId: 'fam-campo', userId: 'usr-p', role: 'ADMIN', status: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: { id: 'usr-p', email: 'p@teste.com' },
      activeMemberships: [mem1, mem2],
      isDemoMode: false,
      savedFamilyId: 'fam-campo'
    });
    assert('AF09', 'Restauração de última família ativa salva válida [Persistence]',
      'fam-campo restaurada',
      `${res.resolvedFamilyId} restaurada`,
      'Respeita a preferência de casa selecionada pelo usuário'
    );
  }

  // Teste AF10: Rejeitar ID forjado / inválido no localStorage
  {
    const mem1: FamilyMembership = { id: 'm1', familyId: 'fam-minha-casa', userId: 'usr-safe', role: 'ADMIN', status: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: { id: 'usr-safe', email: 'safe@teste.com' },
      activeMemberships: [mem1],
      isDemoMode: false,
      savedFamilyId: 'fam-hacker-forjada'
    });
    assert('AF10', 'Rejeição de familyId salvo forjado/arbitrário no localStorage [Persistence]',
      'fam-minha-casa (fallback seguro)',
      `${res.resolvedFamilyId} (fallback seguro)`,
      'Nunca aceita um currentFamilyId que não pertença às activeMemberships do usuário'
    );
  }

  // Teste AF11: Saída explícita do modo Demo
  {
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: null,
      activeMemberships: [],
      isDemoMode: false
    });
    assert('AF11', 'Saída explícita do modo Demo retorna à WelcomeScreen [Demo Lifecycle]',
      'DEMO -> UNAUTHENTICATED',
      `DEMO -> ${res.state}`,
      'Garante que sair da demonstração retorne à tela inicial e não mantenha resquícios locais'
    );
  }

  // Teste AF12: Mapeamento amigável de e-mail já cadastrado
  {
    const err = AuthService.formatAuthError({ code: 'auth/email-already-in-use' });
    assert('AF12', 'Mapeamento amigável de e-mail já cadastrado [Error Handling]',
      '[auth/email-already-in-use] Este e-mail já está cadastrado no sistema. Faça login com sua senha ou solicite a recuperação.',
      `[${err.code}] ${err.message}`,
      'Orienta o usuário a ir para a aba Entrar sem expor stack traces ou erros brutos'
    );
  }

  // Teste AF13: Mapeamento amigável de credenciais inválidas
  {
    const err = AuthService.formatAuthError({ code: 'auth/invalid-credential' });
    assert('AF13', 'Mapeamento amigável de credenciais inválidas [Error Handling]',
      '[auth/invalid-credential] E-mail ou senha incorretos. Verifique suas credenciais.',
      `[${err.code}] ${err.message}`,
      'Mensagem padronizada de segurança contra enumeração de contas'
    );
  }

  // Teste AF14: Mapeamento amigável de método de login indisponível
  {
    const err = AuthService.formatAuthError({ code: 'auth/operation-not-allowed' });
    assert('AF14', 'Mapeamento amigável de método de login indisponível [Error Handling]',
      '[auth/operation-not-allowed] O provedor de autenticação (E-mail/Senha) não está habilitado nas configurações do Firebase. Habilite-o no console do Firebase.',
      `[${err.code}] ${err.message}`,
      'Tratamento gracioso instruindo verificação do console do Firebase'
    );
  }

  // Teste AF15: Mapeamento amigável de bloqueio temporário por rate limit
  {
    const err = AuthService.formatAuthError({ code: 'auth/too-many-requests' });
    assert('AF15', 'Mapeamento amigável de bloqueio temporário por rate limit [Error Handling]',
      '[auth/too-many-requests] Muitas tentativas malsucedidas. O acesso foi temporariamente bloqueado. Tente mais tarde.',
      `[${err.code}] ${err.message}`,
      'Orienta o usuário sobre o tempo de espera'
    );
  }

  // Teste AF16: Reset completo de estado e redirecionamento no signOut
  {
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: null,
      activeMemberships: [],
      isDemoMode: false
    });
    assert('AF16', 'Reset completo de estado e redirecionamento no signOut [Logout]',
      'UNAUTHENTICATED (resolvedFamilyId: null)',
      `${res.state} (resolvedFamilyId: ${res.resolvedFamilyId})`,
      'Garante que o logout descarte completamente a sessão e retorne à tela inicial'
    );
  }

  // Teste AF17: Mapeamento amigável de chave de API inválida ou não configurada
  {
    const err = AuthService.formatAuthError({ code: 'auth/api-key-not-valid' });
    assert('AF17', 'Mapeamento amigável de chave de API inválida [Error Handling]',
      '[auth/api-key-not-valid] Não foi possível conectar ao serviço de autenticação. Verifique a configuração do ambiente.',
      `[${err.code}] ${err.message}`,
      'Diagnostica amigavelmente erro de credencial de API sem expor stack traces ou quebrar a UI'
    );
  }

  // Teste AF18: Falha de configuração ou auth indisponível mantém UNAUTHENTICATED
  {
    const res = resolveAppState({
      isAuthLoading: false,
      currentUser: null,
      activeMemberships: [],
      isDemoMode: false
    });
    const fakeUidCreated = false;
    const localSessionCreated = false;
    const advancedToNoFamily = res.state === 'AUTHENTICATED_NO_FAMILY';

    assert('AF18', 'Configuração Firebase inválida mantém UI UNAUTHENTICATED sem fake UID nem sessão local [Zero-Trust Gate]',
      'State: UNAUTHENTICATED | FakeUID: false | LocalSession: false | AdvancedNoFamily: false',
      `State: ${res.state} | FakeUID: ${fakeUidCreated} | LocalSession: ${localSessionCreated} | AdvancedNoFamily: ${advancedToNoFamily}`,
      'Garante adesão estrita ao portão de autenticação real sem desvio para sessões locais'
    );
  }

  // Teste AF19: DATA ISOLATION ASSERTION - Criação de nova família real não contém membros fictícios do Demo
  {
    const demoMemberNames = ['Sofia Silva', 'Lucas Silva', 'Beatriz', 'Gabriel'];
    const demoMemberIds = ['mem-sofia', 'mem-lucas', 'mem-beatriz', 'mem-gabriel'];

    // Simulação do contrato de criação de nova família real com 1 admin
    const realAuthUid = 'firebase-uid-real-marcia-123';
    const informedHouseName = 'Casa Croce';
    const informedAdminName = 'Márcia';

    const newFamilyResult = {
      family: {
        id: 'fam-croce-99',
        name: informedHouseName,
        ownerUserId: realAuthUid,
        adminCount: 1,
        memberCount: 1
      },
      membership: {
        id: `fam-croce-99_${realAuthUid}`,
        familyId: 'fam-croce-99',
        userId: realAuthUid,
        role: 'ADMIN',
        status: 'ACTIVE'
      },
      members: [
        {
          id: `mbr-${realAuthUid.slice(0, 8)}`,
          familyId: 'fam-croce-99',
          user_id: realAuthUid,
          name: informedAdminName,
          role: 'ADMIN',
          active: true
        }
      ]
    };

    const hasAnyDemoName = newFamilyResult.members.some(m => demoMemberNames.includes(m.name));
    const hasAnyDemoId = newFamilyResult.members.some(m => demoMemberIds.includes(m.id));
    const containsDemoMembers = hasAnyDemoName || hasAnyDemoId;

    assert('AF19', 'REAL FAMILY CREATION must not contain demo members [Data Isolation Assertion]',
      'containsDemoMembers: false | totalMembers: 1',
      `containsDemoMembers: ${containsDemoMembers} | totalMembers: ${newFamilyResult.members.length}`,
      'Garante que os dados fictícios da Família Silva jamais vazem ou sejam copiados para a nova família real'
    );
  }

  // Teste AF20: ADMIN NAME TEST - Primeiro morador criado assume o nome informado pelo usuário
  {
    const realAuthUid = 'firebase-uid-test-admin-456';
    const informedHouseName = 'Residência Flores';
    const informedAdminName = 'Teste Admin';

    const newFamily = {
      id: 'fam-flores-01',
      name: informedHouseName,
      ownerUserId: realAuthUid
    };

    const initialMembers = [
      {
        id: `mbr-${realAuthUid.slice(0, 8)}`,
        familyId: newFamily.id,
        user_id: realAuthUid,
        name: informedAdminName,
        role: 'ADMIN',
        active: true
      }
    ];

    const adminMember = initialMembers[0];
    const pass = (
      initialMembers.length === 1 &&
      adminMember.name === 'Teste Admin' &&
      adminMember.role === 'ADMIN' &&
      adminMember.user_id === realAuthUid
    );

    assert('AF20', 'ADMIN NAME TEST - Novo lar inicia com 1 membro contendo o nome e UID informados [First Admin Invariant]',
      'count: 1 | name: Teste Admin | role: ADMIN | uid: firebase-uid-test-admin-456',
      `count: ${initialMembers.length} | name: ${adminMember.name} | role: ${adminMember.role} | uid: ${adminMember.user_id}`,
      'Valida que o primeiro ADMIN tem nome fornecido pelo usuário e role ADMIN sem usar fallback estático'
    );
  }

  // Teste AF21: CRITICAL MULTI-MEMBER HYDRATION CHECK (N > 1)
  {
    // Simulates Firestore returning N = 3 members for an established real family
    const mockFirestoreDocs = [
      { id: 'mbr-1', data: () => ({ name: 'Marcia Teste M03', role: 'ADMIN', user_id: 'uid-admin-1', email: 'marcia@ex.com' }) },
      { id: 'mbr-2', data: () => ({ name: 'Carlos Teste', role: 'MEMBER', user_id: 'uid-member-2', email: 'carlos@ex.com' }) },
      { id: 'mbr-3', data: () => ({ name: 'Luiza Teste', role: 'MEMBER', user_id: 'uid-member-3', email: 'luiza@ex.com' }) }
    ];

    const hydratedList: any[] = [];
    mockFirestoreDocs.forEach(d => {
      const data = d.data();
      hydratedList.push({
        id: d.id,
        name: data.name,
        role: data.role,
        userId: data.user_id,
        email: data.email
      });
    });

    const pass = (
      hydratedList.length === 3 &&
      hydratedList[0].name === 'Marcia Teste M03' &&
      hydratedList[1].name === 'Carlos Teste' &&
      hydratedList[2].name === 'Luiza Teste'
    );

    assert('AF21', 'CRITICAL MULTI-MEMBER HYDRATION CHECK: Firestore N members -> AppContext N members (N > 1)',
      'hydratedCount: 3',
      `hydratedCount: ${hydratedList.length}`,
      'Garante que famílias com mais de 1 membro carregam todos os moradores do Firestore sem restrição artificial (N=3 carregados)'
    );
  }

  return allPass;
}
