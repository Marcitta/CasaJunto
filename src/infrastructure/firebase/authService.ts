export class AuthService {
  static formatAuthError(error: any): { code: string; message: string } {
    const code = error?.code || 'auth/unknown';

    switch (code) {
      case 'auth/email-already-in-use':
        return {
          code,
          message: 'Este e-mail já está cadastrado no sistema. Faça login com sua senha ou solicite a recuperação.'
        };
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return {
          code,
          message: 'E-mail ou senha incorretos. Verifique suas credenciais.'
        };
      case 'auth/operation-not-allowed':
        return {
          code,
          message: 'O provedor de autenticação (E-mail/Senha) não está habilitado nas configurações do Firebase. Habilite-o no console do Firebase.'
        };
      case 'auth/too-many-requests':
        return {
          code,
          message: 'Muitas tentativas malsucedidas. O acesso foi temporariamente bloqueado. Tente mais tarde.'
        };
      case 'auth/weak-password':
        return {
          code,
          message: 'A senha deve ter pelo menos 6 caracteres.'
        };
      case 'auth/invalid-email':
        return {
          code,
          message: 'O formato do e-mail inserido é inválido.'
        };
      case 'auth/popup-closed-by-user':
        return {
          code,
          message: 'A janela de autenticação foi fechada antes de concluir.'
        };
      case 'auth/configuration-not-found':
      case 'auth/api-key-not-valid':
        return {
          code,
          message: 'Não foi possível conectar ao serviço de autenticação. Verifique a configuração do ambiente.'
        };
      default:
        return {
          code,
          message: error?.message || 'Ocorreu um erro ao autenticar. Tente novamente.'
        };
    }
  }
}
