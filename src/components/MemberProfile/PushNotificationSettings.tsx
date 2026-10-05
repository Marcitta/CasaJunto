import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellOff, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Smartphone, 
  Share2,
  Info,
  ShieldCheck
} from 'lucide-react';
import { 
  PushActivationService, 
  PushNotificationState, 
  DeviceCapability 
} from '../../services/pushActivationService';
import { useAuth } from '../../context/AuthContext';

export interface PushNotificationSettingsProps {
  // Opcional para injeção de estado em testes
  initialState?: PushNotificationState;
}

export const PushNotificationSettings: React.FC<PushNotificationSettingsProps> = ({ initialState }) => {
  const { currentUser } = useAuth();
  const [state, setState] = useState<PushNotificationState>(initialState || 'DEFAULT');
  const [capability, setCapability] = useState<DeviceCapability>({
    isSupported: true,
    isConfigured: true,
    isIOS: false,
    isStandalone: false,
    canRequestPush: true,
    platform: 'WEB'
  });
  const [message, setMessage] = useState<string>('');
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(!initialState);

  useEffect(() => {
    if (initialState) return;

    const cap = PushActivationService.checkDeviceCapability();
    setCapability(cap);

    if (currentUser?.id) {
      PushActivationService.getCurrentState(currentUser.id)
        .then((currentState) => {
          setState(currentState);
        })
        .catch(() => {
          setState('DEFAULT');
        })
        .finally(() => {
          setIsLoadingInitial(false);
        });
    } else {
      setIsLoadingInitial(false);
    }
  }, [currentUser?.id, initialState]);

  const handleActivate = async () => {
    if (!currentUser?.id) return;

    setState('REQUESTING');
    setMessage('');

    try {
      const res = await PushActivationService.activatePushNotifications({
        userId: currentUser.id
      });
      setState(res.state);
      if (res.message) {
        setMessage(res.message);
      }
    } catch {
      setState('ERROR');
      setMessage('Ocorreu um problema inesperado ao configurar as notificações. Tente novamente mais tarde.');
    }
  };

  const handleDeactivate = async () => {
    if (!currentUser?.id) return;

    setState('REQUESTING');
    setMessage('');

    try {
      const res = await PushActivationService.deactivatePushNotifications({
        userId: currentUser.id
      });
      setState(res.state);
      if (res.message) {
        setMessage(res.message);
      }
    } catch {
      setState('ERROR');
      setMessage('Não foi possível desativar as notificações no momento.');
    }
  };

  if (isLoadingInitial) {
    return (
      <div className="py-8 flex flex-col items-center justify-center gap-2 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />
        <span className="text-xs">Verificando suporte a notificações...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4" id="push-notification-settings">
      {/* Header com identificação do dispositivo */}
      <div className="bg-surface-subtle p-4 rounded-2xl border border-border-default flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-brand-primary-soft text-brand-primary shrink-0 mt-0.5">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-extrabold text-text-primary uppercase tracking-wider">
              Notificações Push
            </h4>
            <span className="px-2 py-0.5 rounded-md bg-surface-card text-text-secondary text-[10px] font-bold border border-border-default">
              {capability.platform === 'IOS' ? 'Apple iOS' : capability.platform === 'ANDROID' ? 'Android' : 'Web / Desktop'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Receba lembretes das suas tarefas atribuídas diretamente neste dispositivo.
          </p>
        </div>
      </div>

      {/* Orientação especial para iPhone/iPad fora da Tela de Início */}
      {capability.isIOS && !capability.isStandalone && (
        <div 
          id="notification-ios-guidance"
          className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3"
        >
          <Share2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-950">
              Instalação necessária no iPhone / iPad
            </p>
            <p className="leading-relaxed text-amber-900">
              Para receber notificações no iPhone, adicione o CasaJunto à Tela de Início e abra o aplicativo por lá.
            </p>
            <p className="text-[11px] text-amber-800 pt-1">
              Toque no botão <span className="font-bold">Compartilhar</span> no Safari e selecione <span className="font-bold">"Adicionar à Tela de Início"</span>.
            </p>
          </div>
        </div>
      )}

      {/* Estado: NOT_SUPPORTED */}
      {state === 'NOT_SUPPORTED' && (
        <div 
          id="notification-state-not-supported"
          className="p-4 rounded-2xl bg-surface-subtle border border-border-default text-text-secondary flex items-start gap-3"
        >
          <Info className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-text-primary">Navegador incompatível</p>
            <p className="mt-0.5 text-text-muted">
              Este navegador não oferece suporte a notificações push.
            </p>
          </div>
        </div>
      )}

      {/* Estado: NOT_CONFIGURED */}
      {state === 'NOT_CONFIGURED' && (
        <div 
          id="notification-state-not-configured"
          className="p-4 rounded-2xl bg-surface-subtle border border-border-default text-text-secondary flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-text-primary">Serviço não configurado</p>
            <p className="mt-0.5 text-text-muted">
              As notificações push ainda não estão configuradas neste ambiente (chave VAPID ausente).
            </p>
          </div>
        </div>
      )}

      {/* Estado: DENIED */}
      {state === 'DENIED' && (
        <div 
          id="notification-state-denied"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3"
        >
          <BellOff className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-rose-950">Permissão bloqueada no navegador</p>
            <p className="text-rose-900 leading-relaxed">
              A permissão foi bloqueada pelo navegador e precisa ser reativada nas configurações do navegador ou do sistema operacional para que você possa receber alertas.
            </p>
          </div>
        </div>
      )}

      {/* Estado: ERROR */}
      {state === 'ERROR' && (
        <div 
          id="notification-state-error"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-rose-950">Aviso</p>
            <p className="text-rose-900 mt-0.5">
              {message || 'Não foi possível concluir a operação de notificações no momento. Tente novamente mais tarde.'}
            </p>
          </div>
        </div>
      )}

      {/* Estado: ACTIVE */}
      {state === 'ACTIVE' && (
        <div 
          id="notification-state-active"
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs flex-1">
              <p className="font-extrabold text-emerald-950">Notificações ativadas neste dispositivo</p>
              <p className="text-emerald-800 mt-0.5">
                Seu dispositivo está registrado para receber avisos de tarefas e rotinas da sua casa.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between">
            <span className="text-[11px] text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Dispositivo registrado
            </span>
            <button
              onClick={handleDeactivate}
              id="btn-deactivate-notifications"
              className="px-3 py-1.5 rounded-lg bg-surface-card hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer"
            >
              Desativar notificações neste dispositivo
            </button>
          </div>
        </div>
      )}

      {/* Estado: DEFAULT ou REQUESTING */}
      {(state === 'DEFAULT' || state === 'REQUESTING') && (!capability.isIOS || capability.isStandalone) && capability.isSupported && capability.isConfigured && (
        <div 
          id={state === 'REQUESTING' ? 'notification-state-requesting' : 'notification-state-default'}
          className="p-4 rounded-2xl bg-surface-card border border-border-default space-y-3"
        >
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-text-primary">Ativar lembretes no aparelho</p>
              <p className="text-text-muted mt-0.5 leading-relaxed">
                Clique abaixo para permitir que o CasaJunto envie alertas quando suas tarefas estiverem agendadas.
              </p>
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={handleActivate}
              disabled={state === 'REQUESTING'}
              id="btn-activate-notifications"
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-text-on-primary text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {state === 'REQUESTING' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Configurando notificações...</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  <span>Ativar notificações</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Informação adicional de segurança */}
      <p className="text-[11px] text-text-muted px-1">
        As notificações são configuradas individualmente por aparelho e vinculadas com segurança à sua conta.
      </p>
    </div>
  );
};
