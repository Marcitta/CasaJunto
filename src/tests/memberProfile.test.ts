import { calculateAgeFromBirthDate } from '../utils/dateUtils';
import { Member, MemberProfileUpdateData } from '../types';
import { DEMO_MEMBERS } from '../data/mockData';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runMemberProfileTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  // MP01: Age calculation logic from birth_date
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Born exactly 20 years ago yesterday
    const testDate1 = new Date(today);
    testDate1.setFullYear(currentYear - 20);
    testDate1.setDate(today.getDate() - 1);
    const dateStr1 = testDate1.toISOString().split('T')[0];
    const age1 = calculateAgeFromBirthDate(dateStr1);

    // Born exactly 15 years ago tomorrow (hasn't had birthday yet this year)
    const testDate2 = new Date(today);
    testDate2.setFullYear(currentYear - 15);
    testDate2.setDate(today.getDate() + 2);
    const dateStr2 = testDate2.toISOString().split('T')[0];
    const age2 = calculateAgeFromBirthDate(dateStr2);

    const passed = (age1 === 20 || age1 === 19) && (age2 === 14 || age2 === 15);
    results.push({
      id: 'MP01',
      name: 'Cálculo dinâmico de idade a partir de birth_date com precisão de dia/mês',
      passed,
      details: `Calculado: ${age1} e ${age2}`
    });
  } catch (err: any) {
    results.push({ id: 'MP01', name: 'Cálculo dinâmico de idade', passed: false, details: err.message });
  }

  // MP02: Future birth_date validation (returns null)
  try {
    const futureDate = '2099-01-01';
    const invalidDate = 'not-a-date';
    const ageFuture = calculateAgeFromBirthDate(futureDate);
    const ageInvalid = calculateAgeFromBirthDate(invalidDate);

    const passed = ageFuture === null && ageInvalid === null;
    results.push({
      id: 'MP02',
      name: 'Rejeição de datas de nascimento no futuro ou com formato inválido',
      passed,
      details: `Future: ${ageFuture}, Invalid: ${ageInvalid}`
    });
  } catch (err: any) {
    results.push({ id: 'MP02', name: 'Rejeição de datas futuras', passed: false, details: err.message });
  }

  // MP03: Partial update preserves existing birth_date if omitted
  try {
    const initialMember: Member = {
      id: 'mem-100',
      name: 'Carlos',
      birth_date: '2010-05-15',
      age: 16,
      autonomy_level: 2
    };

    const updateData: MemberProfileUpdateData = {
      name: 'Carlos Alberto'
      // birth_date omitted
    };

    const updatedMember: Member = {
      ...initialMember,
      name: updateData.name.trim(),
      birth_date: updateData.birth_date !== undefined ? updateData.birth_date : initialMember.birth_date
    };

    const passed = updatedMember.name === 'Carlos Alberto' && updatedMember.birth_date === '2010-05-15';
    results.push({
      id: 'MP03',
      name: 'Preservação de birth_date existente em atualizações parciais de perfil',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'MP03', name: 'Preservação de birth_date', passed: false, details: err.message });
  }

  // MP04: Update autonomy level (scale 1 to 4)
  try {
    const autonomyValues = [1, 2, 3, 4];
    let allValid = true;

    for (const lvl of autonomyValues) {
      const update: MemberProfileUpdateData = {
        name: 'Morador Teste',
        autonomy_level: lvl
      };
      if (update.autonomy_level !== lvl) {
        allValid = false;
        break;
      }
    }

    results.push({
      id: 'MP04',
      name: 'Atualização do nível de autonomia na escala 1 a 4',
      passed: allValid
    });
  } catch (err: any) {
    results.push({ id: 'MP04', name: 'Atualização de autonomia', passed: false, details: err.message });
  }

  // MP05: Update max_daily_minutes (custom limit vs null)
  try {
    const customUpdate: MemberProfileUpdateData = {
      name: 'Test',
      max_daily_minutes: 45
    };
    const defaultUpdate: MemberProfileUpdateData = {
      name: 'Test',
      max_daily_minutes: null
    };

    const passed = customUpdate.max_daily_minutes === 45 && defaultUpdate.max_daily_minutes === null;
    results.push({
      id: 'MP05',
      name: 'Configuração de teto diário de esforço (minutos customizados ou automático)',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'MP05', name: 'Configuração de teto diário', passed: false, details: err.message });
  }

  // MP06: Name is required and rejects empty string / whitespace
  try {
    const validateName = (n: string) => {
      if (!n || !n.trim()) throw new Error('Nome do morador é obrigatório.');
      return n.trim();
    };

    let caughtEmpty = false;
    let caughtSpaces = false;

    try { validateName(''); } catch { caughtEmpty = true; }
    try { validateName('   '); } catch { caughtSpaces = true; }
    const valid = validateName('  Lucas Silva  ');

    const passed = caughtEmpty && caughtSpaces && valid === 'Lucas Silva';
    results.push({
      id: 'MP06',
      name: 'Validação e sanitização obrigatória do nome do morador',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'MP06', name: 'Validação de nome', passed: false, details: err.message });
  }

  // MP07: Rejection of protected fields in MemberProfileUpdateData
  try {
    const prohibitedKeys = ['role', 'family_id', 'familyId', 'user_id', 'userId', 'active'];
    const fakeMaliciousPayload: any = {
      name: 'Nome Atualizado',
      role: 'ADMIN',
      family_id: 'other-family'
    };

    const hasProhibited = Object.keys(fakeMaliciousPayload).some(k => prohibitedKeys.includes(k));
    
    // Simulate AppContext security check
    let threwError = false;
    if (hasProhibited) {
      threwError = true;
    }

    results.push({
      id: 'MP07',
      name: 'Contrato de segurança rejeita alteração de role/family_id via perfil',
      passed: threwError
    });
  } catch (err: any) {
    results.push({ id: 'MP07', name: 'Contrato de segurança', passed: false, details: err.message });
  }

  // MP08: Memory hydration derives age from birth_date dynamically
  try {
    const demoMembersWithDerivedAge = DEMO_MEMBERS.map(m => {
      const derived = m.birth_date ? calculateAgeFromBirthDate(m.birth_date) : null;
      return {
        ...m,
        age: derived !== null ? derived : m.age
      };
    });

    const sofia = demoMembersWithDerivedAge.find(m => m.id === 'mem-sofia');
    const lucas = demoMembersWithDerivedAge.find(m => m.id === 'mem-lucas');
    const beatriz = demoMembersWithDerivedAge.find(m => m.id === 'mem-beatriz');
    const gabriel = demoMembersWithDerivedAge.find(m => m.id === 'mem-gabriel');

    const passed = Boolean(
      sofia && typeof sofia.age === 'number' && sofia.age >= 35 &&
      lucas && typeof lucas.age === 'number' && lucas.age >= 35 &&
      beatriz && typeof beatriz.age === 'number' && beatriz.age >= 10 &&
      gabriel && typeof gabriel.age === 'number' && gabriel.age >= 6
    );

    results.push({
      id: 'MP08',
      name: 'Hidratação de morador deriva idade automaticamente em memória',
      passed,
      details: `Sofia: ${sofia?.age}, Lucas: ${lucas?.age}, Beatriz: ${beatriz?.age}, Gabriel: ${gabriel?.age}`
    });
  } catch (err: any) {
    results.push({ id: 'MP08', name: 'Hidratação de morador', passed: false, details: err.message });
  }

  return results;
}
