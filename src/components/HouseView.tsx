import React, { useState } from 'react';
import { 
  Plus, 
  Archive, 
  RotateCcw, 
  Pencil, 
  Layers, 
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Room } from '../types';
import { 
  ROOM_TYPE_LABELS, 
  QUICK_ADD_SUGGESTIONS, 
  SafeRoomIcon, 
  CanonicalRoomType,
  ROOM_TYPE_OPTIONS 
} from '../data/roomTypes';
import { RoomFormModal } from './RoomFormModal';

export const HouseView: React.FC = () => {
  const { 
    rooms, 
    tasks, 
    familyTasks,
    addRoom, 
    updateRoom, 
    deactivateRoom, 
    reactivateRoom, 
    family,
    members 
  } = useApp();
  const { currentUser, currentMembership, isDemoMode } = useAuth();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [prefillData, setPrefillData] = useState<{ name: string; type: string; icon?: string; color?: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deactivatingRoom, setDeactivatingRoom] = useState<Room | null>(null);

  // RBAC check: Admin can manage rooms, Members have read-only view
  const currentMember = members.find(m => m.user_id === currentUser?.id || m.id === currentUser?.id);
  const isAdmin = Boolean(
    isDemoMode || 
    currentMembership?.role === 'ADMIN' || 
    currentMember?.role === 'ADMIN' || 
    (currentUser && family?.ownerUserId === currentUser.id)
  );

  const activeRooms = rooms.filter(r => r.active !== false);
  const archivedRooms = rooms.filter(r => r.active === false);

  const handleOpenCreateModal = () => {
    setEditingRoom(null);
    setPrefillData(null);
    setModalMode('CREATE');
    setIsModalOpen(true);
  };

  const handleQuickAddClick = (suggestion: { name: string; type: CanonicalRoomType }) => {
    const opt = ROOM_TYPE_OPTIONS.find(o => o.key === suggestion.type);
    setEditingRoom(null);
    setPrefillData({
      name: suggestion.name,
      type: suggestion.type,
      icon: opt?.icon || 'Home',
      color: opt?.defaultColor || '#5b32a3'
    });
    setModalMode('CREATE');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (room: Room) => {
    setEditingRoom(room);
    setPrefillData(null);
    setModalMode('EDIT');
    setIsModalOpen(true);
  };

  const handleSaveModal = async (data: { name: string; type: string; icon?: string; color?: string }) => {
    try {
      if (modalMode === 'CREATE') {
        await addRoom(data);
        setStatusMessage({ type: 'success', text: `Ambiente "${data.name}" criado com sucesso!` });
      } else if (editingRoom) {
        await updateRoom(editingRoom.id, data);
        setStatusMessage({ type: 'success', text: `Ambiente "${data.name}" atualizado!` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao processar ambiente.' });
      throw err;
    }
  };

  const handleDeactivate = async (roomId: string, roomName: string) => {
    try {
      await deactivateRoom(roomId);
      setStatusMessage({ type: 'success', text: `Ambiente "${roomName}" arquivado com sucesso.` });
      setDeactivatingRoom(null);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao arquivar ambiente.' });
    }
  };

  const promptDeactivate = (room: Room) => {
    const linkedPending = tasks.filter(t => t.roomId === room.id && t.status !== 'DONE' && (t.status as string) !== 'COMPLETED').length;
    const linkedRoutines = familyTasks.filter(ft => (ft.roomId === room.id || (ft as any).room_id === room.id) && ft.active !== false).length;

    if (linkedPending > 0 || linkedRoutines > 0) {
      setDeactivatingRoom(room);
    } else {
      handleDeactivate(room.id, room.name);
    }
  };

  const handleReactivate = async (roomId: string, roomName: string) => {
    try {
      await reactivateRoom(roomId);
      setStatusMessage({ type: 'success', text: `Ambiente "${roomName}" restaurado aos ativos!` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao restaurar ambiente.' });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-text-primary tracking-tight">Ambientes do Lar</h2>
          <p className="text-xs text-text-secondary">Divisão física dos cômodos para mapeamento e distribuição de tarefas</p>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Novo Ambiente</span>
          </button>
        )}
      </div>

      {/* Feedback Toast Banner */}
      {statusMessage && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold animate-in fade-in duration-200 ${
          statusMessage.type === 'success' 
            ? 'bg-state-success-soft border-state-success/30 text-state-success' 
            : 'bg-state-error-soft border-state-error/30 text-state-error'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-state-success" />
            ) : (
              <AlertCircle className="w-4 h-4 text-state-error" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-[11px] underline cursor-pointer opacity-80 hover:opacity-100"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Navigation Tabs (Ativos / Arquivados) */}
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'ACTIVE'
              ? 'bg-brand-primary text-text-on-primary shadow-2xs'
              : 'text-text-secondary hover:bg-surface-subtle hover:text-text-primary'
          }`}
        >
          <span>Ativos</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
            activeTab === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-surface-subtle text-brand-primary'
          }`}>
            {activeRooms.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ARCHIVED')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'ARCHIVED'
              ? 'bg-brand-primary text-text-on-primary shadow-2xs'
              : 'text-text-secondary hover:bg-surface-subtle hover:text-text-primary'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Arquivados</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
            activeTab === 'ARCHIVED' ? 'bg-white/20 text-white' : 'bg-surface-subtle text-brand-primary'
          }`}>
            {archivedRooms.length}
          </span>
        </button>
      </div>

      {/* View Content: Active vs Archived */}
      {activeTab === 'ACTIVE' ? (
        activeRooms.length === 0 ? (
          /* EMPTY STATE (activeRooms = 0) */
          <div className="py-12 px-6 rounded-3xl bg-surface-card border border-border-default text-center max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary-soft text-brand-primary flex items-center justify-center mx-auto shadow-xs">
              <Layers className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-extrabold text-text-primary">
                Configure os ambientes da sua casa
              </h3>
              <p className="text-xs text-text-secondary max-w-md mx-auto leading-relaxed">
                Cadastre os cômodos para organizar tarefas e rotinas de forma mais inteligente. 
                Cada ambiente terá seu próprio mapeamento e histórico.
              </p>
            </div>

            {isAdmin ? (
              <div className="space-y-4 pt-2">
                <button
                  onClick={handleOpenCreateModal}
                  className="px-6 py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary text-xs font-bold shadow-xs transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Adicionar Primeiro Ambiente</span>
                </button>

                {/* Quick Add Suggestions (Pre-fill without saving) */}
                <div className="pt-3 border-t border-border-default">
                  <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2.5">
                    Sugestões rápidas para preenchimento
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {QUICK_ADD_SUGGESTIONS.map(s => (
                      <button
                        key={s.type}
                        onClick={() => handleQuickAddClick(s)}
                        className="px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-brand-primary-soft border border-border-default text-xs font-semibold text-brand-primary transition cursor-pointer"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted italic">
                Apenas administradores da família podem cadastrar novos cômodos.
              </p>
            )}
          </div>
        ) : (
          /* ACTIVE ROOMS GRID */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {activeRooms.map(room => {
              const roomTasks = tasks.filter(t => t.roomId === room.id);
              const pending = roomTasks.filter(t => t.status === 'PENDING').length;
              const typeLabel = (room.type && (ROOM_TYPE_LABELS as any)[room.type]) || room.type || 'Geral';
              const cardColor = room.color || '#5b32a3';

              return (
                <div 
                  key={room.id} 
                  className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: `${cardColor}20`, color: cardColor }}
                      >
                        <SafeRoomIcon iconName={room.icon} roomType={room.type} className="w-5 h-5" />
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary text-[11px] font-extrabold">
                        {pending} {pending === 1 ? 'pendente' : 'pendentes'}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-text-primary mb-0.5 truncate" title={room.name}>
                      {room.name}
                    </h4>
                    <p className="text-[11px] font-medium text-text-secondary mb-2">{typeLabel}</p>
                    <p className="text-xs text-text-muted">
                      {roomTasks.length} {roomTasks.length === 1 ? 'tarefa vinculada' : 'tarefas vinculadas'}
                    </p>
                  </div>

                  {/* Admin Controls */}
                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-border-default flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(room)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
                        title="Editar ambiente"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => promptDeactivate(room)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-state-warning hover:bg-state-warning-soft transition cursor-pointer"
                        title="Arquivar ambiente"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ARCHIVED TAB */
        archivedRooms.length === 0 ? (
          <div className="py-12 px-6 rounded-3xl bg-surface-card border border-border-default text-center max-w-lg mx-auto space-y-3">
            <Archive className="w-10 h-10 text-text-muted mx-auto opacity-50" />
            <h3 className="text-sm font-bold text-text-primary">Nenhum ambiente arquivado</h3>
            <p className="text-xs text-text-secondary">
              Quando você arquiva um ambiente, ele é mantido aqui para preservação de histórico sem poluir a lista principal.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {archivedRooms.map(room => {
              const roomTasks = tasks.filter(t => t.roomId === room.id);
              const typeLabel = (room.type && (ROOM_TYPE_LABELS as any)[room.type]) || room.type || 'Geral';

              return (
                <div 
                  key={room.id} 
                  className="p-5 rounded-2xl bg-surface-subtle border border-border-default opacity-75 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-surface-card text-text-muted flex items-center justify-center border border-border-default">
                        <SafeRoomIcon iconName={room.icon} roomType={room.type} className="w-5 h-5" />
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-surface-card text-text-muted text-[10px] font-bold border border-border-default">
                        Arquivado
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-text-primary mb-0.5 truncate" title={room.name}>
                      {room.name}
                    </h4>
                    <p className="text-[11px] font-medium text-text-secondary mb-2">{typeLabel}</p>
                    <p className="text-xs text-text-muted">
                      {roomTasks.length} tarefas associadas preservadas
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-border-default flex items-center justify-between">
                      <span className="text-[11px] text-text-muted">Histórico mantido</span>
                      <button
                        onClick={() => handleReactivate(room.id, room.name)}
                        className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-default hover:bg-surface-subtle text-brand-primary text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        title="Restaurar este ambiente para a lista de ativos"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restaurar</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* STAB-002: Room Deactivation Confirmation Modal */}
      {deactivatingRoom && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface-card rounded-2xl max-w-md w-full p-6 shadow-xl border border-border-default space-y-4">
            <div className="flex items-center gap-3 text-state-warning">
              <div className="w-10 h-10 rounded-xl bg-state-warning-soft flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-state-warning" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">Arquivar Ambiente?</h3>
                <p className="text-xs text-text-secondary">{deactivatingRoom.name}</p>
              </div>
            </div>

            <div className="text-xs text-text-secondary space-y-2 bg-surface-subtle p-3 rounded-xl border border-border-default">
              <p>
                Este ambiente possui tarefas ou rotinas ativas associadas:
              </p>
              <ul className="list-disc pl-4 space-y-1 font-medium text-text-primary">
                <li>
                  {tasks.filter(t => t.roomId === deactivatingRoom.id && t.status !== 'DONE' && (t.status as string) !== 'COMPLETED').length} tarefa(s) pendente(s)
                </li>
                <li>
                  {familyTasks.filter(ft => (ft.roomId === deactivatingRoom.id || (ft as any).room_id === deactivatingRoom.id) && ft.active !== false).length} rotina(s) ativa(s)
                </li>
              </ul>
              <div className="mt-2 text-[11px] text-text-muted">
                <p>✓ Tarefas concluídas permanecerão intactas no histórico com pontos e autoria preservados.</p>
                <p>✓ As rotinas ativas deste cômodo serão desativadas.</p>
                <p>✓ O cômodo não aparecerá em novos cadastros.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeactivatingRoom(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeactivate(deactivatingRoom.id, deactivatingRoom.name)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-state-warning text-white hover:opacity-90 shadow-xs transition cursor-pointer"
              >
                Confirmar Arquivamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Modal (Create / Edit) */}
      <RoomFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveModal}
        initialData={editingRoom}
        prefillData={prefillData}
        mode={modalMode}
      />
    </div>
  );
};
