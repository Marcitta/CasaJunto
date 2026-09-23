import React, { useState } from 'react';
import { Users, Plus, Shield, ShieldCheck, Flame, Trophy, CheckCircle, User, Calendar, Clock, UserX, RotateCcw, AlertCircle, KeyRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { UserRole, Member } from '../types';
import { getActiveMembers, getDeactivatedMembers, getActiveAdmins } from '../domain/selectors';
import { InviteMemberModal } from './Family/InviteMemberModal';

export const FamilyView: React.FC = () => {
  const { 
    members, 
    addMember, 
    updateMemberRole, 
    deactivateMember,
    reactivateMember,
    family, 
    openMemberProfile, 
    protectedTimes,
    tasks 
  } = useApp();
  const { currentUser, currentMembership, isDemoMode } = useAuth();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'DEACTIVATED'>('ACTIVE');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('MEMBER');
  const [isAdding, setIsAdding] = useState(false);
  const [deactivatingMember, setDeactivatingMember] = useState<Member | null>(null);
  const [invitingMember, setInvitingMember] = useState<Member | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentMember = members.find(m => m.user_id === currentUser?.id || m.id === currentUser?.id);
  const isAdmin = Boolean(
    isDemoMode || 
    currentMembership?.role === 'ADMIN' || 
    currentMember?.role === 'ADMIN' || 
    (currentUser && family?.ownerUserId === currentUser.id)
  );

  const activeMembers = getActiveMembers(members);
  const deactivatedMembers = getDeactivatedMembers(members);
  const activeAdminCount = getActiveAdmins(members).length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    addMember({
      name: newMemberName.trim(),
      role: newMemberRole,
      avatar: newMemberRole === 'ADMIN' ? '👑' : '👤',
      color: '#5b32a3',
      autonomy_level: 3,
      active: true
    });
    setNewMemberName('');
    setIsAdding(false);
    setStatusMessage({ type: 'success', text: `Morador "${newMemberName.trim()}" adicionado com sucesso!` });
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingMember) return;
    const res = await deactivateMember(deactivatingMember.id);
    if (res.success) {
      setStatusMessage({ type: 'success', text: `Morador "${deactivatingMember.name}" desativado. Tarefas pendentes voltaram a ficar disponíveis.` });
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Erro ao desativar morador.' });
    }
    setDeactivatingMember(null);
  };

  const handleReactivate = async (member: Member) => {
    const res = await reactivateMember(member.id);
    if (res.success) {
      setStatusMessage({ type: 'success', text: `Morador "${member.name}" reativado com sucesso!` });
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Erro ao reativar morador.' });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-text-primary">Moradores de {family.name}</h3>
          <p className="text-xs text-text-secondary">
            Gerencie quem faz parte do lar, perfis individuais e horários protegidos ({activeAdminCount}/2 administradores)
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-3.5 py-1.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Convidar Morador</span>
          </button>
        )}
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in ${
          statusMessage.type === 'success'
            ? 'bg-state-success-soft border-state-success/30 text-state-success'
            : 'bg-state-error-soft border-state-error/30 text-state-error'
        }`}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-text-muted hover:text-text-primary ml-2 cursor-pointer">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'ACTIVE'
              ? 'bg-brand-primary text-text-on-primary shadow-2xs'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
          }`}
        >
          Moradores Ativos ({activeMembers.length})
        </button>
        <button
          onClick={() => setActiveTab('DEACTIVATED')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'DEACTIVATED'
              ? 'bg-brand-primary text-text-on-primary shadow-2xs'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
          }`}
        >
          Desativados ({deactivatedMembers.length})
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="p-4 rounded-2xl bg-surface-card border border-brand-primary/30 shadow-xs space-y-3">
          <h4 className="text-xs font-bold text-text-primary">Adicionar Novo Membro</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={newMemberName}
              onChange={e => setNewMemberName(e.target.value)}
              placeholder="Nome do morador"
              className="px-3 py-1.5 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-card"
            />
            <select
              value={newMemberRole}
              onChange={e => setNewMemberRole(e.target.value as UserRole)}
              className="px-3 py-1.5 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-card"
            >
              <option value="MEMBER">Morador</option>
              <option value="ADMIN" disabled={activeAdminCount >= 2}>Administrador (Máx 2)</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-1.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold cursor-pointer"
              >
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-text-muted hover:bg-surface-subtle cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Member Cards */}
      {activeTab === 'ACTIVE' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeMembers.map(m => {
            const memberScheduleCount = protectedTimes.filter(pt => pt.member_id === m.id && pt.active).length;
            const isLastAdmin = m.role === 'ADMIN' && activeAdminCount <= 1;

            return (
              <div 
                key={m.id} 
                className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs flex flex-col justify-between gap-4 hover:border-brand-primary/40 transition"
                id={`member-card-${m.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div 
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => openMemberProfile(m)}
                    title="Clique para editar o perfil"
                  >
                    <div 
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-2xs group-hover:scale-105 transition shrink-0"
                      style={{ backgroundColor: `${m.color || '#5b32a3'}20`, color: m.color || '#5b32a3' }}
                    >
                      {m.avatar || '👤'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-text-primary group-hover:text-brand-primary transition">
                          {m.name}
                        </h4>
                        {m.role === 'ADMIN' ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-extrabold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-amber-600" />
                            Admin
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-text-secondary text-[10px] font-semibold">
                            Morador
                          </span>
                        )}
                        {Boolean(m.userId || m.user_id) ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[9px] font-bold flex items-center gap-0.5" title="Conta de acesso vinculada">
                            <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                            Conectado
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md bg-surface-subtle text-text-muted text-[9px] font-medium" title="Ainda não possui conta de acesso própria">
                            Sem conta
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
                        <span>{m.age ? `${m.age} anos` : 'Idade não def.'}</span>
                        <span>•</span>
                        <span>Nível {m.autonomy_level || 3}</span>
                        {memberScheduleCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5 text-brand-primary font-semibold">
                              <Clock className="w-3 h-3" />
                              {memberScheduleCount} {memberScheduleCount === 1 ? 'bloqueio' : 'bloqueios'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAdmin && !m.userId && !m.user_id && (
                      <button
                        onClick={() => setInvitingMember(m)}
                        className="px-2.5 py-1 rounded-xl bg-brand-primary-soft hover:bg-brand-primary-soft/80 text-[11px] font-bold text-brand-primary flex items-center gap-1 transition cursor-pointer"
                        title="Gerar código de convite para este morador"
                        id={`btn-invite-member-${m.id}`}
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Convidar</span>
                      </button>
                    )}
                    <button
                      onClick={() => openMemberProfile(m)}
                      className="px-2.5 py-1 rounded-xl bg-surface-subtle hover:bg-surface-subtle/80 text-[11px] font-bold text-text-secondary flex items-center gap-1 transition cursor-pointer"
                      title="Abrir perfil e agenda"
                      id={`btn-open-profile-${m.id}`}
                    >
                      <User className="w-3 h-3" />
                      <span>Perfil</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border-default text-[11px]">
                  <div className="flex items-center gap-3 text-text-muted">
                    <span className="flex items-center gap-1 font-semibold text-brand-primary">
                      <Trophy className="w-3 h-3 text-brand-accent" />
                      {m.points || 0} pts
                    </span>
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-brand-secondary" />
                      {m.streak || 0} dias
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <>
                        {m.role === 'ADMIN' ? (
                          <button
                            onClick={() => updateMemberRole(m.id, 'MEMBER')}
                            disabled={isLastAdmin}
                            className="px-2 py-0.5 rounded-lg border border-border-default text-[10px] text-text-muted hover:text-text-primary disabled:opacity-40 cursor-pointer"
                            title={isLastAdmin ? 'A casa precisa ter no mínimo 1 administrador.' : 'Tornar Morador'}
                          >
                            Rebaixar
                          </button>
                        ) : (
                          <button
                            onClick={() => updateMemberRole(m.id, 'ADMIN')}
                            disabled={activeAdminCount >= 2}
                            className="px-2 py-0.5 rounded-lg bg-brand-primary-soft hover:bg-brand-primary-soft/80 text-[10px] font-bold text-brand-primary disabled:opacity-40 cursor-pointer"
                            title={activeAdminCount >= 2 ? 'A casa já atingiu o limite de 2 administradores.' : 'Promover a Administrador'}
                          >
                            Tornar Admin
                          </button>
                        )}

                        <button
                          onClick={() => setDeactivatingMember(m)}
                          disabled={isLastAdmin}
                          className="p-1 rounded-lg text-text-muted hover:text-state-error hover:bg-state-error-soft disabled:opacity-30 transition cursor-pointer"
                          title={isLastAdmin ? 'Não é possível desativar o único administrador da casa.' : 'Desativar morador da casa'}
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DEACTIVATED TAB */
        deactivatedMembers.length === 0 ? (
          <div className="py-12 px-6 rounded-3xl bg-surface-card border border-border-default text-center max-w-lg mx-auto space-y-2">
            <UserX className="w-10 h-10 text-text-muted mx-auto opacity-50" />
            <h4 className="text-sm font-bold text-text-primary">Nenhum morador desativado</h4>
            <p className="text-xs text-text-secondary">
              Moradores desativados preservam histórico e pontos, mas deixam de receber tarefas do motor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {deactivatedMembers.map(m => (
              <div 
                key={m.id} 
                className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs opacity-80 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl grayscale opacity-70"
                      style={{ backgroundColor: `${m.color || '#5b32a3'}20`, color: m.color || '#5b32a3' }}
                    >
                      {m.avatar || '👤'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-text-primary line-through opacity-75">
                          {m.name}
                        </h4>
                        <span className="px-2 py-0.5 rounded-md bg-state-error-soft text-state-error text-[10px] font-bold">
                          Desativado
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">Histórico e pontuação mantidos</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border-default text-[11px]">
                  <div className="flex items-center gap-3 text-text-muted">
                    <span className="flex items-center gap-1 font-semibold text-text-secondary">
                      <Trophy className="w-3 h-3 text-brand-accent opacity-60" />
                      {m.points || 0} pts
                    </span>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => handleReactivate(m)}
                      className="px-3 py-1 rounded-xl bg-brand-primary-soft hover:bg-brand-primary-soft/80 text-brand-primary text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Reativar morador"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reativar</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* STAB-003: Member Deactivation Confirmation Modal */}
      {deactivatingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-xl border border-border-default space-y-4">
            <div className="flex items-center gap-3 text-state-error">
              <div className="w-10 h-10 rounded-xl bg-state-error-soft flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-state-error" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">Desativar Morador?</h3>
                <p className="text-xs text-text-secondary">{deactivatingMember.name}</p>
              </div>
            </div>

            <div className="text-xs text-text-secondary space-y-2 bg-surface-subtle p-3.5 rounded-xl border border-border-default">
              <p className="font-semibold text-text-primary">
                Ao desativar este morador:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-text-secondary">
                <li>
                  <strong className="text-text-primary">Histórico 100% preservado:</strong> Todas as tarefas concluídas anteriormente por ele(a) permanecerão no histórico com sua pontuação e registro intactos.
                </li>
                <li>
                  <strong className="text-text-primary">Tarefas pendentes liberadas:</strong> As tarefas pendentes atualmente atribuídas a {deactivatingMember.name} ({tasks.filter(t => (t.assignedMemberId === deactivatingMember.id || t.assigneeId === deactivatingMember.id) && t.status !== 'DONE' && (t.status as string) !== 'COMPLETED').length}) voltarão a ficar &quot;Disponíveis&quot; sem criar duplicatas.
                </li>
                <li>
                  <strong className="text-text-primary">Excluído de novas distribuições:</strong> O Motor 2.0 não atribuirá mais tarefas a ele(a).
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeactivatingMember(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-state-error text-white hover:opacity-90 shadow-xs transition cursor-pointer"
              >
                Confirmar Desativação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={Boolean(invitingMember)}
        onClose={() => setInvitingMember(null)}
        member={invitingMember}
        familyId={family?.id || ''}
        adminMemberId={currentMember?.id || 'admin'}
      />
    </div>
  );
};

