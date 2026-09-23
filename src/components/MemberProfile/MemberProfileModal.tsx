import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  User, 
  Plus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  Check, 
  GraduationCap, 
  Briefcase, 
  BookOpen, 
  Trophy, 
  Moon, 
  Info,
  ChevronRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProtectedTime, ProtectedTimeType, MemberProfileUpdateData } from '../../types';
import { 
  calculateAgeFromBirthDate, 
  DAYS_OF_WEEK, 
  DAY_SHORTCUTS, 
  PROTECTED_TIME_LABELS, 
  AUTONOMY_LEVELS, 
  formatDaysOfWeek, 
  isValidTimeString,
  checkTimeIntervalOverlap
} from '../../utils/dateUtils';

export const MemberProfileModal: React.FC = () => {
  const { 
    isMemberProfileModalOpen, 
    activeMemberForProfile, 
    closeMemberProfile, 
    updateMemberProfile,
    protectedTimes,
    addProtectedTime,
    updateProtectedTime,
    deleteProtectedTime,
    currentMember,
    isDemoMode
  } = useApp();

  const canEdit = Boolean(
    isDemoMode || 
    currentMember?.role === 'ADMIN' || 
    (activeMemberForProfile && currentMember?.id === activeMemberForProfile.id)
  );

  const [activeTab, setActiveTab] = useState<'general' | 'schedule'>('general');

  // General Tab Form State
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [autonomyLevel, setAutonomyLevel] = useState<number>(3);
  const [useCustomMinutes, setUseCustomMinutes] = useState(false);
  const [maxDailyMinutes, setMaxDailyMinutes] = useState<number>(60);
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Schedule Tab Commitment Form State
  const [isAddingCommitment, setIsAddingCommitment] = useState(false);
  const [editingCommitmentId, setEditingCommitmentId] = useState<string | null>(null);
  const [commitmentType, setCommitmentType] = useState<ProtectedTimeType>('school');
  const [commitmentLabel, setCommitmentLabel] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('13:00');
  const [commitmentError, setCommitmentError] = useState('');
  const [commitmentWarning, setCommitmentWarning] = useState('');
  const [isSavingCommitment, setIsSavingCommitment] = useState(false);

  // Sync state when active member changes
  useEffect(() => {
    if (activeMemberForProfile) {
      setName(activeMemberForProfile.name || '');
      setBirthDate(activeMemberForProfile.birth_date || '');
      setAutonomyLevel(activeMemberForProfile.autonomy_level || 3);
      if (activeMemberForProfile.max_daily_minutes) {
        setUseCustomMinutes(true);
        setMaxDailyMinutes(activeMemberForProfile.max_daily_minutes);
      } else {
        setUseCustomMinutes(false);
        setMaxDailyMinutes(60);
      }
      setBio(activeMemberForProfile.bio || '');
      setPhone(activeMemberForProfile.phone || '');
      setSaveStatus('idle');
      setErrorMessage('');
      setIsAddingCommitment(false);
      setEditingCommitmentId(null);
    }
  }, [activeMemberForProfile]);

  if (!isMemberProfileModalOpen || !activeMemberForProfile) {
    return null;
  }

  // Calculated Age
  const calculatedAge = birthDate ? calculateAgeFromBirthDate(birthDate) : null;

  // Filter protected times for this member
  const memberProtectedTimes = protectedTimes.filter(
    pt => pt.member_id === activeMemberForProfile.id
  );

  // Check overlap for current commitment form
  const checkOverlapWarnings = (newStartTime: string, newEndTime: string, days: number[], ignoreId?: string | null) => {
    let hasOvernight = false;
    let hasOverlap = false;

    if (isValidTimeString(newStartTime) && isValidTimeString(newEndTime)) {
      if (newStartTime > newEndTime) {
        hasOvernight = true;
      }

      // Check overlap against other active commitments of this member on same days
      for (const pt of memberProtectedTimes) {
        if (!pt.active || (ignoreId && pt.id === ignoreId)) continue;
        const commonDays = pt.day_of_week.some(d => days.includes(d));
        if (commonDays) {
          if (checkTimeIntervalOverlap(newStartTime, newEndTime, pt.start_time, pt.end_time)) {
            hasOverlap = true;
            break;
          }
        }
      }
    }

    if (hasOvernight && hasOverlap) {
      setCommitmentWarning('Atenção: Horário cruza a meia-noite e coincide com outro compromisso ativo.');
    } else if (hasOvernight) {
      setCommitmentWarning('Horário noturno: Este compromisso cruza a meia-noite.');
    } else if (hasOverlap) {
      setCommitmentWarning('Aviso: Há sobreposição de horários com outro compromisso cadastrado.');
    } else {
      setCommitmentWarning('');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSaveStatus('saving');

    if (!canEdit) {
      setErrorMessage('Você só tem permissão para editar seu próprio perfil.');
      setSaveStatus('error');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('O nome do morador é obrigatório.');
      setSaveStatus('error');
      return;
    }

    if (birthDate) {
      const age = calculateAgeFromBirthDate(birthDate);
      if (age === null) {
        setErrorMessage('Data de nascimento inválida ou no futuro.');
        setSaveStatus('error');
        return;
      }
      if (age > 120) {
        setErrorMessage('Data de nascimento fora do limite válido.');
        setSaveStatus('error');
        return;
      }
    }

    const payload: MemberProfileUpdateData = {
      name: name.trim(),
      birth_date: birthDate || undefined,
      autonomy_level: autonomyLevel,
      max_daily_minutes: useCustomMinutes ? Number(maxDailyMinutes) : null,
      bio: bio.trim() || null,
      phone: phone.trim() || null
    };

    try {
      await updateMemberProfile(activeMemberForProfile.id, payload);
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao salvar perfil.');
      setSaveStatus('error');
    }
  };

  const handleSaveCommitment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCommitmentError('');

    if (!commitmentLabel.trim()) {
      setCommitmentError('Informe a descrição do compromisso (ex: Escola Integral).');
      return;
    }

    if (selectedDays.length === 0) {
      setCommitmentError('Selecione ao menos um dia da semana.');
      return;
    }

    if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
      setCommitmentError('Horários devem estar no formato HH:mm válido.');
      return;
    }

    if (startTime === endTime) {
      setCommitmentError('O horário de início e término não podem ser idênticos.');
      return;
    }

    setIsSavingCommitment(true);
    try {
      if (editingCommitmentId) {
        await updateProtectedTime(editingCommitmentId, {
          type: commitmentType,
          label: commitmentLabel.trim(),
          day_of_week: [...selectedDays].sort((a, b) => a - b),
          start_time: startTime,
          end_time: endTime
        });
      } else {
        await addProtectedTime({
          member_id: activeMemberForProfile.id,
          type: commitmentType,
          label: commitmentLabel.trim(),
          day_of_week: [...selectedDays].sort((a, b) => a - b),
          start_time: startTime,
          end_time: endTime,
          active: true
        });
      }
      setIsAddingCommitment(false);
      setEditingCommitmentId(null);
      setCommitmentLabel('');
      setCommitmentWarning('');
      setSelectedDays([1, 2, 3, 4, 5]);
      setStartTime('07:30');
      setEndTime('13:00');
    } catch (err: any) {
      setCommitmentError(err?.message || 'Erro ao salvar compromisso.');
    } finally {
      setIsSavingCommitment(false);
    }
  };

  const handleStartEditCommitment = (pt: ProtectedTime) => {
    setEditingCommitmentId(pt.id);
    setCommitmentType((pt.type as ProtectedTimeType) || 'school');
    setCommitmentLabel(pt.label);
    setSelectedDays(pt.day_of_week);
    setStartTime(pt.start_time);
    setEndTime(pt.end_time);
    setIsAddingCommitment(true);
    checkOverlapWarnings(pt.start_time, pt.end_time, pt.day_of_week, pt.id);
  };

  const handleToggleDay = (day: number) => {
    const updated = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day];
    setSelectedDays(updated);
    checkOverlapWarnings(startTime, endTime, updated, editingCommitmentId);
  };

  const handleApplyShortcut = (days: number[]) => {
    setSelectedDays(days);
    checkOverlapWarnings(startTime, endTime, days, editingCommitmentId);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'school': return <GraduationCap className="w-4 h-4 text-indigo-600" />;
      case 'work': return <Briefcase className="w-4 h-4 text-blue-600" />;
      case 'study': return <BookOpen className="w-4 h-4 text-emerald-600" />;
      case 'sports': return <Trophy className="w-4 h-4 text-amber-600" />;
      case 'sleep': return <Moon className="w-4 h-4 text-purple-600" />;
      case 'appointment': return <Calendar className="w-4 h-4 text-rose-600" />;
      default: return <Clock className="w-4 h-4 text-brand-primary" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-surface-card rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-border-default overflow-hidden"
        id="member-profile-modal"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-border-default bg-surface-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-xs"
              style={{ 
                backgroundColor: `${activeMemberForProfile.color || '#5b32a3'}20`, 
                color: activeMemberForProfile.color || '#5b32a3' 
              }}
            >
              {activeMemberForProfile.avatar || '👤'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-text-primary leading-tight">
                  {activeMemberForProfile.name}
                </h3>
                {activeMemberForProfile.role === 'ADMIN' ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-extrabold flex items-center gap-1 border border-amber-200">
                    <ShieldCheck className="w-3 h-3 text-amber-600" />
                    Admin
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600 text-[10px] font-semibold border border-neutral-200">
                    Morador
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                {calculatedAge !== null ? `${calculatedAge} anos` : 'Idade não informada'} • Nível {activeMemberForProfile.autonomy_level || 3} de autonomia
              </p>
            </div>
          </div>
          <button
            onClick={closeMemberProfile}
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:bg-surface-subtle hover:text-text-primary transition cursor-pointer"
            title="Fechar"
            id="close-profile-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border-default px-5 bg-surface-card">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'general'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
            id="tab-profile-general"
          >
            <User className="w-3.5 h-3.5" />
            <span>Geral</span>
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'schedule'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
            id="tab-profile-schedule"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Agenda e Horários</span>
            {memberProtectedTimes.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-brand-primary-soft text-brand-primary text-[10px] font-extrabold">
                {memberProtectedTimes.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'general' ? (
            <form onSubmit={handleSaveProfile} className="space-y-5" id="form-member-profile">
              {/* Nome Completo */}
              <div>
                <label className="block text-xs font-bold text-text-primary mb-1">
                  Nome Completo <span className="text-state-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nome do morador"
                  className="w-full px-3.5 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  id="input-member-name"
                />
              </div>

              {/* Data de Nascimento & Idade Calculada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-text-primary mb-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                    id="input-member-birthdate"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-default flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-text-secondary">Idade Calculada:</span>
                  <span className="text-xs font-extrabold text-text-primary" id="derived-age-display">
                    {calculatedAge !== null ? `${calculatedAge} anos` : 'Aguardando data'}
                  </span>
                </div>
              </div>

              {/* Nível de Autonomia Doméstica */}
              <div>
                <label className="block text-xs font-bold text-text-primary mb-2">
                  Nível de Autonomia Doméstica
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {AUTONOMY_LEVELS.map(lvl => (
                    <label
                      key={lvl.level}
                      className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                        autonomyLevel === lvl.level
                          ? 'border-brand-primary bg-brand-primary-soft/40'
                          : 'border-border-default bg-surface-card hover:bg-surface-subtle'
                      }`}
                    >
                      <input
                        type="radio"
                        name="autonomy"
                        value={lvl.level}
                        checked={autonomyLevel === lvl.level}
                        onChange={() => setAutonomyLevel(lvl.level)}
                        className="mt-0.5 accent-brand-primary"
                      />
                      <div>
                        <div className="text-xs font-bold text-text-primary">{lvl.title}</div>
                        <div className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                          {lvl.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Teto Diário de Tarefas */}
              <div className="p-4 rounded-xl border border-border-default bg-surface-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-text-primary">Teto Diário de Tarefas</h4>
                    <p className="text-[11px] text-text-secondary">
                      Limite máximo de esforço diário alocado para este morador.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={useCustomMinutes} 
                      onChange={e => setUseCustomMinutes(e.target.checked)} 
                      className="sr-only peer"
                      id="toggle-custom-minutes"
                    />
                    <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-primary"></div>
                  </label>
                </div>

                {useCustomMinutes ? (
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={maxDailyMinutes}
                      onChange={e => setMaxDailyMinutes(Number(e.target.value))}
                      className="w-24 px-3 py-1.5 rounded-xl border border-border-default text-xs font-bold text-text-primary bg-surface-card focus:outline-none focus:border-brand-primary"
                      id="input-custom-minutes"
                    />
                    <span className="text-xs text-text-secondary">minutos por dia</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-brand-primary font-semibold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Utilizando limite recomendado pelo padrão da idade.
                  </p>
                )}
              </div>

              {/* Bio & Observações */}
              <div>
                <label className="block text-xs font-bold text-text-primary mb-1">
                  Bio / Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Informações sobre rotina ou particularidades..."
                  className="w-full px-3.5 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  id="textarea-member-bio"
                />
              </div>

              {/* Error or Success feedback */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-state-error-soft border border-state-error/30 text-xs text-state-error flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {saveStatus === 'saved' && (
                <div className="p-3 rounded-xl bg-state-success-soft border border-state-success/30 text-xs text-state-success flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Perfil atualizado com sucesso!</span>
                </div>
              )}

              {/* Save Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-default">
                <button
                  type="button"
                  onClick={closeMemberProfile}
                  className="px-4 py-2 rounded-xl border border-border-default text-xs font-bold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveStatus === 'saving'}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  id="btn-save-member-profile"
                >
                  {saveStatus === 'saving' ? 'Salvando...' : 'Salvar Perfil'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4" id="tab-schedule-content">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-extrabold text-text-primary">
                    Compromissos Recorrentes
                  </h4>
                  <p className="text-[11px] text-text-secondary">
                    Tarefas automáticas não serão agendadas durante estes horários protegidos.
                  </p>
                </div>
                {!isAddingCommitment && (
                  <button
                    onClick={() => {
                      setEditingCommitmentId(null);
                      setCommitmentLabel('');
                      setCommitmentWarning('');
                      setCommitmentError('');
                      setSelectedDays([1, 2, 3, 4, 5]);
                      setStartTime('07:30');
                      setEndTime('13:00');
                      setIsAddingCommitment(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold flex items-center gap-1 hover:bg-brand-primary-hover transition cursor-pointer"
                    id="btn-add-commitment"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Compromisso</span>
                  </button>
                )}
              </div>

              {/* Add/Edit Commitment Inline Form */}
              {isAddingCommitment && (
                <form 
                  onSubmit={handleSaveCommitment} 
                  className="p-4 rounded-2xl bg-surface-subtle border border-brand-primary/30 shadow-xs space-y-3"
                  id="form-commitment"
                >
                  <div className="flex items-center justify-between border-b border-border-default pb-2">
                    <h5 className="text-xs font-bold text-text-primary">
                      {editingCommitmentId ? 'Editar Compromisso' : 'Novo Horário Protegido'}
                    </h5>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCommitment(false);
                        setEditingCommitmentId(null);
                      }}
                      className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Tipo */}
                    <div>
                      <label className="block text-[11px] font-bold text-text-primary mb-1">
                        Tipo de Compromisso
                      </label>
                      <select
                        value={commitmentType}
                        onChange={e => setCommitmentType(e.target.value as ProtectedTimeType)}
                        className="w-full px-3 py-1.5 rounded-xl border border-border-default text-xs text-text-primary bg-surface-card focus:outline-none focus:border-brand-primary"
                        id="select-commitment-type"
                      >
                        {Object.entries(PROTECTED_TIME_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>

                    {/* Descrição / Rótulo */}
                    <div>
                      <label className="block text-[11px] font-bold text-text-primary mb-1">
                        Descrição / Nome
                      </label>
                      <input
                        type="text"
                        required
                        value={commitmentLabel}
                        onChange={e => setCommitmentLabel(e.target.value)}
                        placeholder="Ex: Escola Estadual, Treino..."
                        className="w-full px-3 py-1.5 rounded-xl border border-border-default text-xs text-text-primary bg-surface-card focus:outline-none focus:border-brand-primary"
                        id="input-commitment-label"
                      />
                    </div>
                  </div>

                  {/* Dias da Semana */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-text-primary">
                        Dias da Semana
                      </label>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => handleApplyShortcut(DAY_SHORTCUTS.WEEKDAYS)}
                          className="px-2 py-0.5 rounded-md bg-surface-card border border-border-default text-brand-primary font-semibold hover:bg-surface-subtle cursor-pointer"
                        >
                          Seg–Sex
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyShortcut(DAY_SHORTCUTS.WEEKEND)}
                          className="px-2 py-0.5 rounded-md bg-surface-card border border-border-default text-brand-primary font-semibold hover:bg-surface-subtle cursor-pointer"
                        >
                          Fim de Semana
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyShortcut(DAY_SHORTCUTS.ALL)}
                          className="px-2 py-0.5 rounded-md bg-surface-card border border-border-default text-brand-primary font-semibold hover:bg-surface-subtle cursor-pointer"
                        >
                          Todos
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {DAYS_OF_WEEK.map(d => {
                        const isSelected = selectedDays.includes(d.value);
                        return (
                          <button
                            type="button"
                            key={d.value}
                            onClick={() => handleToggleDay(d.value)}
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'bg-brand-primary text-text-on-primary shadow-2xs'
                                : 'bg-surface-card border border-border-default text-text-secondary hover:bg-surface-subtle'
                            }`}
                            title={d.label}
                          >
                            {d.letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Horários Início e Fim */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-text-primary mb-1">
                        Início
                      </label>
                      <input
                        type="time"
                        required
                        value={startTime}
                        onChange={e => {
                          setStartTime(e.target.value);
                          checkOverlapWarnings(e.target.value, endTime, selectedDays, editingCommitmentId);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-border-default text-xs text-text-primary bg-surface-card focus:outline-none focus:border-brand-primary"
                        id="input-commitment-start"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-text-primary mb-1">
                        Término
                      </label>
                      <input
                        type="time"
                        required
                        value={endTime}
                        onChange={e => {
                          setEndTime(e.target.value);
                          checkOverlapWarnings(startTime, e.target.value, selectedDays, editingCommitmentId);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-border-default text-xs text-text-primary bg-surface-card focus:outline-none focus:border-brand-primary"
                        id="input-commitment-end"
                      />
                    </div>
                  </div>

                  {/* Warning Messages */}
                  {commitmentWarning && (
                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>{commitmentWarning}</span>
                    </div>
                  )}

                  {/* Error Messages */}
                  {commitmentError && (
                    <div className="p-2 rounded-xl bg-state-error-soft border border-state-error/30 text-[11px] text-state-error flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{commitmentError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCommitment(false);
                        setEditingCommitmentId(null);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-border-default text-xs text-text-secondary hover:bg-surface-subtle cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingCommitment}
                      className="px-4 py-1.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold hover:bg-brand-primary-hover disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      id="btn-save-commitment-submit"
                    >
                      {isSavingCommitment ? 'Salvando...' : (editingCommitmentId ? 'Atualizar' : 'Adicionar')}
                    </button>
                  </div>
                </form>
              )}

              {/* Commitments List */}
              <div className="space-y-2">
                {memberProtectedTimes.length === 0 ? (
                  <div className="p-6 text-center rounded-2xl bg-surface-subtle border border-dashed border-border-default">
                    <Clock className="w-6 h-6 text-text-muted mx-auto mb-1.5 opacity-60" />
                    <p className="text-xs font-bold text-text-primary">Nenhum horário protegido cadastrado</p>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      Cadastre horários de escola, trabalho ou esportes para evitar conflitos de agenda.
                    </p>
                  </div>
                ) : (
                  memberProtectedTimes.map(pt => (
                    <div
                      key={pt.id}
                      className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        pt.active 
                          ? 'bg-surface-card border-border-default shadow-2xs' 
                          : 'bg-surface-subtle border-border-default opacity-60'
                      }`}
                      id={`commitment-card-${pt.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-primary-soft flex items-center justify-center shrink-0">
                          {getTypeIcon(pt.type)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-bold text-text-primary">{pt.label}</h5>
                            <span className="px-1.5 py-0.5 rounded-md bg-brand-primary-soft text-brand-primary text-[10px] font-semibold">
                              {PROTECTED_TIME_LABELS[pt.type as ProtectedTimeType] || pt.type}
                            </span>
                            {!pt.active && (
                              <span className="px-1.5 py-0.5 rounded-md bg-neutral-200 text-neutral-600 text-[10px] font-semibold">
                                Pausado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-text-secondary">
                            <span className="font-semibold text-brand-primary">
                              {formatDaysOfWeek(pt.day_of_week)}
                            </span>
                            <span>•</span>
                            <span>{pt.start_time} às {pt.end_time}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Toggle active button */}
                        <button
                          onClick={() => updateProtectedTime(pt.id, { active: !pt.active })}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                            pt.active
                              ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                          }`}
                          title={pt.active ? 'Pausar compromisso' : 'Ativar compromisso'}
                          id={`toggle-active-${pt.id}`}
                        >
                          {pt.active ? 'Ativo' : 'Pausado'}
                        </button>

                        {/* Edit button */}
                        <button
                          onClick={() => handleStartEditCommitment(pt)}
                          className="w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle flex items-center justify-center transition cursor-pointer"
                          title="Editar compromisso"
                          id={`edit-commitment-${pt.id}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={() => deleteProtectedTime(pt.id)}
                          className="w-7 h-7 rounded-lg text-text-muted hover:text-state-error hover:bg-state-error-soft flex items-center justify-center transition cursor-pointer"
                          title="Excluir compromisso"
                          id={`delete-commitment-${pt.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
