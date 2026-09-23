import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut as fbSignOut, 
  sendPasswordResetEmail,
  updateProfile,
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from '../infrastructure/firebase/firebaseConfig';
import { AuthService } from '../infrastructure/firebase/authService';
import { Family, FamilyMembership, Member, AuthUser } from '../types';
import { DEMO_FAMILY } from '../data/mockData';

export interface AuthContextType {
  currentUser: AuthUser | null;
  currentFamily: Family | null;
  currentMembership: FamilyMembership | null;
  activeMemberships: FamilyMembership[];
  isAuthLoading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  selectFamily: (familyId: string) => void;
  createFamily: (name: string, adminName?: string) => Promise<Family>;
  createNewFamily: (familyName: string, adminName: string) => Promise<Family>;
  refreshUserMemberships?: () => Promise<void>;
  familyLoadError?: string | null;
  clearFamilyLoadError?: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
  const [currentMembership, setCurrentMembership] = useState<FamilyMembership | null>(null);
  const [activeMemberships, setActiveMemberships] = useState<FamilyMembership[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [familyLoadError, setFamilyLoadError] = useState<string | null>(null);

  // Monitor Firebase Auth state
  useEffect(() => {
    // If Firebase is not configured, remain UNAUTHENTICATED
    if (!isFirebaseConfigured) {
      setCurrentUser(null);
      setCurrentFamily(null);
      setCurrentMembership(null);
      setActiveMemberships([]);
      setIsAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      setIsAuthLoading(true);
      if (firebaseUser) {
        const userObj: AuthUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário'
        };
        setCurrentUser(userObj);
        setIsDemoMode(false);

        await fetchUserMemberships(firebaseUser.uid);
      } else {
        setCurrentUser(null);
        setCurrentFamily(null);
        setCurrentMembership(null);
        setActiveMemberships([]);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchUserMemberships = async (userId: string) => {
    setFamilyLoadError(null);
    try {
      const membershipsRef = collection(db, 'familyMemberships');
      const q = query(
        membershipsRef, 
        where('userId', '==', userId),
        where('status', '==', 'ACTIVE')
      );
      const snap = await getDocs(q);
      const list: FamilyMembership[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as FamilyMembership);
      });

      // Fallback determinístico caso a query de coleção retorne vazia, mas haja chave de família salva
      const savedKey = `casajunto_last_family_${userId}`;
      const savedFamilyId = localStorage.getItem(savedKey);
      if (list.length === 0 && savedFamilyId) {
        try {
          const directMemSnap = await getDoc(doc(db, 'familyMemberships', `${savedFamilyId}_${userId}`));
          if (directMemSnap.exists()) {
            const directMemData = { id: directMemSnap.id, ...directMemSnap.data() } as FamilyMembership;
            if (directMemData.status === 'ACTIVE') {
              list.push(directMemData);
            }
          }
        } catch (directErr) {
          console.warn('Fallback direct membership check warning:', directErr);
        }
      }

      setActiveMemberships(list);

      if (list.length > 0) {
        const chosenMem = (savedFamilyId && list.find(m => m.familyId === savedFamilyId)) || list[0];
        
        setCurrentMembership(chosenMem);
        
        // Fetch family document
        const famSnap = await getDoc(doc(db, 'families', chosenMem.familyId));
        if (famSnap.exists()) {
          setCurrentFamily({ id: famSnap.id, ...famSnap.data() } as Family);
        } else {
          setCurrentFamily({
            id: chosenMem.familyId,
            name: chosenMem.familyName || 'Meu Lar',
            ownerUserId: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        setCurrentMembership(null);
        setCurrentFamily(null);
      }
    } catch (err: any) {
      console.warn('Firestore technical error in fetchUserMemberships:', err);
      const errMsg = err?.message || String(err);
      if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted') || err?.code === 'resource-exhausted') {
        setFamilyLoadError('Limite de cota diária de leitura do Firestore atingido (Quota limit exceeded). Não conseguimos carregar sua casa no momento. Seus dados não foram alterados por esta tentativa.');
      } else if (err?.code === 'permission-denied') {
        setFamilyLoadError('Permissão negada ao acessar os dados da família. Tente fazer login novamente.');
      } else {
        setFamilyLoadError(errMsg);
      }
      setActiveMemberships([]);
      setCurrentMembership(null);
      setCurrentFamily(null);
    }
  };

  const refreshUserMemberships = async () => {
    const targetUid = currentUser?.id || auth.currentUser?.uid;
    if (targetUid) {
      await fetchUserMemberships(targetUid);
    }
  };

  const signIn = async (email: string, pass: string) => {
    if (!isFirebaseConfigured) {
      throw {
        code: 'auth/configuration-not-found',
        message: 'Não foi possível conectar ao serviço de autenticação. Verifique a configuração do ambiente.'
      };
    }

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      throw AuthService.formatAuthError(err);
    }
  };

  const signUp = async (email: string, pass: string, name: string) => {
    if (!isFirebaseConfigured) {
      throw {
        code: 'auth/configuration-not-found',
        message: 'Não foi possível conectar ao serviço de autenticação. Verifique a configuração do ambiente.'
      };
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (cred.user) {
        if (name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
        }
        // Ensure /users/{uid} document exists in Firestore
        try {
          await setDoc(doc(db, 'users', cred.user.uid), {
            id: cred.user.uid,
            email: cred.user.email,
            displayName: name.trim() || cred.user.email?.split('@')[0] || 'Usuário',
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (userDocErr) {
          console.warn('Could not write /users/{uid} document:', userDocErr);
        }
      }
    } catch (err: any) {
      throw AuthService.formatAuthError(err);
    }
  };

  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured) {
      throw {
        code: 'auth/configuration-not-found',
        message: 'Não foi possível conectar ao serviço de autenticação. Verifique a configuração do ambiente.'
      };
    }

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        try {
          await setDoc(doc(db, 'users', cred.user.uid), {
            id: cred.user.uid,
            email: cred.user.email,
            displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'Usuário',
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (userDocErr) {
          console.warn('Could not write /users/{uid} document on Google signin:', userDocErr);
        }
      }
    } catch (err: any) {
      throw AuthService.formatAuthError(err);
    }
  };

  const resetPassword = async (email: string) => {
    if (!isFirebaseConfigured) {
      throw {
        code: 'auth/configuration-not-found',
        message: 'Não foi possível conectar ao serviço de autenticação. Verifique a configuração do ambiente.'
      };
    }

    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      throw AuthService.formatAuthError(err);
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('Error signing out:', err);
    }
    setCurrentUser(null);
    setCurrentFamily(null);
    setCurrentMembership(null);
    setActiveMemberships([]);
    setIsDemoMode(false);
    setFamilyLoadError(null);
  };

  const enterDemoMode = () => {
    setIsDemoMode(true);
    setCurrentFamily(DEMO_FAMILY);
    setFamilyLoadError(null);
  };

  const exitDemoMode = () => {
    setIsDemoMode(false);
    setCurrentFamily(null);
  };

  const selectFamily = async (familyId: string) => {
    const mem = activeMemberships.find(m => m.familyId === familyId);
    if (!mem) return;
    
    setCurrentMembership(mem);
    if (currentUser) {
      localStorage.setItem(`casajunto_last_family_${currentUser.id}`, familyId);
    }
    try {
      const famSnap = await getDoc(doc(db, 'families', familyId));
      if (famSnap.exists()) {
        setCurrentFamily({ id: famSnap.id, ...famSnap.data() } as Family);
      } else {
        setCurrentFamily({
          id: mem.familyId,
          name: mem.familyName || 'Meu Lar',
          ownerUserId: currentUser?.id || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('Could not fetch family doc from Firestore:', err);
      setCurrentFamily({
        id: mem.familyId,
        name: mem.familyName || 'Meu Lar',
        ownerUserId: currentUser?.id || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  };

  const createNewFamily = async (familyName: string, adminName: string): Promise<Family> => {
    if (!currentUser) throw new Error('Usuário precisa estar autenticado para criar uma casa.');

    // MEMBER-RBAC-1A: Apenas ADMIN pode criar nova família se já possuir papel vinculado no contexto ativo
    if (currentMembership && currentMembership.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem criar uma nova casa.');
    }
    
    const trimmedFamilyName = familyName.trim();
    const trimmedAdminName = adminName.trim();
    if (!trimmedFamilyName) throw new Error('Nome da casa é obrigatório.');
    if (!trimmedAdminName) throw new Error('Seu nome é obrigatório.');

    const newFamilyId = `fam-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    
    const newFamily: Family = {
      id: newFamilyId,
      name: trimmedFamilyName,
      ownerUserId: currentUser.id,
      adminCount: 1,
      memberCount: 1,
      createdAt: now,
      updatedAt: now
    };

    // Item 11: /families/{familyId}/members/{memberId}
    const memberDocId = `mbr-${currentUser.id.slice(0, 8)}-${Date.now().toString(36)}`;

    // Item 11: /familyMemberships/{familyId}_{realFirebaseUid}
    const membershipDocId = `${newFamilyId}_${currentUser.id}`;
    const newMembership: FamilyMembership = {
      id: membershipDocId,
      familyId: newFamilyId,
      familyName: trimmedFamilyName,
      userId: currentUser.id,
      memberId: memberDocId,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };
    const newMemberRecord = {
      id: memberDocId,
      family_id: newFamilyId,
      user_id: currentUser.id,
      name: trimmedAdminName,
      email: currentUser.email,
      role: 'ADMIN',
      active: true,
      joined_at: now
    };

    // Atomic Bootstrap: writeBatch com Family, FamilyMembership e Member
    // Exigido por firestore.rules para satisfazer existsAfter e getAfter de forma síncrona/atômica
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', newFamilyId), newFamily);
    batch.set(doc(db, 'familyMemberships', membershipDocId), newMembership);
    batch.set(doc(db, 'families', newFamilyId, 'members', memberDocId), newMemberRecord);

    await batch.commit();

    if (auth.currentUser && (!currentUser.displayName || currentUser.displayName !== trimmedAdminName)) {
      try {
        await updateProfile(auth.currentUser, { displayName: trimmedAdminName });
      } catch (profileErr) {
        console.warn('Profile update warning:', profileErr);
      }
      setCurrentUser(prev => prev ? { ...prev, displayName: trimmedAdminName } : null);
    }

    // Atualização de estado local e persistência somente APÓS commit bem-sucedido no Firestore
    setActiveMemberships(prev => [...prev, newMembership]);
    setCurrentMembership(newMembership);
    setCurrentFamily(newFamily);
    localStorage.setItem(`casajunto_last_family_${currentUser.id}`, newFamilyId);

    return newFamily;
  };

  const createFamily = async (name: string, adminName?: string): Promise<Family> => {
    return createNewFamily(name, adminName || currentUser?.displayName || 'Administrador');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentFamily,
        currentMembership,
        activeMemberships,
        isAuthLoading,
        isDemoMode,
        signIn,
        signUp,
        signInWithGoogle,
        resetPassword,
        signOut,
        enterDemoMode,
        exitDemoMode,
        selectFamily,
        createFamily,
        createNewFamily,
        refreshUserMemberships,
        familyLoadError,
        clearFamilyLoadError: () => setFamilyLoadError(null)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
