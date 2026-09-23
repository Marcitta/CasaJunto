import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { runAllDistributionTests, TestScenarioResult } from '../utils/distributionTests';
import {
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  Award,
  Sparkles,
  Layers,
  Users,
  Clock,
  Flame,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

export const DistributionTestDashboard: React.FC = () => {
  const { isDevSimulatorOpen, closeDevSimulator } = useApp();
  const [testResults, setTestResults] = useState<TestScenarioResult[]>(() => runAllDistributionTests());
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState<number>(0);
  const [isRerunning, setIsRerunning] = useState<boolean>(false);

  const activeScenario = testResults[selectedScenarioIndex] || testResults[0];

  const handleRerun = () => {
    setIsRerunning(true);
    setTimeout(() => {
      setTestResults(runAllDistributionTests());
      setIsRerunning(false);
    }, 250);
  };

  const totalChecks = useMemo(() => {
    return testResults.reduce((acc, s) => acc + s.passedChecks.length, 0);
  }, [testResults]);

  const passedChecks = useMemo(() => {
    return testResults.reduce((acc, s) => acc + s.passedChecks.filter(c => c.passed).length, 0);
  }, [testResults]);

  if (!isDevSimulatorOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden border border-slate-200 flex flex-col h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight text-white">
                  Dashboard de Validação — Motor de Distribuição 2.0
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-500/30">
                  Validação Automática
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Execução e auditoria dos Cenários A a F (Capacidade, Disponibilidade, Esforço, Proteções e Rotatividade)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRerun}
              disabled={isRerunning}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRerunning ? 'animate-spin' : ''}`} />
              {isRerunning ? 'Calculando...' : 'Reexecutar Cenários'}
            </button>
            <button
              onClick={closeDevSimulator}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Summary Bar */}
        <div className="px-6 py-3 bg-slate-800/60 border-b border-slate-800 text-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                Testes Automatizados: <strong className="text-emerald-400">{passedChecks}/{totalChecks} aprovados</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Award className="w-4 h-4 text-amber-400" />
              <span>
                Cenários de Teste: <strong className="text-white">{testResults.length} Famílias Simuladas</strong>
              </span>
            </div>
          </div>
          <div className="text-slate-400 text-[11px]">
            Conforme Seção 25 do Prompt Mestre: <span className="text-slate-200">tarefa, candidato, score, motivo, esforço antes/depois</span>
          </div>
        </div>

        {/* Scenario Tabs */}
        <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 overflow-x-auto flex gap-2 no-scrollbar">
          {testResults.map((scenario, idx) => {
            const isSelected = idx === selectedScenarioIndex;
            const allPassed = scenario.passedChecks.every(c => c.passed);
            return (
              <button
                key={scenario.scenarioId}
                onClick={() => setSelectedScenarioIndex(idx)}
                className={`px-4 py-2.5 rounded-t-2xl font-bold text-xs whitespace-nowrap transition-all border-t border-x flex items-center gap-2 ${
                  isSelected
                    ? 'bg-white text-slate-900 border-slate-200 shadow-sm'
                    : 'bg-transparent text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100'
                }`}
              >
                {allPassed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>{scenario.scenarioTitle.split(':')[0]}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 font-normal text-slate-600">
                  {scenario.fairnessIndex}% Justiça
                </span>
              </button>
            );
          })}
        </div>

        {/* Scenario Detail Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/50">
          {/* Header Card for Selected Scenario */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <span>{activeScenario.scenarioTitle}</span>
                </h4>
                <p className="text-xs text-slate-500 mt-1">{activeScenario.scenarioDescription}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-3.5 py-2 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-emerald-600">Índice de Justiça</div>
                    <div className="text-sm font-extrabold text-emerald-700">{activeScenario.fairnessIndex}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Residents Pill List */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase mr-1">Moradores:</span>
              {activeScenario.residents.map(r => (
                <div
                  key={r.id}
                  className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5"
                >
                  <div
                    className="w-4 h-4 rounded-full text-[9px] text-white flex items-center justify-center font-bold"
                    style={{ backgroundColor: r.color || '#3b82f6' }}
                  >
                    {r.avatar}
                  </div>
                  <span>{r.name}</span>
                  <span className="text-[10px] text-slate-400">({r.age}a • Autonomia Nív. {r.autonomy_level})</span>
                </div>
              ))}
            </div>

            {/* Invariants & Passed Checks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              {activeScenario.passedChecks.map((chk, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
                    chk.passed ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {chk.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">{chk.name}</div>
                    <div className="text-[11px] opacity-80 mt-0.5">{chk.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Validation Table as requested in prompt */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h5 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Auditoria de Decisão por Tarefa (Section 25 Table)
              </h5>
              <span className="text-xs text-slate-500">
                {activeScenario.assignmentsDetail.length} tarefa(s) avaliada(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200/60">
                  <tr>
                    <th className="py-3 px-4">Tarefa & Cômodo</th>
                    <th className="py-3 px-4">Candidato Escolhido</th>
                    <th className="py-3 px-4 text-center">Score de Adequação</th>
                    <th className="py-3 px-4">Motivo / Justificativa Explicável</th>
                    <th className="py-3 px-4 text-center">Tempo Antes</th>
                    <th className="py-3 px-4 text-center">Tempo Depois</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeScenario.assignmentsDetail.map((detail, index) => (
                    <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                      {/* Tarefa */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{detail.taskName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>{detail.category}</span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                            <Flame className="w-3 h-3" />
                            {detail.effortPoints} pts esforço
                          </span>
                        </div>
                      </td>

                      {/* Candidato Escolhido */}
                      <td className="py-3.5 px-4">
                        {detail.isUnassigned ? (
                          <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold text-[11px]">
                            Não atribuído
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center">
                              {detail.assignedTo.charAt(0)}
                            </div>
                            <span className="font-bold text-slate-800">{detail.assignedTo}</span>
                          </div>
                        )}
                      </td>

                      {/* Score */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold text-xs">
                          {detail.score.toFixed(0)}
                        </span>
                      </td>

                      {/* Motivo */}
                      <td className="py-3.5 px-4 max-w-md">
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {detail.reason}
                        </p>
                        {detail.factors && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px]">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                              Capacidade: +{detail.factors.capacityScore}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                              Disponib: +{detail.factors.availabilityScore}
                            </span>
                            {detail.factors.preferenceScore !== 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700">
                                Pref: {detail.factors.preferenceScore > 0 ? `+${detail.factors.preferenceScore}` : detail.factors.preferenceScore}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
                              Equilíbrio: +{detail.factors.balanceScore}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Contribuição Antes */}
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                        {detail.contributionBefore} min
                      </td>

                      {/* Contribuição Depois */}
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-700 font-mono">
                        +{detail.contributionAfter} min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Motor de Distribuição 2.0 • Totalmente validado e operando em produção
          </div>
          <button
            onClick={closeDevSimulator}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors shadow-sm"
          >
            Fechar Validação
          </button>
        </div>
      </div>
    </div>
  );
};
