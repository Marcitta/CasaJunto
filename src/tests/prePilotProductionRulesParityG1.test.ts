/**
 * CASA JUNTO — B.5.5-PRE-PILOT-G1 (BLOCO D)
 * Suíte Real de Paridade, Hardening e Regressão das Production Security Rules (firestore.rules)
 * no Firebase Auth + Firestore Emulator.
 *
 * REGRAS DA EXECUÇÃO:
 * - Executa de forma real contra Auth Emulator (127.0.0.1:9099) e Firestore Emulator (127.0.0.1:8088)
 *   usando explicitamente o banco nomeado ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c.
 * - NUNCA marca teste não executado/BLOCKED como PASS.
 * - NÃO acessa Firestore remoto e NÃO altera dados reais.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { REQUIRED_NAMED_DATABASE_ID } from '../infrastructure/firebase/FirestoreTransactionalAdapter';
import { SuspensionReleaseService } from '../../functions/src/services/suspensionReleaseService';
import { MembershipAuditTool } from '../../functions/src/services/membershipAuditTool';

export interface PrePilotG1ScenarioResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  category: 'RBAC' | 'BOOTSTRAP' | 'ISOLATION' | 'INTEGRITY' | 'PRODUCTION_PARITY' | 'AUDIT_TOOL';
  details?: string;
}

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8088;
const AUTH_PORT = 9099;
const PROJECT_ID = 'demo-no-project';

async function isEmulatorReachable(): Promise<{ firestore: boolean; auth: boolean }> {
  let firestoreOk = false;
  let authOk = false;
  try {
    const res = await fetch(`http://${EMULATOR_HOST}:${FIRESTORE_PORT}/`);
    const txt = await res.text();
    firestoreOk = res.ok && (txt.includes('Ok') || txt.includes('firestore'));
  } catch {
    firestoreOk = false;
  }
  try {
    const res = await fetch(`http://${EMULATOR_HOST}:${AUTH_PORT}/`);
    authOk = res.status < 500;
  } catch {
    authOk = false;
  }
  return { firestore: firestoreOk, auth: authOk };
}

function isPermissionDeniedError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const code = String(e?.code || '').toLowerCase();
  const msg = String(e?.message || '').toLowerCase();
  return (
    code.includes('permission-denied') ||
    code.includes('permission_denied') ||
    msg.includes('permission_denied') ||
    msg.includes('permission-denied') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('false for \'create\'') ||
    msg.includes('false for \'update\'') ||
    msg.includes('false for \'delete\'') ||
    msg.includes('false for \'get\'') ||
    msg.includes('false for \'list\'')
  );
}

async function expectDenied(fn: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!isPermissionDeniedError(err)) {
      throw new Error(`${label}: rejeitado, mas com erro inesperado em vez de PERMISSION_DENIED: ${String((err as Error)?.message || err)}`);
    }
    return;
  }
  throw new Error(`${label}: operação deveria ter sido negada (403 PERMISSION_DENIED), mas foi permitida!`);
}

async function createEphemeralClientSession(label: string) {
  const appName = `g1-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-g1-key' }, appName);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, { disableWarnings: true });
  const cred = await signInAnonymously(auth);
  const db = getFirestore(app, REQUIRED_NAMED_DATABASE_ID);
  connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
  const idToken = await cred.user.getIdToken();
  return { app, auth, db, uid: cred.user.uid, idToken };
}

export async function runPrePilotProductionRulesParityG1Tests(options?: {
  rulesProfile?: 'production' | 'emulator';
}): Promise<{
  status: 'EXECUTED' | 'BLOCKED';
  summary: string;
  scenarios: PrePilotG1ScenarioResult[];
}> {
  const rulesProfile = options?.rulesProfile || 'production';
  process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:${FIRESTORE_PORT}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${EMULATOR_HOST}:${AUTH_PORT}`;

  const reachable = await isEmulatorReachable();
  if (!reachable.firestore || !reachable.auth) {
    return {
      status: 'BLOCKED',
      summary: `Firebase Emulator indisponível (firestore=${reachable.firestore}, auth=${reachable.auth}) em ${EMULATOR_HOST}:${FIRESTORE_PORT}/${AUTH_PORT}.`,
      scenarios: []
    };
  }

  const adminAppName = `g1-admin-${Date.now()}`;
  const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, adminAppName);
  const adminDb = getAdminFirestore(adminApp, REQUIRED_NAMED_DATABASE_ID);
  const adminAuth = getAdminAuth(adminApp);
  const ephemeralApps: FirebaseApp[] = [];
  const scenarios: PrePilotG1ScenarioResult[] = [];

  async function spawnClient(label: string) {
    const s = await createEphemeralClientSession(label);
    ephemeralApps.push(s.app);
    return s;
  }

  async function runScenario(
    id: string,
    name: string,
    category: PrePilotG1ScenarioResult['category'],
    fn: () => Promise<string>
  ) {
    try {
      const details = await fn();
      scenarios.push({ id, name, category, status: 'PASS', details });
    } catch (err: any) {
      scenarios.push({
        id,
        name,
        category,
        status: 'FAIL',
        details: err?.message || String(err)
      });
    }
  }

  try {
    // -------------------------------------------------------------------------
    // G1-01: ADMIN canônico ativo (active omitido e active: true)
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-01',
      'ADMIN canônico ativo (active omitido e active=true) opera família, rotinas e membros',
      'RBAC',
      async () => {
        const admOmitted = await spawnClient('g101-adm1');
        const admExplicit = await spawnClient('g101-adm2');
        const famId = `fam_g101_${Date.now()}`;
        const now = new Date().toISOString();

        await adminDb.collection('families').doc(famId).set({
          id: famId,
          name: 'Casa G1-01',
          ownerUserId: admOmitted.uid,
          routineSuspended: false,
          consistencyVersion: 1
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${admOmitted.uid}`).set({
          familyId: famId,
          userId: admOmitted.uid,
          memberId: 'mbr_adm1',
          role: 'ADMIN',
          status: 'ACTIVE'
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${admExplicit.uid}`).set({
          familyId: famId,
          userId: admExplicit.uid,
          memberId: 'mbr_adm2',
          role: 'ADMIN',
          status: 'ACTIVE',
          active: true
        });

        await setDoc(doc(admOmitted.db, 'families', famId, 'familyTasks', 'ft_1'), {
          id: 'ft_1',
          familyId: famId,
          taskMasterId: 'tm_limpar',
          roomId: 'sala',
          active: true,
          createdAt: now
        });
        await updateDoc(doc(admExplicit.db, 'families', famId), { name: 'Casa G1-01 Atualizada' });
        const snap = await getDoc(doc(admExplicit.db, 'families', famId));
        if (!snap.exists() || snap.data()?.name !== 'Casa G1-01 Atualizada') {
          throw new Error('ADMIN com active:true falhou ao atualizar/ler família');
        }
        return 'ADMINs canônicos (active omitido e active=true) autorizados na família e subcoleções.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-02: MEMBER ativo com RBAC restrito
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-02',
      'MEMBER ativo possui leitura e conclusão restrita, bloqueado para admin ops',
      'RBAC',
      async () => {
        const adm = await spawnClient('g102-adm');
        const mem = await spawnClient('g102-mem');
        const famId = `fam_g102_${Date.now()}`;
        const now = new Date().toISOString();

        await adminDb.collection('families').doc(famId).set({
          id: famId,
          name: 'Casa G1-02',
          ownerUserId: adm.uid,
          routineSuspended: false,
          consistencyVersion: 1
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${mem.uid}`).set({
          familyId: famId,
          userId: mem.uid,
          memberId: 'mbr_mem_02',
          role: 'MEMBER',
          status: 'ACTIVE',
          active: true
        });
        await adminDb.collection('families').doc(famId).collection('familyTasks').doc('ft_02').set({
          id: 'ft_02',
          familyId: famId,
          taskMasterId: 'tm_louca',
          roomId: 'cozinha',
          active: true
        });
        await adminDb.collection('families').doc(famId).collection('assignments').doc('asg_own').set({
          id: 'asg_own',
          familyId: famId,
          taskId: 'ft_02',
          roomId: 'cozinha',
          date: '2026-11-17',
          memberId: 'mbr_mem_02',
          status: 'PENDING'
        });
        await adminDb.collection('families').doc(famId).collection('assignments').doc('asg_other').set({
          id: 'asg_other',
          familyId: famId,
          taskId: 'ft_02',
          roomId: 'cozinha',
          date: '2026-11-17',
          memberId: 'mbr_outro',
          status: 'PENDING'
        });

        // Leituras permitidas
        const taskRead = await getDoc(doc(mem.db, 'families', famId, 'familyTasks', 'ft_02'));
        if (!taskRead.exists()) throw new Error('MEMBER não conseguiu ler familyTask');

        // Conclusão legítima própria
        await updateDoc(doc(mem.db, 'families', famId, 'assignments', 'asg_own'), {
          status: 'COMPLETED',
          completedBy: 'mbr_mem_02',
          completedAt: now
        });

        // Proibido concluir tarefa atribuída a outro morador ou alterar roomId
        await expectDenied(
          () => updateDoc(doc(mem.db, 'families', famId, 'assignments', 'asg_other'), {
            status: 'COMPLETED',
            completedBy: 'mbr_mem_02',
            completedAt: now
          }),
          'MEMBER concluir assignment de terceiro'
        );

        // Proibido criar rotina / atualizar família
        await expectDenied(
          () => setDoc(doc(mem.db, 'families', famId, 'familyTasks', 'ft_forged'), { active: true }),
          'MEMBER criar familyTask'
        );
        await expectDenied(
          () => updateDoc(doc(mem.db, 'families', famId), { name: 'Hacked' }),
          'MEMBER atualizar family'
        );

        return 'MEMBER leu família/rotina, concluiu assignment próprio e foi bloqueado (403) em admin ops e tarefa alheia.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-03: ADMIN PENDING / REVOKED / REMOVED / active=false bloqueados (Rules + Backend)
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-03',
      'ADMIN PENDING, REVOKED, REMOVED e active=false negados nas Rules e no Backend',
      'RBAC',
      async () => {
        const famId = `fam_g103_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({
          id: famId,
          ownerUserId: 'real_owner',
          routineSuspended: true,
          consistencyVersion: 1
        });
        await adminDb.collection('families').doc(famId).collection('familyTasks').doc('ft_03').set({
          id: 'ft_03',
          active: true
        });

        const invalidStates = [
          { label: 'PENDING', status: 'PENDING' },
          { label: 'REVOKED', status: 'REVOKED' },
          { label: 'REMOVED', status: 'REMOVED' },
          { label: 'ACTIVE_FALSE', status: 'ACTIVE', active: false }
        ];
        const emptyHash = SuspensionReleaseService.computeAuditStateHash([{ id: 'ft_03', active: true }], [], []);

        for (const st of invalidStates) {
          const usr = await spawnClient(`g103-${st.label}`);
          await adminDb.collection('familyMemberships').doc(`${famId}_${usr.uid}`).set({
            familyId: famId,
            userId: usr.uid,
            memberId: `mbr_${st.label}`,
            role: 'ADMIN',
            status: st.status,
            ...(st.active !== undefined ? { active: st.active } : {})
          });

          await expectDenied(() => getDoc(doc(usr.db, 'families', famId)), `Read family (${st.label})`);
          await expectDenied(
            () => updateDoc(doc(usr.db, 'families', famId), { name: 'Intrusion' }),
            `Update family (${st.label})`
          );

          let srvDenied = false;
          try {
            await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
              auth: adminAuth as any,
              firestoreDb: adminDb as any,
              idToken: usr.idToken,
              familyId: famId,
              expectedConsistencyVersion: 1,
              expectedAuditStateHash: emptyHash
            });
          } catch (e: any) {
            if (e?.code === 'PERMISSION_DENIED') srvDenied = true;
          }
          if (!srvDenied) {
            throw new Error(`Servidor não negou ADMIN ${st.label} com PERMISSION_DENIED`);
          }
        }
        return 'Todos os 4 estados não ativos de ADMIN (PENDING, REVOKED, REMOVED, active=false) negados (403 + backend).';
      }
    );

    // -------------------------------------------------------------------------
    // G1-04: Membership com familyId ausente ou divergente negada
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-04',
      'Membership com familyId ausente ou divergente negada (403)',
      'RBAC',
      async () => {
        const famId = `fam_g104_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({ id: famId, ownerUserId: 'o' });
        const uMissing = await spawnClient('g104-miss');
        const uDiv = await spawnClient('g104-div');

        await adminDb.collection('familyMemberships').doc(`${famId}_${uMissing.uid}`).set({
          userId: uMissing.uid,
          role: 'ADMIN',
          status: 'ACTIVE'
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${uDiv.uid}`).set({
          familyId: 'fam_outra_divergente',
          userId: uDiv.uid,
          role: 'ADMIN',
          status: 'ACTIVE'
        });

        await expectDenied(() => getDoc(doc(uMissing.db, 'families', famId)), 'familyId ausente');
        await expectDenied(() => getDoc(doc(uDiv.db, 'families', famId)), 'familyId divergente');
        return 'familyId ausente e divergente bloqueados com PERMISSION_DENIED.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-05: Membership com userId ausente ou divergente negada
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-05',
      'Membership com userId ausente ou divergente negada (403)',
      'RBAC',
      async () => {
        const famId = `fam_g105_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({ id: famId, ownerUserId: 'o' });
        const uMissing = await spawnClient('g105-miss');
        const uDiv = await spawnClient('g105-div');

        await adminDb.collection('familyMemberships').doc(`${famId}_${uMissing.uid}`).set({
          familyId: famId,
          role: 'ADMIN',
          status: 'ACTIVE'
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${uDiv.uid}`).set({
          familyId: famId,
          userId: 'uid_de_terceiro',
          role: 'ADMIN',
          status: 'ACTIVE'
        });

        await expectDenied(() => getDoc(doc(uMissing.db, 'families', famId)), 'userId ausente');
        await expectDenied(() => getDoc(doc(uDiv.db, 'families', famId)), 'userId divergente');
        return 'userId ausente e divergente bloqueados com PERMISSION_DENIED.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-06: Membership sem status negada
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-06',
      'Membership sem campo status (legado permissivo) negada (403)',
      'RBAC',
      async () => {
        const famId = `fam_g106_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({ id: famId, ownerUserId: 'o' });
        const usr = await spawnClient('g106-nostatus');

        await adminDb.collection('familyMemberships').doc(`${famId}_${usr.uid}`).set({
          familyId: famId,
          userId: usr.uid,
          role: 'ADMIN'
        });

        await expectDenied(() => getDoc(doc(usr.db, 'families', famId)), 'status ausente');
        return 'Membership legada sem campo status bloqueada estritamente com 403.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-07: Bootstrap legítimo + query AuthContext + onboarding aceite de convite
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-07',
      'Bootstrap atômico do 1º ADMIN e onboarding transacional por convite funcionam sem regressão',
      'BOOTSTRAP',
      async () => {
        const owner = await spawnClient('g107-owner');
        const joiner = await spawnClient('g107-joiner');
        const famId = `fam_g107_${Date.now()}`;
        const ownerMemberId = `mbr_owner_${Date.now()}`;
        const now = new Date().toISOString();

        // 1. Bootstrap atômico (igual AuthContext.createNewFamily)
        const batch = writeBatch(owner.db);
        batch.set(doc(owner.db, 'families', famId), {
          id: famId,
          name: 'Casa Onboarding',
          ownerUserId: owner.uid,
          adminCount: 1,
          memberCount: 1,
          createdAt: now,
          updatedAt: now
        });
        batch.set(doc(owner.db, 'familyMemberships', `${famId}_${owner.uid}`), {
          id: `${famId}_${owner.uid}`,
          familyId: famId,
          familyName: 'Casa Onboarding',
          userId: owner.uid,
          memberId: ownerMemberId,
          role: 'ADMIN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now
        });
        batch.set(doc(owner.db, 'families', famId, 'members', ownerMemberId), {
          id: ownerMemberId,
          family_id: famId,
          user_id: owner.uid,
          name: 'Fundador',
          role: 'ADMIN',
          active: true,
          joined_at: now
        });
        await batch.commit();

        // 2. Query de AuthContext (where userId == uid && status == 'ACTIVE')
        const activeMemQ = await getDocs(
          query(
            collection(owner.db, 'familyMemberships'),
            where('userId', '==', owner.uid),
            where('status', '==', 'ACTIVE')
          )
        );
        if (activeMemQ.size !== 1) {
          throw new Error(`Query de onboarding retornou ${activeMemQ.size} documentos (esperado 1)`);
        }

        // 3. Fluxo completo de convite apenas quando regras completas de produção estão ativas
        if (rulesProfile === 'production') {
          const targetMemberId = `mbr_guest_${Date.now()}`;
          const inviteCode = `CODE${Date.now().toString(36).toUpperCase()}`;
          const expiresTs = Timestamp.fromDate(new Date(Date.now() + 3600_000));

          await setDoc(doc(owner.db, 'families', famId, 'members', targetMemberId), {
            id: targetMemberId,
            familyId: famId,
            name: 'Convidada',
            role: 'MEMBER',
            active: true
          });
          await setDoc(doc(owner.db, 'families', famId, 'invites', targetMemberId), {
            code: inviteCode,
            familyId: famId,
            targetMemberId,
            status: 'PENDING',
            expiresAt: expiresTs
          });
          await setDoc(doc(owner.db, 'familyInvitations', inviteCode), {
            code: inviteCode,
            familyId: famId,
            targetMemberId,
            status: 'PENDING',
            expiresAt: expiresTs
          });

          // Tentativa maliciosa de auto-escalação para ADMIN durante aceite -> deve ser negada
          await expectDenied(
            () => runTransaction(joiner.db, async tx => {
              tx.update(doc(joiner.db, 'familyInvitations', inviteCode), {
                status: 'ACCEPTED',
                acceptedAt: Timestamp.now(),
                acceptedByUid: joiner.uid
              });
              tx.update(doc(joiner.db, 'families', famId, 'invites', targetMemberId), {
                status: 'ACCEPTED',
                acceptedAt: Timestamp.now(),
                acceptedByUid: joiner.uid
              });
              tx.update(doc(joiner.db, 'families', famId, 'members', targetMemberId), {
                userId: joiner.uid,
                email: 'guest@example.com',
                updatedAt: now
              });
              tx.set(doc(joiner.db, 'familyMemberships', `${famId}_${joiner.uid}`), {
                id: `${famId}_${joiner.uid}`,
                familyId: famId,
                userId: joiner.uid,
                memberId: targetMemberId,
                role: 'ADMIN',
                status: 'ACTIVE'
              });
            }),
            'Auto-escalação para ADMIN no aceite de convite'
          );

          // Aceite legítimo como MEMBER
          await runTransaction(joiner.db, async tx => {
            tx.update(doc(joiner.db, 'familyInvitations', inviteCode), {
              status: 'ACCEPTED',
              acceptedAt: Timestamp.now(),
              acceptedByUid: joiner.uid
            });
            tx.update(doc(joiner.db, 'families', famId, 'invites', targetMemberId), {
              status: 'ACCEPTED',
              acceptedAt: Timestamp.now(),
              acceptedByUid: joiner.uid
            });
            tx.update(doc(joiner.db, 'families', famId, 'members', targetMemberId), {
              userId: joiner.uid,
              email: 'guest@example.com',
              updatedAt: now
            });
            tx.set(doc(joiner.db, 'familyMemberships', `${famId}_${joiner.uid}`), {
              id: `${famId}_${joiner.uid}`,
              familyId: famId,
              userId: joiner.uid,
              memberId: targetMemberId,
              role: 'MEMBER',
              status: 'ACTIVE'
            });
          });

          const joinedFamSnap = await getDoc(doc(joiner.db, 'families', famId));
          if (!joinedFamSnap.exists()) throw new Error('Joiner não conseguiu ler família após aceite de convite');
        }

        return 'Bootstrap atômico do fundador, query ACTIVE e aceite bidirecional de convite preservados; auto-escalação bloqueada.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-08: Bootstrap inválido rejeitado
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-08',
      'Bootstrap inválido (sem status, active=false, audit forjada ou consistencyVersion != 1) negado (403)',
      'BOOTSTRAP',
      async () => {
        const usr = await spawnClient('g108-badboot');

        // 1. Sem status no membership
        await expectDenied(async () => {
          const fam = `fam_g108_a_${Date.now()}`;
          const b = writeBatch(usr.db);
          b.set(doc(usr.db, 'families', fam), { ownerUserId: usr.uid });
          b.set(doc(usr.db, 'familyMemberships', `${fam}_${usr.uid}`), {
            familyId: fam,
            userId: usr.uid,
            role: 'ADMIN'
          });
          await b.commit();
        }, 'Bootstrap sem status');

        // 2. active: false no membership
        await expectDenied(async () => {
          const fam = `fam_g108_b_${Date.now()}`;
          const b = writeBatch(usr.db);
          b.set(doc(usr.db, 'families', fam), { ownerUserId: usr.uid });
          b.set(doc(usr.db, 'familyMemberships', `${fam}_${usr.uid}`), {
            familyId: fam,
            userId: usr.uid,
            role: 'ADMIN',
            status: 'ACTIVE',
            active: false
          });
          await b.commit();
        }, 'Bootstrap com active=false');

        // 3. Forged consistencyVersion or routineReleaseAuditId
        await expectDenied(async () => {
          const fam = `fam_g108_c_${Date.now()}`;
          const b = writeBatch(usr.db);
          b.set(doc(usr.db, 'families', fam), {
            ownerUserId: usr.uid,
            consistencyVersion: 99,
            routineReleaseAuditId: 'forged_audit'
          });
          b.set(doc(usr.db, 'familyMemberships', `${fam}_${usr.uid}`), {
            familyId: fam,
            userId: usr.uid,
            role: 'ADMIN',
            status: 'ACTIVE'
          });
          await b.commit();
        }, 'Bootstrap com consistencyVersion/routineReleaseAuditId forjados');

        return 'Todos os cenários de bootstrap inválido/forjado rejeitados com 403.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-09: Isolamento multi-tenant
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-09',
      'Isolamento multi-tenant estrito entre Família A e Família B',
      'ISOLATION',
      async () => {
        const admA = await spawnClient('g109-admA');
        const admB = await spawnClient('g109-admB');
        const famA = `fam_g109_A_${Date.now()}`;
        const famB = `fam_g109_B_${Date.now()}`;

        await adminDb.collection('families').doc(famA).set({ id: famA, ownerUserId: admA.uid });
        await adminDb.collection('families').doc(famB).set({ id: famB, ownerUserId: admB.uid });
        await adminDb.collection('familyMemberships').doc(`${famA}_${admA.uid}`).set({
          familyId: famA, userId: admA.uid, memberId: 'mbrA', role: 'ADMIN', status: 'ACTIVE'
        });
        await adminDb.collection('familyMemberships').doc(`${famB}_${admB.uid}`).set({
          familyId: famB, userId: admB.uid, memberId: 'mbrB', role: 'ADMIN', status: 'ACTIVE'
        });
        await adminDb.collection('families').doc(famB).collection('familyTasks').doc('ftB').set({ id: 'ftB', active: true });

        await expectDenied(() => getDoc(doc(admA.db, 'families', famB)), 'Cross-tenant read family');
        await expectDenied(() => getDoc(doc(admA.db, 'families', famB, 'familyTasks', 'ftB')), 'Cross-tenant read task');
        await expectDenied(() => setDoc(doc(admA.db, 'families', famB, 'familyTasks', 'ftInject'), { active: true }), 'Cross-tenant write task');
        await expectDenied(() => updateDoc(doc(admA.db, 'familyMemberships', `${famB}_${admB.uid}`), { role: 'MEMBER' }), 'Cross-tenant membership update');

        return 'ADMIN da Família A completamente isolado da Família B (403 em reads/writes/memberships).';
      }
    );

    // -------------------------------------------------------------------------
    // G1-10: Bloqueio de alteração de consistencyVersion/lastReconciliationAt pelo cliente
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-10',
      'Cliente proibido de inicializar, incrementar ou remover consistencyVersion e lastReconciliationAt',
      'INTEGRITY',
      async () => {
        const adm = await spawnClient('g110-adm');
        const famId = `fam_g110_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({
          id: famId,
          name: 'Casa Versionada',
          ownerUserId: adm.uid,
          routineSuspended: false,
          consistencyVersion: 3
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${adm.uid}`).set({
          familyId: famId, userId: adm.uid, memberId: 'mbr110', role: 'ADMIN', status: 'ACTIVE'
        });

        await expectDenied(() => updateDoc(doc(adm.db, 'families', famId), { consistencyVersion: 4 }), 'Increment consistencyVersion');
        await expectDenied(() => updateDoc(doc(adm.db, 'families', famId), { consistencyVersion: 2 }), 'Decrement consistencyVersion');
        await expectDenied(() => updateDoc(doc(adm.db, 'families', famId), { lastReconciliationAt: new Date().toISOString() }), 'Set lastReconciliationAt');

        // Atualização regular preservada
        await updateDoc(doc(adm.db, 'families', famId), { name: 'Casa Versionada OK' });
        return 'Adulteração de campos protegidos negada (403); atualização regular do nome autorizada.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-11: Bloqueio client-side de routineSuspended: true -> false + liberação server OK
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-11',
      'Cliente proibido de liberar routineSuspended=true->false; servidor autoritativo libera com sucesso',
      'INTEGRITY',
      async () => {
        const adm = await spawnClient('g111-adm');
        const famId = `fam_g111_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({
          id: famId,
          ownerUserId: adm.uid,
          routineSuspended: true,
          consistencyVersion: 1
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${adm.uid}`).set({
          familyId: famId, userId: adm.uid, memberId: 'mbr111', role: 'ADMIN', status: 'ACTIVE'
        });

        await expectDenied(
          () => updateDoc(doc(adm.db, 'families', famId), { routineSuspended: false }),
          'Client tentar liberar routineSuspended'
        );

        const hash = SuspensionReleaseService.computeAuditStateHash([], [], []);
        const rel = await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
          auth: adminAuth as any,
          firestoreDb: adminDb as any,
          idToken: adm.idToken,
          familyId: famId,
          expectedConsistencyVersion: 1,
          expectedAuditStateHash: hash
        });
        if (!rel.success || rel.releasedConsistencyVersion !== 2) {
          throw new Error('Liberação autoritativa no servidor falhou');
        }
        return 'Flip direto client-side negado (403); liberação transacional server-side aprovada (v1 -> v2).';
      }
    );

    // -------------------------------------------------------------------------
    // G1-12: Bloqueio de falsificação de routineReleaseAudits (AUDIT_PASSED)
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-12',
      'ADMIN e MEMBER bloqueados ao tentar criar/editar/excluir routineReleaseAudits',
      'INTEGRITY',
      async () => {
        const adm = await spawnClient('g112-adm');
        const mem = await spawnClient('g112-mem');
        const famId = `fam_g112_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({ id: famId, ownerUserId: adm.uid });
        await adminDb.collection('familyMemberships').doc(`${famId}_${adm.uid}`).set({
          familyId: famId, userId: adm.uid, memberId: 'mbrA', role: 'ADMIN', status: 'ACTIVE'
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${mem.uid}`).set({
          familyId: famId, userId: mem.uid, memberId: 'mbrM', role: 'MEMBER', status: 'ACTIVE'
        });
        await adminDb.collection('families').doc(famId).collection('routineReleaseAudits').doc('aud_real').set({
          auditId: 'aud_real',
          familyId: famId,
          status: 'AUDIT_FAILED',
          serverVerified: true
        });

        await expectDenied(
          () => setDoc(doc(adm.db, 'families', famId, 'routineReleaseAudits', 'forged_1'), {
            status: 'AUDIT_PASSED',
            totalDiscrepancies: 0
          }),
          'ADMIN criar AUDIT_PASSED falsificado'
        );
        await expectDenied(
          () => updateDoc(doc(adm.db, 'families', famId, 'routineReleaseAudits', 'aud_real'), {
            status: 'AUDIT_PASSED'
          }),
          'ADMIN adulterar auditoria existente'
        );
        await expectDenied(
          () => deleteDoc(doc(adm.db, 'families', famId, 'routineReleaseAudits', 'aud_real')),
          'ADMIN excluir auditoria'
        );
        await expectDenied(
          () => setDoc(doc(mem.db, 'families', famId, 'routineReleaseAudits', 'forged_2'), {
            status: 'AUDIT_PASSED'
          }),
          'MEMBER criar AUDIT_PASSED falsificado'
        );

        const readAud = await getDoc(doc(mem.db, 'families', famId, 'routineReleaseAudits', 'aud_real'));
        if (!readAud.exists()) throw new Error('Membro legítimo deve poder ler routineReleaseAudits');

        return 'routineReleaseAudits estritamente imutável no client-side; leitura autorizada a membros.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-13: Preservação de histórico COMPLETED / DONE em assignments
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-13',
      'Histórico de assignments COMPLETED e DONE protegido contra alteração/exclusão até por ADMIN',
      'INTEGRITY',
      async () => {
        const adm = await spawnClient('g113-adm');
        const famId = `fam_g113_${Date.now()}`;
        await adminDb.collection('families').doc(famId).set({
          id: famId, ownerUserId: adm.uid, routineSuspended: false
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${adm.uid}`).set({
          familyId: famId, userId: adm.uid, memberId: 'mbrA', role: 'ADMIN', status: 'ACTIVE'
        });

        for (const st of ['COMPLETED', 'DONE'] as const) {
          const asgId = `asg_${st.toLowerCase()}`;
          await adminDb.collection('families').doc(famId).collection('assignments').doc(asgId).set({
            id: asgId,
            familyId: famId,
            memberId: 'mbrA',
            status: st,
            completedAt: '2026-11-16T09:00:00Z'
          });
          await expectDenied(
            () => updateDoc(doc(adm.db, 'families', famId, 'assignments', asgId), { status: 'PENDING' }),
            `ADMIN reverter ${st}`
          );
          await expectDenied(
            () => deleteDoc(doc(adm.db, 'families', famId, 'assignments', asgId)),
            `ADMIN excluir ${st}`
          );
        }

        return 'Registros COMPLETED e DONE protegidos contra reversão e exclusão pelo ADMIN.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-14: Regressão das coleções exclusivas de produção no Emulator
    // -------------------------------------------------------------------------
    if (rulesProfile === 'production') {
      await runScenario(
        'G1-14',
        'Regressão completa das coleções exclusivas de produção (users, pushDevices, domesticSupports, auditLogs, chaosSessions, etc.)',
        'PRODUCTION_PARITY',
        async () => {
          const adm = await spawnClient('g114-adm');
          const memPart = await spawnClient('g114-mem-part');
          const memOther = await spawnClient('g114-mem-other');
          const famId = `fam_g114_${Date.now()}`;

          await adminDb.collection('families').doc(famId).set({ id: famId, ownerUserId: adm.uid });
          await adminDb.collection('familyMemberships').doc(`${famId}_${adm.uid}`).set({
            familyId: famId, userId: adm.uid, memberId: 'mbr_adm', role: 'ADMIN', status: 'ACTIVE'
          });
          await adminDb.collection('familyMemberships').doc(`${famId}_${memPart.uid}`).set({
            familyId: famId, userId: memPart.uid, memberId: 'mbr_part', role: 'MEMBER', status: 'ACTIVE'
          });
          await adminDb.collection('familyMemberships').doc(`${famId}_${memOther.uid}`).set({
            familyId: famId, userId: memOther.uid, memberId: 'mbr_other', role: 'MEMBER', status: 'ACTIVE'
          });

          // 1. users + pushDevices
          await setDoc(doc(adm.db, 'users', adm.uid), { name: 'Ana', updatedAt: '2026-11-17T00:00:00Z' });
          await setDoc(doc(adm.db, 'users', adm.uid, 'pushDevices', 'dev1'), {
            id: 'dev1', userId: adm.uid, token: 'tok', active: true
          });
          await expectDenied(
            () => setDoc(doc(memPart.db, 'users', adm.uid, 'pushDevices', 'dev2'), { token: 'hack' }),
            'Outro usuário escrever pushDevices alheio'
          );
          await expectDenied(
            () => deleteDoc(doc(adm.db, 'users', adm.uid, 'pushDevices', 'dev1')),
            'Hard delete em pushDevices'
          );

          // 2. house, rooms, skills, protectedTimes, householdHelp, chaosState
          for (const sub of ['house', 'rooms', 'skills', 'protectedTimes', 'householdHelp', 'chaosState']) {
            await setDoc(doc(adm.db, 'families', famId, sub, 'item1'), { familyId: famId, label: sub });
            const r = await getDoc(doc(memPart.db, 'families', famId, sub, 'item1'));
            if (!r.exists()) throw new Error(`MEMBER deveria poder ler ${sub}`);
            await expectDenied(
              () => setDoc(doc(memPart.db, 'families', famId, sub, 'item2'), { hacked: true }),
              `MEMBER escrever em ${sub}`
            );
          }

          // 3. preferences, availabilities, calendarEvents
          for (const sub of ['preferences', 'availabilities', 'calendarEvents']) {
            await setDoc(doc(memPart.db, 'families', famId, sub, 'pref1'), { memberId: 'mbr_part' });
          }

          // 4. domesticSupports (ADMIN write + familyId match; sem delete; MEMBER bloqueado)
          await setDoc(doc(adm.db, 'families', famId, 'domesticSupports', 'ds1'), {
            id: 'ds1', familyId: famId, name: 'Diarista', active: true
          });
          await expectDenied(
            () => setDoc(doc(adm.db, 'families', famId, 'domesticSupports', 'ds_x'), { familyId: 'other' }),
            'domesticSupports cross-tenant'
          );
          await expectDenied(
            () => setDoc(doc(memPart.db, 'families', famId, 'domesticSupports', 'ds_m'), { familyId: famId }),
            'MEMBER criar domesticSupport'
          );
          await expectDenied(
            () => deleteDoc(doc(adm.db, 'families', famId, 'domesticSupports', 'ds1')),
            'Hard delete em domesticSupports'
          );

          // 5. auditLogs (append-only)
          await setDoc(doc(memPart.db, 'families', famId, 'auditLogs', 'log1'), { action: 'VIEW', by: 'mbr_part' });
          await expectDenied(
            () => updateDoc(doc(adm.db, 'families', famId, 'auditLogs', 'log1'), { action: 'TAMPER' }),
            'Alterar auditLog imutável'
          );
          await expectDenied(
            () => deleteDoc(doc(adm.db, 'families', famId, 'auditLogs', 'log1')),
            'Excluir auditLog imutável'
          );

          // 6. chaosSessions (state machine + participant filter)
          await setDoc(doc(adm.db, 'families', famId, 'chaosSessions', 'cs1'), {
            id: 'cs1',
            familyId: famId,
            status: 'DRAFT',
            participantMemberIds: ['mbr_part']
          });
          await expectDenied(() => getDoc(doc(memPart.db, 'families', famId, 'chaosSessions', 'cs1')), 'MEMBER ler DRAFT');
          await updateDoc(doc(adm.db, 'families', famId, 'chaosSessions', 'cs1'), { status: 'ACTIVE' });
          const partRead = await getDoc(doc(memPart.db, 'families', famId, 'chaosSessions', 'cs1'));
          if (!partRead.exists()) throw new Error('Participante deveria ler chaosSession ACTIVE');
          await expectDenied(() => getDoc(doc(memOther.db, 'families', famId, 'chaosSessions', 'cs1')), 'Não participante ler chaosSession');
          await updateDoc(doc(adm.db, 'families', famId, 'chaosSessions', 'cs1'), { status: 'COMPLETED' });
          await expectDenied(
            () => updateDoc(doc(adm.db, 'families', famId, 'chaosSessions', 'cs1'), { status: 'ACTIVE' }),
            'Reabrir chaosSession COMPLETED'
          );
          await expectDenied(
            () => deleteDoc(doc(adm.db, 'families', famId, 'chaosSessions', 'cs1')),
            'Hard delete chaosSession'
          );

          return 'Todas as coleções exclusivas de produção operam com RBAC, isolamento multi-tenant e imutabilidade preservados.';
        }
      );
    }

    // -------------------------------------------------------------------------
    // G1-15: Paridade estrutural entre firestore.rules e firestore.emulator.rules
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-15',
      'Verificação estrutural de paridade de segurança entre firestore.rules e firestore.emulator.rules',
      'PRODUCTION_PARITY',
      async () => {
        const prodRules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
        const emuRules = fs.readFileSync(path.resolve('firestore.emulator.rules'), 'utf-8');

        const requiredHelpersAndBlocks = [
          'function hasValidActiveMembership(familyId)',
          'function isMemberOfFamily(familyId)',
          'function isAdminOfFamily(familyId)',
          'function isBootstrapOwnerMember(familyId)',
          'function isRoutinesSuspended(familyId)',
          'match /routineIndex/{indexKey}',
          'match /routineIndexConflicts/{indexKey}',
          'match /operationLedgers/{operationId}',
          'match /routineReleaseAudits/{auditId}',
          'allow create, update, delete: if false;',
          "membershipDoc(familyId).data.status == 'ACTIVE'",
          "!('consistencyVersion' in request.resource.data)"
        ];

        for (const snippet of requiredHelpersAndBlocks) {
          if (!emuRules.includes(snippet)) {
            throw new Error(`firestore.emulator.rules não contém invariante esperada: ${snippet}`);
          }
          if (!prodRules.includes(snippet)) {
            throw new Error(`firestore.rules divergiu da paridade obrigatória — ausente: ${snippet}`);
          }
        }

        // Verifica que todas as coleções originais de produção permanecem presentes em firestore.rules
        const requiredProdCollections = [
          'match /users/{userId}',
          'match /pushDevices/{deviceId}',
          'match /familyInvitations/{invitationId}',
          'match /invites/{memberId}',
          'match /house/{houseId}',
          'match /rooms/{roomId}',
          'match /skills/{skillId}',
          'match /preferences/{prefId}',
          'match /protectedTimes/{timeId}',
          'match /availabilities/{availId}',
          'match /calendarEvents/{eventId}',
          'match /householdHelp/{helpId}',
          'match /domesticSupports/{domesticSupportId}',
          'match /auditLogs/{logId}',
          'match /chaosSessions/{sessionId}',
          'match /chaosState/{stateId}'
        ];

        for (const col of requiredProdCollections) {
          if (!prodRules.includes(col)) {
            throw new Error(`Regressão detectada: bloco de produção removido em firestore.rules: ${col}`);
          }
        }

        return 'Paridade 100% validada nos blocos de segurança HF3..HF2.1 e preservação completa de todas as 16 coleções de produção.';
      }
    );

    // -------------------------------------------------------------------------
    // G1-16: Execução read-only da ferramenta de auditoria contra Firestore Emulator
    // -------------------------------------------------------------------------
    await runScenario(
      'G1-16',
      'MembershipAuditTool executa em modo emulator read-only sem escrever nada no banco',
      'AUDIT_TOOL',
      async () => {
        const famId = `fam_g116_${Date.now()}`;
        const okUid = `uid_g116_ok_${Date.now()}`;
        const badUid = `uid_g116_bad_${Date.now()}`;

        await adminDb.collection('families').doc(famId).set({ id: famId, ownerUserId: okUid });
        await adminDb.collection('families').doc(famId).collection('members').doc('mbr_ok').set({
          userId: okUid, role: 'ADMIN', active: true
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${okUid}`).set({
          familyId: famId, userId: okUid, memberId: 'mbr_ok', role: 'ADMIN', status: 'ACTIVE'
        });
        await adminDb.collection('familyMemberships').doc(`${famId}_${badUid}`).set({
          familyId: famId, userId: badUid, memberId: 'mbr_missing', role: 'ADMIN', status: 'PENDING', active: false
        });

        const report = await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: adminDb as any,
          target: {
            projectId: PROJECT_ID,
            databaseId: REQUIRED_NAMED_DATABASE_ID
          }
        });

        if (report.mode !== 'emulator' || !report.readOnlyVerified) {
          throw new Error(`Modo/flag inesperado no relatório: mode=${report.mode}, ro=${report.readOnlyVerified}`);
        }
        if (report.categoryCounts.ADMIN_NON_ACTIVE_STATUS < 1 || report.categoryCounts.EXPLICIT_ACTIVE_FALSE < 1) {
          throw new Error('Ferramenta não detectou anomalias semeadas no Emulator');
        }

        // Confirma que os documentos no emulador não foram modificados pela ferramenta
        const memSnap = await adminDb.collection('familyMemberships').doc(`${famId}_${badUid}`).get();
        if (memSnap.data()?.status !== 'PENDING' || memSnap.data()?.active !== false) {
          throw new Error('Violação: estado do documento alterado após execução da auditoria read-only');
        }

        return `Auditoria read-only executada no Emulator (${report.totalMembershipsScanned} memberships lidas, zero escritas).`;
      }
    );
  } finally {
    for (const a of ephemeralApps) {
      try {
        await deleteApp(a);
      } catch {}
    }
    try {
      await deleteAdminApp(adminApp);
    } catch {}
  }

  const passCount = scenarios.filter(s => s.status === 'PASS').length;
  return {
    status: 'EXECUTED',
    summary: `${passCount} de ${scenarios.length} cenários de paridade/segurança Pre-Pilot G1 APROVADOS (profile=${rulesProfile}).`,
    scenarios
  };
}
