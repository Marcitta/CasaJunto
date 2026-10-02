import React, { useState, useEffect, useContext } from 'react';
import { Trash2, AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw, X, Database } from 'lucide-react';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../infrastructure/firebase/firebase';
import { useApp } from '../../context/AppContext';
import { AuthContext } from '../../context/AuthContext';

export const AUTHORIZED_FAMILY_ID = 'fam-croce-2026';

export const AUTHORIZED_FAMILY_TASK_IDS = [
  'ft-qa-1',
  'ft-qa-2',
  'ft-qa-3',
  'ft-qa-4',
  'ft-qa-5',
  'ft-qa-6',
  'ft-qa-7',
  'ft-qa-8',
  'ft-qa-9',
  'ft-qa-10'
];

export const AUTHORIZED_ASSIGNMENT_IDS = [
  'asg-inc-1',
  'asg-inc-2',
  'asg-inc-3',
  'asg-inc-4',
  'asg-inc-5',
  'asg-inc-6',
  'asg-inc-7',
  'asg-inc-8',
  'asg-inc-9',
  'asg-inc-10'
];

export interface PreCheckDetails {
  foundFamilyTasksCount: number;
  foundAssignmentsCount: number;
  familyTasksList: { id: string; exists: boolean; name?: string }[];
  assignmentsList: { id: string; exists: boolean; title?: string }[];
  isSafeToProceed: boolean;
  abortReason?: string;
}

export interface PostCheckDetails {
  familyTasksBefore: number;
  familyTasksAfter: number;
  assignmentsBefore: number;
  assignmentsAfter: number;
  verificationPassed: boolean;
}

