/**
 * CasaJunto - Safe JSON & Circular Structure Guard
 * 
 * Protege a aplicação e o runtime contra erros de serialização circular (ex: objetos de transporte
 * WebChannel do Firestore 'Y2'/'Ka', eventos de navegador e referências cíclicas).
 */

export function installSafeJsonStringify(): void {
  if (typeof JSON === 'undefined' || typeof JSON.stringify !== 'function') {
    return;
  }

  const originalStringify = JSON.stringify;

  // Evita re-instalação se já estiver protegido
  if ((originalStringify as any).__safe_circular_guarded) {
    return;
  }

  const safeStringify = function (value: any, replacer?: any, space?: any): string {
    if (value === undefined) {
      return undefined as any;
    }

    const seen = new WeakSet();

    const safeReplacer = function (key: string, val: any) {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      if (typeof replacer === 'function') {
        return replacer(key, val);
      }
      return val;
    };

    try {
      if (Array.isArray(replacer)) {
        return originalStringify.call(JSON, value, replacer, space);
      }
      return originalStringify.call(
        JSON,
        value,
        replacer
          ? function (k: string, v: any) {
              if (typeof v === 'object' && v !== null) {
                if (seen.has(v)) return '[Circular]';
                seen.add(v);
              }
              return replacer(k, v);
            }
          : safeReplacer,
        space
      );
    } catch (err) {
      try {
        return originalStringify.call(JSON, value, safeReplacer, space);
      } catch (fallbackErr) {
        return '"[Unserializable]"';
      }
    }
  };

  (safeStringify as any).__safe_circular_guarded = true;
  JSON.stringify = safeStringify as any;
}

// Execução imediata no carregamento do módulo
installSafeJsonStringify();
