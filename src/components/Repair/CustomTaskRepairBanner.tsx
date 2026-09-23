import React, { useState, useMemo, useContext } from 'react';
import { AlertCircle, CheckCircle2, Copy, Play, Loader2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AuthContext } from '../../context/AuthContext';
import { db } from '../../infrastructure/firebase/firebase';
import {
  CustomTaskRepairService,
  TARGET_FAMILY_ID,
  TARGET_QA_CUSTOM_TASK_TITLES,
  OneTimeRepairReport
} from '../../application/services/CustomTaskRepairService';

export const CustomTaskRepairBanner: React.FC = () => {
  const { family, tasks, syncRollingRoutines, currentMember } = useApp();
  const auth = useContext(AuthContext);
  const currentMembership = auth?.currentMembership;

  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<OneTimeRepairReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Verificar se o usuário é ADMIN ativo da Casa Croce
  const isAuthorizedAdmin = useMemo(() => {
    return (
      family?.id === TARGET_FAMILY_ID &&
      (currentMember?.role === 'ADMIN' || currentMembership?.role === 'ADMIN') &&
      currentMembership?.status === 'ACTIVE'
    );
  }, [family?.id, currentMember?.role, currentMembership]);

  // Verificar se há tarefas órfãs da lista alvo
  const orphanTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    return tasks.filter(t => {
      const title = (t.title || '').trim().toLowerCase();
      const isTarget = TARGET_QA_CUSTOM_TASK_TITLES.some(target => title === target.toLowerCase());
      const hasFtId = Boolean(t.familyTaskId || (t as any).family_task_id);
      return isTarget && !hasFtId;
    });
  }, [tasks]);

  // Se não estiver autorizado, não tiver órfãs e nenhum relatório aberto, não renderizar nada
  if (!isAuthorizedAdmin || isDismissed) {
    return null;
  }

  if (orphanTasks.length === 0 && !report && !error) {
    return null;
  }

  const handleExecuteMigration = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await CustomTaskRepairService.executeOneTimeTransactionalRepair(
        db,
        TARGET_FAMILY_ID,
        currentMembership
      );
      setReport(result);
      // Sincronizar rotinas e tarefas da família para atualizar a UI imediatamente
      await syncRollingRoutines();
    } catch (err: any) {
      console.error('[R2B Migration] Falha na execução da migração:', err);
      setError(err?.message || 'Erro desconhecido ao executar migração transacional.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!report?.formattedSummary) return;
    navigator.clipboard.writeText(report.formattedSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div
      id="custom-task-repair-r2b-banner"
      className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-xs transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-amber-500/20 p-2 text-amber-700">
            {report?.success ? (
              <CheckCircle2 className="h-5 w-5 text-state-success" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-amber-900">
              {report?.success
                ? 'HOTFIX-TASK-CREATE-1-R2B: Migração Concluída com Sucesso'
                : 'HOTFIX-TASK-CREATE-1-R2B: Migração Canônica (4 Tarefas Customizadas)'}
            </h4>
            <p className="mt-1 text-xs text-amber-800 leading-relaxed max-w-2xl">
              {report?.success
                ? 'Todas as 4 tarefas de teste foram vinculadas a FamilyTasks canônicas atômicas no Firestore real e estão imediatamente elegíveis no Catálogo.'
                : `Detectamos ${orphanTasks.length} tarefa(s) de teste ('testes caos 1-4') no Firestore sem FamilyTask canônica vinculada. Como ADMIN da Casa Croce, você pode disparar a migração atômica controlada.`}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsDismissed(true)}
          className="rounded-lg p-1 text-amber-700 hover:bg-amber-500/20 transition cursor-pointer"
          title="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {!report && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleExecuteMigration}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 disabled:opacity-50 transition cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Executando transação atômica no Firestore...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>Executar Migração Controlada (R2B)</span>
              </>
            )}
          </button>
          <span className="text-[11px] text-amber-800/80">
            Operação segura, transacional e idempotente. Não cria novos assignments.
          </span>
        </div>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900">
              Relatório de Evidência da Migração Real:
            </span>
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 rounded-lg border border-amber-600/30 bg-white/60 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-white transition cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copied ? 'Copiado!' : 'Copiar Relatório'}</span>
            </button>
          </div>

          <pre className="max-h-64 overflow-y-auto rounded-xl bg-black/90 p-4 font-mono text-[11px] leading-relaxed text-emerald-400 select-all border border-border-default">
            {report.formattedSummary}
          </pre>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => setIsDismissed(true)}
              className="rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-text-on-primary shadow-xs hover:bg-brand-primary-hover transition cursor-pointer"
            >
              OK, Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
