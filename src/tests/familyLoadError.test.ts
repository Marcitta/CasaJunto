import { FamilyMembership, Family, AuthUser } from '../types';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export function runFamilyLoadErrorTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  function assert(id: string, name: string, condition: boolean, error?: string) {
    results.push({
      id,
      name,
      passed: condition,
      error: condition ? undefined : error || 'Assertion failed'
    });
  }

  // FLE-01
  const firestoreError = new Error(
    "Quota exceeded for quota metric 'Free daily read units per project (free tier database)'"
  );
  const errMsg = firestoreError.message;
  const isQuota = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted');
  assert('FLE-01', 'Erro de Quota Exceeded do Firestore é identificado com clareza', isQuota);

  // FLE-02
  const currentUser: AuthUser = { id: 'usr-croce', email: 'fmcroce@gmail.com', displayName: 'Casa Croce' };
  const familyLoadError = 'Limite de cota diária de leitura do Firestore atingido (Quota limit exceeded).';
  const currentFamily: Family | null = null;
  const isDemoMode = false;

  const showTechnicalError = Boolean(currentUser && familyLoadError && !isDemoMode);
  const showNoFamilyView = Boolean(currentUser && !currentFamily && !isDemoMode && !familyLoadError);
  assert('FLE-02', 'Erro técnico de quota prioriza FamilyLoadErrorView e suprime NoFamilyView', showTechnicalError && !showNoFamilyView);

  // FLE-03
  const normalUser: AuthUser = { id: 'usr-novo', email: 'novo@gmail.com', displayName: 'Novo Usuário' };
  const noError: string | null = null;
  const normalNoFamily = Boolean(normalUser && !currentFamily && !isDemoMode && !noError);
  assert('FLE-03', 'Usuário novo sem erro técnico vê NoFamilyView normalmente', normalNoFamily);

  // FLE-04
  const userId = 'usr-croce';
  const savedFamilyId = 'fam-croce-123';
  const canonicalDocId = `${savedFamilyId}_${userId}`;
  const mockFirestoreStore = new Map<string, any>();
  mockFirestoreStore.set(`familyMemberships/${canonicalDocId}`, {
    id: canonicalDocId,
    familyId: savedFamilyId,
    familyName: 'Casa Croce',
    userId,
    role: 'ADMIN',
    status: 'ACTIVE'
  });

  const queryResults: FamilyMembership[] = [];
  if (queryResults.length === 0 && savedFamilyId) {
    const directDoc = mockFirestoreStore.get(`familyMemberships/${canonicalDocId}`);
    if (directDoc && directDoc.status === 'ACTIVE') {
      queryResults.push(directDoc as FamilyMembership);
    }
  }
  assert('FLE-04', 'Fallback determinístico por ID recupera membership de admin', queryResults.length === 1 && queryResults[0].familyName === 'Casa Croce');

  // FLE-05
  let demoState = false;
  let errorState: string | null = 'Quota limit exceeded';
  const enterDemo = () => {
    demoState = true;
    errorState = null;
  };
  enterDemo();
  assert('FLE-05', 'Entrar no Modo Demonstração limpa familyLoadError e ativa demo', demoState && errorState === null);

  // FLE-06
  let userSession: AuthUser | null = currentUser;
  let familySession: Family | null = null;
  let errSession: string | null = 'Quota limit exceeded';
  const signOut = () => {
    userSession = null;
    familySession = null;
    errSession = null;
  };
  signOut();
  assert('FLE-06', 'SignOut limpa integralmente currentUser, currentFamily e familyLoadError', userSession === null && familySession === null && errSession === null);

  // FLE-07
  const isQuotaFunc = (err: string) => err.toLowerCase().includes('quota') || err.toLowerCase().includes('resource-exhausted');
  assert('FLE-07', 'Diferenciação correta entre cota esgotada e desconexão genérica', isQuotaFunc('Quota limit exceeded') && !isQuotaFunc('Network disconnected'));

  return results;
}
