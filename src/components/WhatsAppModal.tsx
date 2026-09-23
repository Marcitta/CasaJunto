import React, { useState } from 'react';
import { X, Send, Copy, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose }) => {
  const { family, tasks } = useApp();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const pending = tasks.filter(t => t.status === 'PENDING');
  const messageText = `🏠 *Resumo do Dia - ${family.name}*\n\n${pending.map(t => `• ${t.title} (${t.roomName || 'Geral'}) - Resp: ${t.assigneeName || 'Alguém'}`).join('\n')}\n\nBora deixar a casa limpa juntos! 💪`;

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">Compartilhar no WhatsApp</h3>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary cursor-pointer transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-subtle text-xs font-mono whitespace-pre-wrap text-text-primary max-h-48 overflow-y-auto border border-border-default">
          {messageText}
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-text-secondary hover:bg-surface-subtle cursor-pointer transition"
          >
            Fechar
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center gap-1.5 cursor-pointer transition"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copiado!' : 'Copiar Mensagem'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