export const QaDataCleanupTool: React.FC = () => {
  const { family, currentMember, isDemoMode, reloadAssignments } = useApp();
  const auth = useContext(AuthContext);
  const currentUser = auth?.currentUser;

  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [preCheck, setPreCheck] = useState<PreCheckDetails | null>(null);
  const [postCheck, setPostCheck] = useState<PostCheckDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';
  const isTargetTenant = family?.id === AUTHORIZED_FAMILY_ID;

  // Strict Security Gate: Only render for authenticated ADMIN on authorized tenant 'fam-croce-2026'
  if (isDemoMode || !currentUser || !isAdmin || !isTargetTenant) {
    return null;
  }

  const runPreExecutionCheck = async () => {
    setIsChecking(true);
    setErrorMessage(null);
    setPreCheck(null);
    setPostCheck(null);

    try {
      if (family.id !== AUTHORIZED_FAMILY_ID) {
        throw new Error(`Tenant inválido: ${family.id}. Esta ferramenta só pode ser usada em ${AUTHORIZED_FAMILY_ID}`);
      }

      const ftResults: { id: string; exists: boolean; name?: string }[] = [];
      let foundFTCount = 0;

      for (const ftId of AUTHORIZED_FAMILY_TASK_IDS) {
        const ftRef = doc(db, 'families', AUTHORIZED_FAMILY_ID, 'familyTasks', ftId);
        const snap = await getDoc(ftRef);
        if (snap.exists()) {
          foundFTCount++;
          const data = snap.data();
          // Security invariant: strictly forbid unexpected cross-tenant data
          const famIdInData = data.family_id || data.familyId;
          if (famIdInData && famIdInData !== AUTHORIZED_FAMILY_ID) {
            throw new Error(`ABORT: Registro ${ftId} possui vínculo com tenant diferente (${famIdInData})`);
          }
          ftResults.push({ id: ftId, exists: true, name: data.name || data.customTitle || '(sem título)' });
        } else {
          ftResults.push({ id: ftId, exists: false });
        }
      }

      const asgResults: { id: string; exists: boolean; title?: string }[] = [];
      let foundAsgCount = 0;

      for (const asgId of AUTHORIZED_ASSIGNMENT_IDS) {
        const asgRef = doc(db, 'families', AUTHORIZED_FAMILY_ID, 'assignments', asgId);
        const snap = await getDoc(asgRef);
        if (snap.exists()) {
          foundAsgCount++;
          const data = snap.data();
          const famIdInData = data.family_id || data.familyId;
          if (famIdInData && famIdInData !== AUTHORIZED_FAMILY_ID) {
            throw new Error(`ABORT: Assignment ${asgId} possui vínculo com tenant diferente (${famIdInData})`);
          }
          asgResults.push({ id: asgId, exists: true, title: data.title || data.custom_title || '(sem título)' });
        } else {
          asgResults.push({ id: asgId, exists: false });
        }
      }

      setPreCheck({
        foundFamilyTasksCount: foundFTCount,
        foundAssignmentsCount: foundAsgCount,
        familyTasksList: ftResults,
        assignmentsList: asgResults,
        isSafeToProceed: true
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao verificar registros de QA no Firestore.');
      setPreCheck({
        foundFamilyTasksCount: 0,
        foundAssignmentsCount: 0,
        familyTasksList: [],
        assignmentsList: [],
        isSafeToProceed: false,
        abortReason: err?.message || 'Erro durante a pré-checagem.'
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleOpenModal = () => {
    setIsOpen(true);
    runPreExecutionCheck();
  };

  const executeAtomicCleanup = async () => {
    if (!preCheck || !preCheck.isSafeToProceed) return;

    setIsExecuting(true);
    setErrorMessage(null);

    try {
      if (family.id !== AUTHORIZED_FAMILY_ID) {
        throw new Error('Tenant incompatível. Operação cancelada por segurança.');
      }

      const batch = writeBatch(db);

      // 1. Delete authorized FamilyTasks
      for (const ftId of AUTHORIZED_FAMILY_TASK_IDS) {
        const ref = doc(db, 'families', AUTHORIZED_FAMILY_ID, 'familyTasks', ftId);
        batch.delete(ref);
      }

      // 2. Delete authorized Assignments
      for (const asgId of AUTHORIZED_ASSIGNMENT_IDS) {
        const ref = doc(db, 'families', AUTHORIZED_FAMILY_ID, 'assignments', asgId);
        batch.delete(ref);
      }

      // 3. Atomic commit
      await batch.commit();

      // 4. Mandatory Post-Commit Verification (getDoc on all 20 paths)
      let ftRemaining = 0;
      for (const ftId of AUTHORIZED_FAMILY_TASK_IDS) {
        const ref = doc(db, 'families', AUTHORIZED_FAMILY_ID, 'familyTasks', ftId);
        const snap = await getDoc(ref);
        if (snap.exists()) ftRemaining++;
      }

      let asgRemaining = 0;
      for (const asgId of AUTHORIZED_ASSIGNMENT_IDS) {
        const ref = doc(db, 'families', AUTHORIZED_FAMILY_ID, 'assignments', asgId);
        const snap = await getDoc(ref);
        if (snap.exists()) asgRemaining++;
      }

      const passed = ftRemaining === 0 && asgRemaining === 0;

      setPostCheck({
        familyTasksBefore: preCheck.foundFamilyTasksCount,
        familyTasksAfter: ftRemaining,
        assignmentsBefore: preCheck.foundAssignmentsCount,
        assignmentsAfter: asgRemaining,
        verificationPassed: passed
      });

      if (!passed) {
        throw new Error(`Falha na verificação pós-commit: ainda restam ${ftRemaining} rotinas e ${asgRemaining} assignments no Firestore.`);
      }

      // 5. Canonical reload of application state
      if (reloadAssignments) {
        await reloadAssignments();
      }
    } catch (err: any) {
      console.error('[QA-DATA-CLEANUP-02] Erro na limpeza atômica:', err);
      setErrorMessage(err?.message || 'Erro durante a execução do writeBatch no Firestore.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <>
      {/* Botão de Operação Administrativa Temporária no Topo de Hoje */}
      <div 
        id="qa-cleanup-banner"
        className="w-full mb-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-2.5">
          <div className="p-2 bg-amber-500/20 rounded-xl text-amber-600 shrink-0 mt-0.5 sm:mt-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Ação Administrativa Temporária
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/60 font-semibold text-amber-800">
                {AUTHORIZED_FAMILY_ID}
              </span>
            </div>
            <p className="text-xs text-amber-800/90 mt-0.5 font-medium">
              Dados residuais de QA/Modo Caos detectados no Firestore.
            </p>
          </div>
        </div>

        <button
          id="btn-open-qa-cleanup"
          onClick={handleOpenModal}
          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Limpar dados QA do Modo Caos</span>
        </button>
      </div>

      {/* Modal de Confirmação Explícita e Execução Controlada */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qa-cleanup-title"
        >
          <div className="bg-surface-card border border-border-default rounded-3xl max-w-lg w-full p-6 shadow-xl space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2.5 text-state-error">
                <Database className="w-5 h-5 text-amber-600" />
                <h3 id="qa-cleanup-title" className="text-base font-extrabold text-text-primary">
                  Limpeza de Dados QA (Modo Caos)
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                disabled={isExecuting}
                className="p-1.5 text-text-muted hover:text-text-primary rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Aviso Obrigatório */}
            <div className="p-3.5 bg-brand-primary-soft/40 border border-brand-primary/20 rounded-2xl text-xs space-y-2">
              <p className="font-semibold text-text-primary">
                Esta operação removerá permanentemente 10 rotinas e 10 ocorrências criadas exclusivamente para QA.
              </p>
              <p className="text-state-success font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>Nenhuma tarefa real será removida.</span>
              </p>
            </div>

            {/* Status da Pré-Checagem com getDoc */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-text-secondary">
                <span>Auditoria Prévia (getDoc):</span>
                {isChecking && (
                  <span className="flex items-center gap-1 text-brand-primary font-medium">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Verificando Firestore...
                  </span>
                )}
              </div>

              {preCheck && (
                <div className="p-3 bg-surface-subtle rounded-xl border border-border-default space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">FamilyTasks QA encontradas:</span>
                    <span className="font-bold text-text-primary">{preCheck.foundFamilyTasksCount} de 10</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Assignments QA encontrados:</span>
                    <span className="font-bold text-text-primary">{preCheck.foundAssignmentsCount} de 10</span>
                  </div>
                  <div className="flex justify-between border-t border-border-subtle pt-1 mt-1">
                    <span className="text-text-secondary">Tenant validado:</span>
                    <span className="font-bold text-emerald-600">{AUTHORIZED_FAMILY_ID}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Mensagem de Erro se houver */}
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-state-error text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Resultado Pós-Commit */}
            {postCheck && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Limpeza Executada e Verificada com Sucesso!</span>
                </div>
                <div className="font-mono text-[11px] text-text-secondary space-y-1">
                  <div>FamilyTasks before: {postCheck.familyTasksBefore} | after: {postCheck.familyTasksAfter}</div>
                  <div>Assignments before: {postCheck.assignmentsBefore} | after: {postCheck.assignmentsAfter}</div>
                  <div className="font-bold text-emerald-700">Post-commit verification: PASS</div>
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isExecuting}
                className="px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary rounded-xl transition"
              >
                {postCheck?.verificationPassed ? 'Fechar' : 'Cancelar'}
              </button>

              {!postCheck?.verificationPassed && (
                <button
                  type="button"
                  id="btn-confirm-qa-cleanup"
                  onClick={executeAtomicCleanup}
                  disabled={isChecking || isExecuting || !preCheck?.isSafeToProceed}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Removendo atomicamente...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirmar e Executar Limpeza Atômica</span>
                    </>
                  )}
                </button>
              )}

              {postCheck?.verificationPassed && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    if (reloadAssignments) reloadAssignments();
                  }}
                  className="px-4 py-2 bg-brand-primary text-text-on-primary rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>Concluir e Atualizar Tela</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
