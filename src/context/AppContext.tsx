import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  AppView, 
  Family, 
  Member, 
  Room, 
  Task, 
  UserRole, 
  ProtectedTime,
  MemberProfileUpdateData,
  FamilyTask,
  TaskAssignment,
  TaskFrequency,
  BatchAddRoutineInput,
  BatchAddResult,
  BatchDeactivateResult,
  ChaosSession,
  CompletionType
} from '../types';
import { ChaosSessionService } from '../services/chaosSessionService';
import { 
  DEMO_FAMILY, 
  DEMO_MEMBERS, 
  DEMO_PROTECTED_TIMES, 
  DEMO_ROOMS, 
  DEMO_TASKS, 
  getTodayDateString 
} from '../data/mockData';
import { demoFamilyTasks } from '../data/demoData';
import { useAuth } from './AuthContext';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db } from '../infrastructure/firebase/firebaseConfig';
import { calculateAgeFromBirthDate } from '../utils/dateUtils';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { DistributionService } from '../application/services/DistributionService';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { getFamilyLocalDate } from '../domain/utils/dateTimeUtils';
import { RebalanceResult, SafetyService } from '../domain/distribution';
import { allMasterTasks } from '../data/tasks';
import { isValidRoomType, ROOM_TYPE_OPTIONS } from '../data/roomTypes';
import { TaskCompletionService } from '../application/services/TaskCompletionService';
import { CustomTaskRepairService } from '../application/services/CustomTaskRepairService';
import { getDayOfWeek } from '../domain/utils/dateTimeUtils';
import { 
  getActiveMembers, 
  getActiveAdmins, 
  getDeactivatedMembers, 
  isMemberActive 
} from '../domain/selectors';

export interface TaskCompletionResult {
  success: boolean;
  code?: 'SUCCESS' | 'ALREADY_COMPLETED' | 'CONCURRENT_CLAIM_LOST' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'ERROR';
  error?: string;
  completionType?: CompletionType;
  assignedMemberId?: string;
}

export interface AppContextType {
  currentView: AppView;
  setCurrentView: (v: AppView) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  family: Family;
  members: Member[];
  activeMembers: Member[];
  getActiveMembers: (list?: Member[]) => Member[];
  rooms: Room[];
  tasks: Task[];
  protectedTimes: ProtectedTime[];
  isDemoMode: boolean;
  isOnboarding: boolean;
  setIsOnboarding: (b: boolean) => void;
  isDevSimulatorOpen: boolean;
  openDevSimulator: () => void;
  closeDevSimulator: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isCreateFamilyModalOpen: boolean;
  openCreateFamilyModal: () => void;
  closeCreateFamilyModal: () => void;
  isFamilySelectorOpen: boolean;
  openFamilySelector: () => void;
  closeFamilySelector: () => void;
  isMemberProfileModalOpen: boolean;
  activeMemberForProfile: Member | null;
  openMemberProfile: (member: Member) => void;
  closeMemberProfile: () => void;
  updateMemberProfile: (memberId: string, updates: MemberProfileUpdateData) => Promise<void>;
  loadProtectedTimes: (familyId: string) => Promise<void>;
  addProtectedTime: (timeData: Omit<ProtectedTime, 'id' | 'family_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateProtectedTime: (id: string, updates: Partial<ProtectedTime>) => Promise<void>;
  deleteProtectedTime: (id: string) => Promise<void>;
  loadRealRooms: () => Promise<void>;
  addRoom: (data: { name: string; type: string; icon?: string; color?: string }) => Promise<Room>;
  updateRoom: (roomId: string, updates: { name?: string; type?: string; icon?: string; color?: string }) => Promise<void>;
  deactivateRoom: (roomId: string) => Promise<void>;
  reactivateRoom: (roomId: string) => Promise<void>;
  cloudSyncStatus: 'synced' | 'saving' | 'offline' | 'demo';
  loadDemoFamily: () => void;
  currentMember: Member | null;
  completeTask: (taskId: string, memberId?: string) => Promise<boolean>;
  completeTaskDetailed?: (taskId: string, memberId?: string) => Promise<TaskCompletionResult>;
  addTask: (task: Partial<Task> & {
    frequency?: TaskFrequency | string;
    preferredDays?: number[];
    dayOfMonth?: number;
    durationMinutes?: number;
  }) => Promise<void> | void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  addMember: (member: Partial<Member>) => void;
  updateMemberRole: (memberId: string, role: UserRole) => void;
  removeMember: (memberId: string) => void;
  deactivateMember?: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  reactivateMember?: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  activeTaskForExecution: Task | null;
  setActiveTaskForExecution: (t: Task | null) => void;
  activeTaskForInspect: Task | null;
  setActiveTaskForInspect: (t: Task | null) => void;
  activeTaskForReschedule: Task | null;
  setActiveTaskForReschedule: (t: Task | null) => void;
  isBlitzModalOpen: boolean;
  setIsBlitzModalOpen: (b: boolean) => void;
  isChaosModalOpen?: boolean;
  setIsChaosModalOpen?: (b: boolean) => void;
  openChaosModal?: () => void;
  closeChaosModal?: () => void;
  isRebalanceModalOpen: boolean;
  setIsRebalanceModalOpen: (b: boolean) => void;
  rebalanceTasksWithEngine: () => Promise<RebalanceResult>;
  applyRebalanceUpdates: (taskUpdates: Record<string, Partial<Task>>) => Promise<void>;
  assignTaskManually: (
    taskId: string,
    newMemberId: string | null,
    options?: { confirmInProgress?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  familyTasks: FamilyTask[];
  syncRollingRoutines: () => Promise<void>;
  syncRoutineOccurrences?: (routinesOverride?: FamilyTask[]) => Promise<void>;
  addRoutine: (routine: Partial<FamilyTask>) => Promise<FamilyTask>;
  updateRoutine: (routineId: string, updates: Partial<FamilyTask>) => Promise<void>;
  deactivateRoutine: (routineId: string) => Promise<void>;
  reactivateRoutine: (routineId: string) => Promise<void>;
  batchAddRoutines: (items: BatchAddRoutineInput[]) => Promise<BatchAddResult>;
  batchDeactivateRoutines: (routineIds: string[]) => Promise<BatchDeactivateResult>;
  activeChaosSession?: ChaosSession | null;
  loadActiveChaosSession?: () => Promise<ChaosSession | null>;
  setActiveChaosSession?: React.Dispatch<React.SetStateAction<ChaosSession | null>>;
}

export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser: authUser, currentFamily: authFamily, currentMembership, isDemoMode: authDemoMode, enterDemoMode } = useAuth();

  const [currentView, setCurrentView] = useState<AppView>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  const isDemoMode = Boolean(authDemoMode);
  const activeFamilyIdRef = useRef<string>(authFamily?.id || '');

  const [family, setFamily] = useState<Family>(authFamily || (isDemoMode ? DEMO_FAMILY : {
    id: '',
    name: '',
    ownerUserId: '',
    createdAt: '',
    updatedAt: ''
  }));

  const getInitialMembers = () => {
    if (!isDemoMode) return [];
    return DEMO_MEMBERS.map(m => ({
      ...m,
      age: m.birth_date ? (calculateAgeFromBirthDate(m.birth_date) ?? (m.age || 18)) : (m.age || 18)
    }));
  };

  const [members, setMembers] = useState<Member[]>(getInitialMembers);
  const activeMembers = useMemo(() => getActiveMembers(members), [members]);
  const [rooms, setRooms] = useState<Room[]>(isDemoMode ? DEMO_ROOMS : []);
  const [tasks, setTasks] = useState<Task[]>(isDemoMode ? DEMO_TASKS : []);
  const [protectedTimes, setProtectedTimes] = useState<ProtectedTime[]>(isDemoMode ? DEMO_PROTECTED_TIMES : []);
  const [familyTasks, setFamilyTasks] = useState<FamilyTask[]>(isDemoMode ? demoFamilyTasks : []);

  const [isOnboarding, setIsOnboarding] = useState(false);
  const [isDevSimulatorOpen, setIsDevSimulatorOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCreateFamilyModalOpen, setIsCreateFamilyModalOpen] = useState(false);
  const [isFamilySelectorOpen, setIsFamilySelectorOpen] = useState(false);

  // Member Profile modal state
  const [isMemberProfileModalOpen, setIsMemberProfileModalOpen] = useState(false);
  const [activeMemberForProfile, setActiveMemberForProfile] = useState<Member | null>(null);

  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'saving' | 'offline' | 'demo'>(
    isDemoMode ? 'demo' : 'synced'
  );

  const [activeTaskForExecution, setActiveTaskForExecution] = useState<Task | null>(null);
  const [activeTaskForInspect, setActiveTaskForInspect] = useState<Task | null>(null);
  const [activeTaskForReschedule, setActiveTaskForReschedule] = useState<Task | null>(null);
  const [isChaosModalOpen, setIsChaosModalOpen] = useState(false);
  const isBlitzModalOpen = isChaosModalOpen;
  const setIsBlitzModalOpen = useCallback((b: boolean) => {
    setIsChaosModalOpen(b);
  }, []);
  const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
  const [activeChaosSession, setActiveChaosSession] = useState<ChaosSession | null>(null);

  const loadActiveChaosSession = async (): Promise<ChaosSession | null> => {
    if (isDemoMode) {
      return activeChaosSession || null;
    }
    if (!authFamily?.id) {
      setActiveChaosSession(null);
      return null;
    }
    try {
      const session = await ChaosSessionService.getActiveChaosSession(authFamily.id);
      setActiveChaosSession(session);
      return session;
    } catch (err) {
      console.warn('[AppContext] Falha ao carregar sessão ativa do Modo Caos:', err);
      setActiveChaosSession(null);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    let unsubChaos: (() => void) | null = null;

    // Reset member profile modal on family switch
    setIsMemberProfileModalOpen(false);
    setActiveMemberForProfile(null);

    if (isDemoMode) {
      setFamily(DEMO_FAMILY);
      const enrichedDemo = DEMO_MEMBERS.map(m => ({
        ...m,
        age: m.birth_date ? (calculateAgeFromBirthDate(m.birth_date) ?? (m.age || 18)) : (m.age || 18)
      }));
      setMembers(enrichedDemo);
      setProtectedTimes(DEMO_PROTECTED_TIMES);
      setRooms(DEMO_ROOMS);
      setTasks(DEMO_TASKS);
      setCloudSyncStatus('demo');
      return;
    }

    if (authFamily) {
      // Clear tenant data immediately to guarantee strict family isolation during loading
      activeFamilyIdRef.current = authFamily.id;
      setMembers([]);
      setProtectedTimes([]);
      setRooms([]);
      setFamily(authFamily);
      setCloudSyncStatus('synced');

      // Fetch members from Firestore subcollection /families/{familyId}/members
      const loadRealMembers = async () => {
        try {
          const membersRef = collection(db, 'families', authFamily.id, 'members');
          const snap = await getDocs(membersRef);
          if (!isMounted) return;

          if (!snap.empty) {
            const list: Member[] = [];
            snap.forEach(d => {
              const data = d.data();
              const birthDate = data.birth_date || undefined;
              const derivedAge = birthDate ? calculateAgeFromBirthDate(birthDate) : undefined;
              list.push({
                id: d.id,
                familyId: authFamily.id,
                family_id: authFamily.id,
                name: data.name || authUser?.displayName || 'Morador',
                role: (data.role as UserRole) || 'MEMBER',
                userId: data.user_id || data.userId || '',
                user_id: data.user_id || data.userId || '',
                email: data.email || '',
                avatar: data.avatar || (data.role === 'ADMIN' ? '👑' : '👤'),
                color: data.color || '#5b32a3',
                birth_date: birthDate,
                age: derivedAge !== null && derivedAge !== undefined ? derivedAge : (data.age || 18),
                autonomy_level: data.autonomy_level || data.autonomyLevel || 3,
                active: data.active !== undefined ? data.active : true,
                phone: data.phone || undefined,
                bio: data.bio || undefined,
                max_daily_minutes: data.max_daily_minutes || undefined,
                blocked_task_ids: data.blocked_task_ids || [],
                points: data.points || 0,
                streak: data.streak || 0,
                tasksCompleted: data.tasksCompleted || 0,
                createdAt: data.joined_at || data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt || new Date().toISOString()
              });
            });
            setMembers(list);
          } else if (authUser) {
            // New family initial state: exactly 1 member (the ADMIN who created the house)
            setMembers([{
              id: `mbr-${authUser.id.slice(0, 8)}`,
              familyId: authFamily.id,
              family_id: authFamily.id,
              name: authUser.displayName || 'Administrador',
              role: 'ADMIN',
              userId: authUser.id,
              user_id: authUser.id,
              email: authUser.email,
              avatar: '👑',
              color: '#5b32a3',
              autonomy_level: 4,
              points: 0,
              streak: 0,
              tasksCompleted: 0,
              createdAt: authFamily.createdAt || new Date().toISOString(),
              updatedAt: authFamily.updatedAt || new Date().toISOString()
            }]);
          } else {
            setMembers([]);
          }
        } catch (err) {
          console.warn('Could not load members from Firestore:', err);
          if (authUser && isMounted) {
            setMembers([{
              id: `mbr-${authUser.id.slice(0, 8)}`,
              familyId: authFamily.id,
              family_id: authFamily.id,
              name: authUser.displayName || 'Administrador',
              role: 'ADMIN',
              userId: authUser.id,
              user_id: authUser.id,
              email: authUser.email,
              avatar: '👑',
              color: '#5b32a3',
              autonomy_level: 4,
              points: 0,
              streak: 0,
              tasksCompleted: 0,
              createdAt: authFamily.createdAt || new Date().toISOString(),
              updatedAt: authFamily.updatedAt || new Date().toISOString()
            }]);
          }
        }
      };

      // Fetch protected times from subcollection /families/{familyId}/protectedTimes
      const loadRealProtectedTimes = async (): Promise<ProtectedTime[]> => {
        try {
          const ptRef = collection(db, 'families', authFamily.id, 'protectedTimes');
          const snap = await getDocs(ptRef);
          if (!isMounted) return [];

          const list: ProtectedTime[] = [];
          snap.forEach(d => {
            list.push(FirestoreMappers.toProtectedTime(d.id, d.data()));
          });
          setProtectedTimes(list);
          return list;
        } catch (err) {
          console.warn('Could not load protected times from Firestore:', err);
          if (isMounted) setProtectedTimes([]);
          return [];
        }
      };

      // Fetch routines from subcollection /families/{familyId}/familyTasks
      const loadRealFamilyTasks = async (): Promise<FamilyTask[]> => {
        try {
          const ftRef = collection(db, 'families', authFamily.id, 'familyTasks');
          const snap = await getDocs(ftRef);
          if (!isMounted) return [];

          const list: FamilyTask[] = [];
          snap.forEach(d => {
            list.push(FirestoreMappers.toFamilyTask(d.id, d.data()));
          });
          setFamilyTasks(list);
          return list;
        } catch (err) {
          console.warn('Could not load familyTasks from Firestore:', err);
          return [];
        }
      };

      // Fetch rooms from subcollection /families/{familyId}/rooms
      const loadRealRooms = async (): Promise<Room[]> => {
        const familyIdForLoad = authFamily.id;
        try {
          const roomsRef = collection(db, 'families', familyIdForLoad, 'rooms');
          const snap = await getDocs(roomsRef);
          if (!isMounted || activeFamilyIdRef.current !== familyIdForLoad) return [];

          const list: Room[] = [];
          snap.forEach(d => {
            list.push(FirestoreMappers.toRoom(d.id, d.data()));
          });
          setRooms(list);
          return list;
        } catch (err) {
          console.warn('Could not load rooms from Firestore:', err);
          return [];
        }
      };

      // Fetch assignments from subcollection /families/{familyId}/assignments
      const loadRealAssignments = async (
        loadedRooms?: Room[],
        loadedMembers?: Member[],
        loadedPTs?: ProtectedTime[],
        loadedFTs?: FamilyTask[]
      ) => {
        try {
          const asgRef = collection(db, 'families', authFamily.id, 'assignments');
          const snap = await getDocs(asgRef);
          if (!isMounted) return;

          const currentRooms = loadedRooms && loadedRooms.length > 0 ? loadedRooms : rooms;
          const currentMembers = loadedMembers && loadedMembers.length > 0 ? loadedMembers : members;
          const currentPTs = loadedPTs && loadedPTs.length > 0 ? loadedPTs : protectedTimes;
          const currentFTs = loadedFTs && loadedFTs.length > 0 ? loadedFTs : familyTasks;

          const rawAssignments: TaskAssignment[] = [];
          snap.forEach(d => {
            rawAssignments.push(FirestoreMappers.toTaskAssignment(d.id, d.data()));
          });

          // Caminho canônico de hidratação normal (HOTFIX-TASK-CREATE-1-R2: hydration repair removido)
          const activeFTs = currentFTs;
          const repairedAssignments = rawAssignments;

          // Routine Continuity 1.0 (HOTFIX-TASK-CREATE-1-R2D): Sincroniza horizonte de 15 dias SEM disparar distribuição
          let syncedAssignments = repairedAssignments;
          if (activeFTs.length > 0) {
            try {
              const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
                family: authFamily,
                routines: activeFTs,
                existingAssignments: repairedAssignments,
                isDemoMode: false
              });
              syncedAssignments = syncResult.allAssignments;
            } catch (syncErr) {
              console.warn('[AppContext] syncRoutineOccurrences error:', syncErr);
            }
          }

          const list: Task[] = [];
          const seenCanonicalKeys = new Set<string>();

          syncedAssignments.forEach(asg => {
            const master = allMasterTasks.find(tm => tm.id === asg.task_id);
            const roomObj = currentRooms.find(r => r.id === asg.room_id);
            const fallbackRoomType = master?.room_type || 'geral';
            const ft = activeFTs.find(f => f.id === asg.family_task_id || f.id === (asg as any).familyTaskId);
            const displayTitle = ft?.customTitle ?? ft?.custom_title ?? master?.name ?? asg.task_id;
            const displayDescription = ft?.customDescription ?? ft?.custom_description ?? master?.description ?? '';

            // HOTFIX-DUP-1: Proteção canônica de hidratação no AppContext (sem dedupe por título)
            const canonicalKey = (asg.task_id && asg.scheduled_date) 
              ? `${asg.task_id}_${asg.scheduled_date}` 
              : (asg.family_task_id && asg.scheduled_date ? `${asg.family_task_id}_${asg.scheduled_date}` : asg.id);
            
            if (seenCanonicalKeys.has(canonicalKey)) {
              return;
            }
            seenCanonicalKeys.add(canonicalKey);

            list.push({
              id: asg.id,
              familyId: asg.family_id,
              title: displayTitle,
              description: displayDescription,
              taskMasterId: asg.task_id,
              familyTaskId: asg.family_task_id,
              assignedMemberId: asg.is_unassigned ? '' : asg.member_id,
              assigneeId: asg.is_unassigned ? '' : asg.member_id,
              status: asg.status === 'COMPLETED' ? 'DONE' : (asg.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'),
              dueDate: asg.scheduled_date || getTodayDateString(),
              scheduledStart: asg.scheduled_start,
              scheduledEnd: asg.scheduled_end,
              assignedReason: asg.assigned_reason,
              unassignedReason: asg.unassigned_reason,
              isUnassigned: asg.is_unassigned,
              factors: asg.factors,
              frequency: 'DAILY',
              effort: master?.effort_level ? master.effort_level * 5 : 10,
              durationMinutes: master?.duration_minutes || 20,
              category: master?.category || 'cleaning',
              roomId: asg.room_id || fallbackRoomType,
              roomName: roomObj?.name || fallbackRoomType,
              completedAt: asg.completed_at,
              completedByMemberId: asg.completed_by,
              completedByName: asg.completed_by_name,
              completionType: asg.completion_type,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          });
          setTasks(list);
        } catch (err) {
          console.warn('Could not load assignments from Firestore:', err);
        }
      };

      try {
        unsubChaos = ChaosSessionService.subscribeToActiveChaosSession(
          authFamily.id,
          (session) => {
            if (isMounted) {
              setActiveChaosSession(session);
            }
          }
        );
      } catch (err) {
        console.warn('Could not subscribe to active chaos session:', err);
      }

      loadRealMembers();
      loadRealProtectedTimes();
      loadActiveChaosSession();
      loadRealRooms().then(roomsList => {
        loadRealFamilyTasks().then(familyTasksList => {
          loadRealAssignments(roomsList, undefined, undefined, familyTasksList);
        });
      });
    } else {
      setFamily({
        id: '',
        name: '',
        ownerUserId: '',
        createdAt: '',
        updatedAt: ''
      });
      setMembers([]);
      setProtectedTimes([]);
      setRooms([]);
      setTasks([]);
      setActiveChaosSession(null);
    }

    return () => {
      isMounted = false;
      if (unsubChaos) {
        unsubChaos();
      }
    };
  }, [authFamily?.id, isDemoMode, authUser?.id, authUser?.displayName]);

  const loadDemoFamily = () => {
    enterDemoMode();
    setFamily(DEMO_FAMILY);
    const enrichedDemo = DEMO_MEMBERS.map(m => ({
      ...m,
      age: m.birth_date ? (calculateAgeFromBirthDate(m.birth_date) ?? (m.age || 18)) : (m.age || 18)
    }));
    setMembers(enrichedDemo);
    setProtectedTimes(DEMO_PROTECTED_TIMES);
    setRooms(DEMO_ROOMS);
    setTasks(DEMO_TASKS);
    setFamilyTasks(demoFamilyTasks);
    setActiveChaosSession(null);
    setCloudSyncStatus('demo');
  };

  // Section 8 & 9: Authenticated caller resolution. Real families fail closed without members[0] fallback.
  // HF2: Auth UID -> FamilyMembership -> canonical Member -> currentMember.id
  const currentMember: Member | null = useMemo(() => {
    if (isDemoMode) {
      return members[0] || null;
    }
    if (!authUser?.id) return null;

    // 1. Prioridade: Derivar via currentMembership.memberId
    if (currentMembership?.memberId) {
      const foundByMembership = members.find(m => m.id === currentMembership.memberId);
      if (foundByMembership) return foundByMembership;
    }

    // 2. Procura por userId / user_id do authUser na coleção de membros da família
    const foundByUserId = members.find(m => m.userId === authUser.id || m.user_id === authUser.id);
    if (foundByUserId) return foundByUserId;

    return null;
  }, [isDemoMode, members, authUser?.id, currentMembership?.memberId]);

  const completeTaskDetailed = async (taskId: string, _ignoredSpoofedMemberId?: string): Promise<TaskCompletionResult> => {
    let existingTask = tasks.find(t => t.id === taskId);

    // Se a tarefa não estiver na memória local do AppContext, hidrata diretamente do Firestore
    if (!existingTask && !isDemoMode && family?.id) {
      try {
        const asgRef = doc(db, 'families', family.id, 'assignments', taskId);
        const asgSnap = await getDoc(asgRef);
        if (asgSnap.exists()) {
          const asg = FirestoreMappers.toTaskAssignment(asgSnap.id, asgSnap.data());
          const ft = familyTasks.find(f => f.id === asg.family_task_id);
          const master = allMasterTasks.find(tm => tm.id === asg.task_id);
          existingTask = {
            id: asg.id,
            familyId: asg.family_id,
            title: ft?.customTitle || ft?.custom_title || master?.name || asg.task_id,
            description: ft?.customDescription || ft?.custom_description || master?.description || '',
            taskMasterId: asg.task_id,
            familyTaskId: asg.family_task_id,
            assignedMemberId: asg.is_unassigned ? '' : asg.member_id,
            assigneeId: asg.is_unassigned ? '' : asg.member_id,
            status: asg.status === 'COMPLETED' ? 'DONE' : 'PENDING',
            dueDate: asg.scheduled_date || getTodayDateString(),
            frequency: 'DAILY',
            effort: master?.effort || 10,
            createdAt: asg.scheduled_date || getTodayDateString(),
            updatedAt: asg.scheduled_date || getTodayDateString(),
            isUnassigned: asg.is_unassigned,
            roomId: asg.room_id || 'room-general'
          };
        }
      } catch (fetchErr) {
        console.warn('[completeTaskDetailed] Warning ao hidratar atribuição do Firestore:', fetchErr);
      }
    }

    if (!existingTask) {
      console.warn(`[completeTask] Task ${taskId} not found.`);
      return { success: false, code: 'NOT_FOUND', error: 'Tarefa não encontrada.' };
    }

    // Section 8 & 9: Authorization identity MUST originate from authUser -> currentMember in active family.
    // UI must NOT be able to spoof caller identity.
    // For REAL families: members[0] MUST NOT be used as authorization fallback. Fail closed.
    const caller = currentMember;

    if (!caller || !caller.id) {
      console.warn('[RBAC] Member completion denied: No authenticated member found (Fail-closed).');
      return { success: false, code: 'UNAUTHORIZED', error: 'Nenhum morador autenticado encontrado (Fail-closed).' };
    }

    // Evaluate authorization via authoritative TaskCompletionService
    const authResult = TaskCompletionService.authorizeCompletion({
      task: existingTask,
      callerMember: caller
    });

    if (!authResult.allowed) {
      console.warn(`[RBAC] Completion denied for task ${taskId}: ${authResult.reason}`);
      return { success: false, code: 'UNAUTHORIZED', error: authResult.reason || 'Operação não autorizada.' };
    }

    // Section 14: Idempotency check - if already DONE, return false without mutating
    if (existingTask.status === 'DONE') {
      return { success: false, code: 'ALREADY_COMPLETED', error: 'Esta tarefa já foi concluída.' };
    }

    const now = new Date().toISOString();
    const finalAssignedMemberId = authResult.assignedMemberId || caller.id;
    const targetRewardMemberId = authResult.targetMemberId || caller.id;
    const rewardMember = members.find(m => m.id === targetRewardMemberId);

    if (!isDemoMode && family?.id) {
      try {
        const asgRef = doc(db, 'families', family.id, 'assignments', taskId);
        const memberRef = rewardMember ? doc(db, 'families', family.id, 'members', targetRewardMemberId) : null;

        await runTransaction(db, async (transaction) => {
          // Read assignment
          const asgSnap = await transaction.get(asgRef);
          if (!asgSnap.exists()) {
            throw new Error('NOT_FOUND');
          }

          const asgData = asgSnap.data();

          // C1: Idempotency check inside transaction
          if (asgData.status === 'COMPLETED' || asgData.status === 'DONE') {
            throw new Error('ALREADY_COMPLETED');
          }

          // Section 13: Concurrency check for UNASSIGNED tasks (e.g. Lucas vs Clara race)
          const dbIsUnassigned = asgData.is_unassigned !== false && (!asgData.member_id || asgData.member_id === '');
          if (authResult.completionType === 'SELF_CLAIMED' && !dbIsUnassigned) {
            // Another member claimed it concurrently!
            throw new Error('CONCURRENT_CLAIM_LOST');
          }

          // Read member if exists
          let currentPoints = rewardMember?.points || 0;
          let currentStreak = rewardMember?.streak || 0;
          let currentTasksCompleted = rewardMember?.tasksCompleted || 0;

          if (memberRef) {
            const memberSnap = await transaction.get(memberRef);
            if (memberSnap.exists()) {
              const mData = memberSnap.data();
              currentPoints = mData.points || 0;
              currentStreak = mData.streak || 0;
              currentTasksCompleted = mData.tasksCompleted || 0;
            }
          }

          // Section 4, 5, 12, 15: Prepare assignment update
          const updatePayload: Record<string, any> = {
            status: 'COMPLETED',
            completed_at: now,
            completed_by: caller.id,
            completed_by_name: caller.name,
            completion_type: authResult.completionType,
            updatedAt: now
          };

          if (authResult.completionType === 'SELF_CLAIMED') {
            updatePayload.member_id = caller.id;
            updatePayload.is_unassigned = false;
            updatePayload.unassigned_reason = null;
          }

          transaction.update(asgRef, updatePayload);

          // C2: Update member points, streak, tasksCompleted atomically in same transaction
          if (memberRef) {
            transaction.update(memberRef, {
              points: currentPoints + 15,
              streak: currentStreak + 1,
              tasksCompleted: currentTasksCompleted + 1,
              updatedAt: now
            });
          }
        });
      } catch (err: any) {
        if (err?.message === 'CONCURRENT_CLAIM_LOST') {
          return { success: false, code: 'CONCURRENT_CLAIM_LOST', error: 'Outro morador acabou de assumir/concluir esta tarefa.' };
        }
        if (err?.message === 'ALREADY_COMPLETED') {
          return { success: false, code: 'ALREADY_COMPLETED', error: 'Esta tarefa já foi concluída.' };
        }
        if (err?.message === 'NOT_FOUND') {
          return { success: false, code: 'NOT_FOUND', error: 'Atribuição da tarefa não encontrada no banco de dados.' };
        }
        console.warn('Could not persist task completion via transaction to Firestore:', err);
        return { success: false, code: 'ERROR', error: 'Não foi possível registrar a conclusão da tarefa.' };
      }
    }

    // Local state update (atomic after successful transaction or demo mode)
    setTasks(prev => {
      const exists = prev.some(t => t.id === taskId);
      const updatedItem = {
        ...(existingTask || {}),
        id: taskId,
        status: 'DONE' as const,
        completedAt: now,
        completedByMemberId: caller.id,
        completedByName: caller.name,
        completionType: authResult.completionType,
        assignedMemberId: finalAssignedMemberId,
        assigneeId: finalAssignedMemberId,
        assigneeName: authResult.completionType === 'SELF_CLAIMED' ? caller.name : existingTask?.assigneeName,
        isUnassigned: false
      };
      if (exists) {
        return prev.map(t => t.id === taskId ? (updatedItem as Task) : t);
      }
      return [...prev, updatedItem as Task];
    });

    if (rewardMember) {
      setMembers(prev => prev.map(m => {
        if (m.id === targetRewardMemberId) {
          return {
            ...m,
            points: (m.points || 0) + 15,
            streak: (m.streak || 0) + 1,
            tasksCompleted: (m.tasksCompleted || 0) + 1
          };
        }
        return m;
      }));
    }

    return {
      success: true,
      code: 'SUCCESS',
      completionType: authResult.completionType,
      assignedMemberId: finalAssignedMemberId
    };
  };

  const completeTask = async (taskId: string, _ignoredSpoofedMemberId?: string): Promise<boolean> => {
    const res = await completeTaskDetailed(taskId, _ignoredSpoofedMemberId);
    return res.success;
  };

  const addTask = async (newTask: Partial<Task> & {
    frequency?: TaskFrequency | string;
    preferredDays?: number[];
    dayOfMonth?: number;
    durationMinutes?: number;
  }) => {
    // 1. RBAC Guard: Somente ADMIN pode criar tarefas para a casa (MEMBER-RBAC-1)
    if (currentMember && currentMember.role && currentMember.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem criar tarefas para a casa.');
    }

    const cleanTitle = (newTask.title || '').trim();
    if (!cleanTitle) {
      throw new Error('O título da tarefa é obrigatório.');
    }

    const cleanDesc = (newTask.description || '').trim();
    const cleanRoomId = newTask.roomId || rooms[0]?.id || 'room-geral';
    const roomObj = rooms.find(r => r.id === cleanRoomId);
    const cleanRoomName = roomObj?.name || newTask.roomName || 'Geral';
    const freq = (newTask.frequency || 'DAILY').toUpperCase();
    const taskDate = newTask.dueDate || selectedDate || getFamilyLocalDate(family.timezone);
    const nowIso = new Date().toISOString();

    const initialAssigneeId = newTask.assignedMemberId || newTask.assigneeId;
    const targetMember = initialAssigneeId ? members.find(m => m.id === initialAssigneeId) : undefined;
    const isTargetActive = targetMember ? isMemberActive(targetMember) : false;

    let finalAssigneeId = '';
    let finalAssigneeName = 'Não atribuído';
    let isUnassigned = Boolean(newTask.isUnassigned);

    if (!isUnassigned && targetMember && isTargetActive) {
      finalAssigneeId = targetMember.id;
      finalAssigneeName = targetMember.name;
    } else if (!isUnassigned && !initialAssigneeId && activeMembers[0]) {
      finalAssigneeId = activeMembers[0].id;
      finalAssigneeName = activeMembers[0].name;
    } else {
      isUnassigned = true;
      finalAssigneeId = '';
      finalAssigneeName = 'Não atribuído';
    }

    // 2. Localizar ou Criar FamilyTask Canônica (Idempotência contra duplo submit / retry)
    let familyTask = familyTasks.find(ft => {
      if (ft.active === false) return false;
      const t1 = (ft.customTitle || ft.custom_title || ft.name || '').trim().toLowerCase();
      const t2 = cleanTitle.toLowerCase();
      const sameRoom = (ft.room_id || (ft as any).roomId) === cleanRoomId;
      return t1 === t2 && sameRoom;
    });

    let isNewFamilyTask = false;
    if (!familyTask) {
      isNewFamilyTask = true;
      const ftId = (!isDemoMode && db && (authFamily?.id || family?.id))
        ? doc(collection(db, 'families', authFamily?.id || family.id, 'familyTasks')).id
        : `ft-custom-${Date.now()}`;

      familyTask = {
        id: ftId,
        family_id: authFamily?.id || family.id,
        familyId: authFamily?.id || family.id,
        task_master_id: newTask.taskMasterId || (null as any),
        taskMasterId: newTask.taskMasterId || (null as any),
        name: cleanTitle,
        customTitle: cleanTitle,
        custom_title: cleanTitle,
        customDescription: cleanDesc,
        custom_description: cleanDesc,
        room_id: cleanRoomId,
        roomId: cleanRoomId,
        frequency: freq,
        preferred_days: newTask.preferredDays || (freq === 'WEEKLY' ? [getDayOfWeek(taskDate)] : [0, 1, 2, 3, 4, 5, 6]),
        preferred_time: newTask.scheduledStart || '09:00',
        preferredTime: newTask.scheduledStart || '09:00',
        estimated_minutes: newTask.durationMinutes || 20,
        start_date: taskDate,
        startDate: taskDate,
        active: true,
        chaosEligible: false,
        assigned_automatically: true,
        created_at: nowIso,
        createdAt: nowIso,
        updated_at: nowIso,
        updatedAt: nowIso
      };

      if (!isDemoMode && (authFamily?.id || family?.id) && db) {
        try {
          await setDoc(
            doc(db, 'families', authFamily?.id || family.id, 'familyTasks', familyTask.id),
            FirestoreMappers.fromFamilyTask(familyTask)
          );
        } catch (ftErr) {
          console.warn('[AppContext.addTask] Falha ao persistir FamilyTask:', ftErr);
        }
      }

      setFamilyTasks(prev => [...prev, familyTask!]);
    }

    const currentFTList = isNewFamilyTask ? [...familyTasks, familyTask] : familyTasks;

    // 3. Ocorrência (TaskAssignment)
    if (freq === 'ONE_TIME' || freq === 'ONCE') {
      const occId = `${familyTask.id}_${taskDate}`;
      const occ: TaskAssignment = {
        id: occId,
        family_id: authFamily?.id || family.id,
        family_task_id: familyTask.id,
        task_id: familyTask.task_master_id || familyTask.id,
        room_id: cleanRoomId,
        scheduled_date: taskDate,
        scheduled_start: newTask.scheduledStart || familyTask.preferred_time || '09:00',
        scheduled_end: newTask.scheduledEnd,
        status: 'SCHEDULED',
        score: 0,
        assigned_reason: newTask.assignedReason || '',
        unassigned_reason: isUnassigned ? 'Tarefa pontual sem responsável atribuído.' : undefined,
        is_unassigned: isUnassigned,
        member_id: finalAssigneeId || ''
      };

      if (!isDemoMode && (authFamily?.id || family?.id) && db) {
        try {
          await setDoc(
            doc(db, 'families', authFamily?.id || family.id, 'assignments', occId),
            FirestoreMappers.fromTaskAssignment(occ)
          );
        } catch (asgErr) {
          console.warn('[AppContext.addTask] Falha ao persistir Assignment pontual:', asgErr);
        }
      }

      const taskObj: Task = {
        id: occId,
        familyId: authFamily?.id || family.id,
        familyTaskId: familyTask.id,
        title: cleanTitle,
        description: cleanDesc,
        roomId: cleanRoomId,
        roomName: cleanRoomName,
        assigneeId: finalAssigneeId,
        assigneeName: finalAssigneeName,
        assignedMemberId: finalAssigneeId,
        frequency: freq as any,
        effort: newTask.effort || 10,
        status: 'PENDING',
        dueDate: taskDate,
        category: newTask.category || 'cleaning',
        scheduledStart: newTask.scheduledStart || familyTask.preferred_time || '09:00',
        scheduledEnd: newTask.scheduledEnd,
        assignedReason: newTask.assignedReason,
        unassignedReason: occ.unassigned_reason,
        isUnassigned,
        taskMasterId: familyTask.task_master_id,
        factors: newTask.factors,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      setTasks(prev => [taskObj, ...prev.filter(t => t.id !== occId)]);
    } else {
      // Recorrente (HOTFIX-TASK-CREATE-1-R2D): Invoca geração pura de ocorrências SEM distribuir
      await syncRoutineOccurrences(currentFTList);
    }
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, ...updates, updatedAt: new Date().toISOString() };
      }
      return t;
    }));

    if (!isDemoMode && family?.id) {
      try {
        const firestorePayload = FirestoreMappers.toTaskAssignmentPersistencePayload({
          id: taskId,
          family_id: family.id,
          ...updates,
          updatedAt: new Date().toISOString()
        });
        updateDoc(doc(db, 'families', family.id, 'assignments', taskId), firestorePayload)
          .catch(err => console.warn('Could not persist task update to Firestore:', err));
      } catch (err) {
        console.warn('Could not serialize task update for Firestore:', err);
      }
    }
  };

  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));

    if (!isDemoMode && family?.id) {
      deleteDoc(doc(db, 'families', family.id, 'assignments', taskId))
        .catch(err => console.warn('Could not delete assignment in Firestore:', err));
    }
  };

  const applyRebalanceUpdates = async (taskUpdates: Record<string, Partial<Task>>): Promise<void> => {
    // Regra canônica: Tarefas COMPLETED nunca são alteradas nem sobrescritas
    setTasks(prev => prev.map(t => {
      if (t.status === 'DONE' || (t.status as string) === 'COMPLETED') {
        return t;
      }
      const u = taskUpdates[t.id];
      if (u) {
        return { ...t, ...u, updatedAt: new Date().toISOString() };
      }
      return t;
    }));

    if (!isDemoMode && family?.id) {
      await DistributionService.persistAssignmentsToFirestore(family.id, tasks, taskUpdates);
    }
  };

  const assignTaskManually = async (
    taskId: string,
    newMemberId: string | null,
    options?: { confirmInProgress?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    // 1. RBAC: Somente ADMIN pode atribuir manualmente tarefas
    const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';
    if (!isAdmin) {
      return { success: false, error: 'Apenas administradores podem atribuir ou reatribuir tarefas.' };
    }

    // 2. Buscar a tarefa e verificar existência
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      return { success: false, error: 'Tarefa não encontrada.' };
    }

    // 3. Tenant isolation: tarefa deve pertencer à família atual
    if (family?.id && task.familyId && task.familyId !== family.id) {
      return { success: false, error: 'Isolamento de família violado: tarefa pertence a outra família.' };
    }

    // 4. Invariante Canônica: Tarefa COMPLETED não pode ter assignee reescrito nem metadados alterados
    if (task.status === 'DONE' || (task.status as string) === 'COMPLETED') {
      return { success: false, error: 'Tarefas concluídas não podem ter seu responsável alterado.' };
    }

    // 5. Tarefa IN_PROGRESS requer confirmação explícita
    if (task.status === 'IN_PROGRESS' && !options?.confirmInProgress) {
      return {
        success: false,
        error: 'Esta tarefa está em andamento. Reatribuição requer confirmação explícita do administrador.'
      };
    }

    let updates: Partial<Task> = {};

    // 6. Atribuição para "Sem responsável" (unassigned)
    if (!newMemberId) {
      updates = {
        assignedMemberId: '',
        assigneeId: '',
        assigneeName: 'Não atribuído',
        isUnassigned: true,
        assignedReason: 'Atribuição manual removida pelo Administrador',
        unassignedReason: 'Tarefa deixada sem responsável por decisão manual do Administrador'
      };
    } else {
      // 7. Atribuição para um morador específico
      const targetMember = members.find(m => m.id === newMemberId);
      if (!targetMember) {
        return { success: false, error: 'Morador selecionado não foi encontrado na família.' };
      }

      // Tenant isolation: morador deve pertencer à família atual
      if (family?.id && targetMember.familyId && targetMember.familyId !== family.id) {
        return { success: false, error: 'Isolamento de família violado: morador pertence a outra família.' };
      }

      // Morador deve estar ativo
      if (targetMember.active === false) {
        return { success: false, error: 'Não é permitido atribuir tarefas a moradores inativos.' };
      }

      // 8. Checagem de Segurança Canônica (SafetyService)
      let memberForSafety = targetMember;
      if (memberForSafety.age === undefined && memberForSafety.birth_date) {
        const derivedAge = calculateAgeFromBirthDate(memberForSafety.birth_date);
        if (derivedAge !== null) {
          memberForSafety = { ...memberForSafety, age: derivedAge };
        }
      }
      const taskMaster = DistributionService.getOrCreateTaskMaster(task);
      const safetyResult = SafetyService.validateSafety(memberForSafety, taskMaster);
      if (!safetyResult.isSafe) {
        return {
          success: false,
          error: safetyResult.reason || 'Bloqueio de segurança: a tarefa não é segura para este morador.'
        };
      }

      updates = {
        assignedMemberId: targetMember.id,
        assigneeId: targetMember.id,
        assigneeName: targetMember.name,
        isUnassigned: false,
        assignedReason: 'Atribuição manual definida pelo Administrador',
        unassignedReason: undefined
      };
    }

    // 9. Atualizar estado local
    const nowStr = new Date().toISOString();
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, ...updates, updatedAt: nowStr };
      }
      return t;
    }));

    if (activeTaskForInspect && activeTaskForInspect.id === taskId) {
      setActiveTaskForInspect(prev => prev ? { ...prev, ...updates, updatedAt: nowStr } : null);
    }

    // 10. Persistência no Firestore se estiver em família real
    if (!isDemoMode && family?.id && db) {
      try {
        const assignmentRef = doc(db, 'families', family.id, 'assignments', taskId);
        const firestorePayload = FirestoreMappers.toTaskAssignmentPersistencePayload({
          id: taskId,
          family_id: family.id,
          member_id: updates.assignedMemberId || '',
          is_unassigned: updates.isUnassigned,
          assigned_reason: updates.assignedReason || '',
          unassigned_reason: updates.unassignedReason,
          factors: updates.factors,
          updatedAt: nowStr
        });
        await updateDoc(assignmentRef, firestorePayload);
      } catch (firestoreErr) {
        console.error('Falha ao persistir atribuição manual no Firestore:', firestoreErr);
        return { success: false, error: 'Erro ao persistir atribuição no banco de dados.' };
      }
    }

    return { success: true };
  };

  const rebalanceTasksWithEngine = async (): Promise<RebalanceResult> => {
    const { result, taskUpdates } = DistributionService.executeRebalance({
      family,
      members,
      tasks,
      protectedTimes,
      targetDate: selectedDate
    });

    await applyRebalanceUpdates(taskUpdates);

    return result;
  };

  const addMember = (memberData: Partial<Member>) => {
    const id = `mem-${Date.now()}`;
    const newMem: Member = {
      id,
      familyId: family.id,
      name: memberData.name || 'Novo Morador',
      role: memberData.role || 'MEMBER',
      avatar: memberData.avatar || (memberData.role === 'ADMIN' ? '👑' : '👤'),
      color: memberData.color || '#5b32a3',
      points: 0,
      streak: 0,
      tasksCompleted: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setMembers(prev => [...prev, newMem]);

    if (!isDemoMode && family?.id) {
      setDoc(doc(db, 'families', family.id, 'members', id), {
        id,
        family_id: family.id,
        name: newMem.name,
        role: newMem.role,
        avatar: newMem.avatar,
        color: newMem.color,
        points: 0,
        streak: 0,
        tasksCompleted: 0,
        active: true,
        joined_at: newMem.createdAt
      }).catch(err => console.warn('Could not persist new member to Firestore:', err));
    }
  };

  const updateMemberRole = (memberId: string, newRole: UserRole) => {
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return { ...m, role: newRole, updatedAt: new Date().toISOString() };
      }
      return m;
    }));

    if (!isDemoMode && family?.id) {
      updateDoc(doc(db, 'families', family.id, 'members', memberId), {
        role: newRole,
        updatedAt: new Date().toISOString()
      }).catch(err => console.warn('Could not update member role in Firestore:', err));
    }
  };

  const deactivateMember = async (memberId: string): Promise<{ success: boolean; error?: string }> => {
    const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';
    if (!isAdmin) {
      return { success: false, error: 'Apenas administradores podem desativar moradores da casa.' };
    }

    const targetMember = members.find(m => m.id === memberId);
    if (!targetMember) {
      return { success: false, error: 'Morador não encontrado.' };
    }

    // Invariante: a casa precisa manter pelo menos 1 ADMIN ativo
    if (targetMember.role === 'ADMIN') {
      const activeAdmins = getActiveAdmins(members);
      if (activeAdmins.length <= 1) {
        return { success: false, error: 'A casa precisa manter pelo menos 1 administrador ativo.' };
      }
    }

    const now = new Date().toISOString();

    // 1. Soft-delete morador
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, active: false, updatedAt: now } : m));

    // 2. STAB-003: Histórico preservado:
    // Tarefas concluídas pelo morador permanecem concluídas com o registro do autor e pontos auditáveis
    // Tarefas pendentes atribuídas ao morador voltam a ficar unassigned / "Disponíveis" no Today
    setTasks(prev => prev.map(t => {
      const isAssigned = t.assignedMemberId === memberId || t.assigneeId === memberId;
      const isPending = t.status !== 'DONE' && (t.status as string) !== 'COMPLETED';

      if (isAssigned && isPending) {
        return {
          ...t,
          assignedMemberId: '',
          assigneeId: '',
          isUnassigned: true,
          unassignedReason: `Morador ${targetMember.name} foi desativado da casa.`,
          assignedReason: undefined,
          factors: undefined,
          updatedAt: now
        };
      }
      return t;
    }));

    if (!isDemoMode && family?.id) {
      try {
        await updateDoc(doc(db, 'families', family.id, 'members', memberId), {
          active: false,
          updatedAt: now
        });
      } catch (err) {
        console.warn('Could not deactivate member in Firestore:', err);
      }
    }

    return { success: true };
  };

  const reactivateMember = async (memberId: string): Promise<{ success: boolean; error?: string }> => {
    const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';
    if (!isAdmin) {
      return { success: false, error: 'Apenas administradores podem reativar moradores da casa.' };
    }

    const targetMember = members.find(m => m.id === memberId);
    if (!targetMember) {
      return { success: false, error: 'Morador não encontrado.' };
    }

    const now = new Date().toISOString();
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, active: true, updatedAt: now } : m));

    if (!isDemoMode && family?.id) {
      try {
        await updateDoc(doc(db, 'families', family.id, 'members', memberId), {
          active: true,
          updatedAt: now
        });
      } catch (err) {
        console.warn('Could not reactivate member in Firestore:', err);
      }
    }

    return { success: true };
  };

  const removeMember = (memberId: string) => {
    deactivateMember(memberId);
  };

  const openMemberProfile = (member: Member) => {
    setActiveMemberForProfile(member);
    setIsMemberProfileModalOpen(true);
  };

  const closeMemberProfile = () => {
    setIsMemberProfileModalOpen(false);
    setActiveMemberForProfile(null);
  };

  const updateMemberProfile = async (memberId: string, updates: MemberProfileUpdateData) => {
    // Strict contract security: reject forbidden keys
    const prohibitedKeys = ['role', 'family_id', 'familyId', 'user_id', 'userId', 'active'];
    const hasProhibited = Object.keys(updates).some(k => prohibitedKeys.includes(k));
    if (hasProhibited) {
      throw new Error('Alteração de campos protegidos (role, family_id, user_id, active) não é permitida no perfil.');
    }

    const cleanName = updates.name ? updates.name.trim() : '';
    if (!cleanName) {
      throw new Error('Nome do morador é obrigatório.');
    }

    const birthDate = updates.birth_date !== undefined ? updates.birth_date : undefined;
    let derivedAge: number | null | undefined = undefined;
    if (birthDate) {
      derivedAge = calculateAgeFromBirthDate(birthDate);
      if (derivedAge === null) {
        throw new Error('Data de nascimento inválida ou no futuro.');
      }
    }

    // Update in-memory state
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const finalBirthDate = birthDate !== undefined ? birthDate : m.birth_date;
      const finalAge = derivedAge !== undefined && derivedAge !== null 
        ? derivedAge 
        : (finalBirthDate ? (calculateAgeFromBirthDate(finalBirthDate) ?? m.age) : m.age);

      return {
        ...m,
        name: cleanName,
        birth_date: finalBirthDate,
        age: finalAge,
        autonomy_level: updates.autonomy_level !== undefined ? updates.autonomy_level : m.autonomy_level,
        max_daily_minutes: updates.max_daily_minutes !== undefined ? (updates.max_daily_minutes ?? undefined) : m.max_daily_minutes,
        bio: updates.bio !== undefined ? (updates.bio ?? undefined) : m.bio,
        phone: updates.phone !== undefined ? (updates.phone ?? undefined) : m.phone,
        updatedAt: new Date().toISOString()
      };
    }));

    setActiveMemberForProfile(prev => {
      if (!prev || prev.id !== memberId) return prev;
      const finalBirthDate = birthDate !== undefined ? birthDate : prev.birth_date;
      const finalAge = derivedAge !== undefined && derivedAge !== null 
        ? derivedAge 
        : (finalBirthDate ? (calculateAgeFromBirthDate(finalBirthDate) ?? prev.age) : prev.age);

      return {
        ...prev,
        name: cleanName,
        birth_date: finalBirthDate,
        age: finalAge,
        autonomy_level: updates.autonomy_level !== undefined ? updates.autonomy_level : prev.autonomy_level,
        max_daily_minutes: updates.max_daily_minutes !== undefined ? (updates.max_daily_minutes ?? undefined) : prev.max_daily_minutes,
        bio: updates.bio !== undefined ? (updates.bio ?? undefined) : prev.bio,
        phone: updates.phone !== undefined ? (updates.phone ?? undefined) : prev.phone,
        updatedAt: new Date().toISOString()
      };
    });

    // Firestore persistence for real families (never in Demo)
    if (!isDemoMode && family?.id) {
      const memberDocRef = doc(db, 'families', family.id, 'members', memberId);
      const firestorePayload: Record<string, any> = {
        name: cleanName,
        updatedAt: new Date().toISOString()
      };
      if (updates.birth_date !== undefined) firestorePayload.birth_date = updates.birth_date;
      if (updates.autonomy_level !== undefined) firestorePayload.autonomy_level = updates.autonomy_level;
      if (updates.max_daily_minutes !== undefined) firestorePayload.max_daily_minutes = updates.max_daily_minutes;
      if (updates.bio !== undefined) firestorePayload.bio = updates.bio;
      if (updates.phone !== undefined) firestorePayload.phone = updates.phone;

      await updateDoc(memberDocRef, firestorePayload);
    }
  };

  const loadProtectedTimes = async (familyId: string) => {
    try {
      const ptRef = collection(db, 'families', familyId, 'protectedTimes');
      const snap = await getDocs(ptRef);
      const list: ProtectedTime[] = [];
      snap.forEach(d => {
        list.push(FirestoreMappers.toProtectedTime(d.id, d.data()));
      });
      setProtectedTimes(list);
    } catch (err) {
      console.warn('Could not load protected times:', err);
      setProtectedTimes([]);
    }
  };

  const addProtectedTime = async (timeData: Omit<ProtectedTime, 'id' | 'family_id' | 'created_at' | 'updated_at'>) => {
    const id = isDemoMode ? `pt-demo-${Date.now()}` : doc(collection(db, 'families', family.id, 'protectedTimes')).id;
    const now = new Date().toISOString();
    const newPt: ProtectedTime = {
      id,
      family_id: family.id,
      member_id: timeData.member_id,
      type: timeData.type,
      label: timeData.label.trim(),
      day_of_week: timeData.day_of_week,
      start_time: timeData.start_time,
      end_time: timeData.end_time,
      active: timeData.active !== undefined ? timeData.active : true,
      created_at: now,
      updated_at: now
    };

    setProtectedTimes(prev => [...prev, newPt]);

    if (!isDemoMode && family?.id) {
      const docRef = doc(db, 'families', family.id, 'protectedTimes', id);
      await setDoc(docRef, FirestoreMappers.fromProtectedTime(newPt));
    }
  };

  const updateProtectedTime = async (id: string, updates: Partial<ProtectedTime>) => {
    const now = new Date().toISOString();
    setProtectedTimes(prev => prev.map(pt => {
      if (pt.id !== id) return pt;
      return {
        ...pt,
        ...updates,
        updated_at: now
      };
    }));

    if (!isDemoMode && family?.id) {
      const docRef = doc(db, 'families', family.id, 'protectedTimes', id);
      const payload: Record<string, any> = { ...updates, updated_at: now };
      delete payload.id;
      delete payload.family_id;
      await updateDoc(docRef, payload);
    }
  };

  const deleteProtectedTime = async (id: string) => {
    setProtectedTimes(prev => prev.filter(pt => pt.id !== id));

    if (!isDemoMode && family?.id) {
      const docRef = doc(db, 'families', family.id, 'protectedTimes', id);
      await deleteDoc(docRef);
    }
  };

  // ROOM / ENVIRONMENT MANAGEMENT 1.0
  const loadRealRooms = async (): Promise<void> => {
    if (!authFamily || isDemoMode) {
      if (isDemoMode) setRooms(DEMO_ROOMS);
      return;
    }
    const familyIdForLoad = authFamily.id;
    try {
      const roomsRef = collection(db, 'families', familyIdForLoad, 'rooms');
      const snap = await getDocs(roomsRef);
      if (activeFamilyIdRef.current !== familyIdForLoad) return;
      const list: Room[] = [];
      snap.forEach(d => {
        list.push(FirestoreMappers.toRoom(d.id, d.data()));
      });
      setRooms(list);
    } catch (err) {
      console.warn('Could not load rooms from Firestore:', err);
    }
  };

  const addRoom = async (data: { name: string; type: string; icon?: string; color?: string }): Promise<Room> => {
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      throw new Error('O nome do ambiente é obrigatório.');
    }
    if (trimmedName.length > 40) {
      throw new Error('O nome do ambiente não pode exceder 40 caracteres.');
    }
    if (!isValidRoomType(data.type)) {
      throw new Error(`Tipo de ambiente inválido: "${data.type}". Escolha uma categoria canônica.`);
    }

    const now = new Date().toISOString();
    const typeOpt = ROOM_TYPE_OPTIONS.find(o => o.key === data.type);
    const resolvedIcon = data.icon || typeOpt?.icon || 'Home';
    const resolvedColor = data.color || typeOpt?.defaultColor || '#5b32a3';

    if (isDemoMode || !authFamily) {
      const demoId = `room-demo-${Date.now()}`;
      const newDemoRoom: Room = {
        id: demoId,
        family_id: family.id || 'demo-family',
        name: trimmedName,
        type: data.type,
        icon: resolvedIcon,
        color: resolvedColor,
        active: true,
        createdAt: now,
        updatedAt: now,
        created_at: now,
        updated_at: now
      };
      setRooms(prev => [...prev, newDemoRoom]);
      return newDemoRoom;
    }

    const roomRef = doc(collection(db, 'families', authFamily.id, 'rooms'));
    const newRoom: Room = {
      id: roomRef.id,
      family_id: authFamily.id,
      name: trimmedName,
      type: data.type,
      icon: resolvedIcon,
      color: resolvedColor,
      active: true,
      createdAt: now,
      updatedAt: now,
      created_at: now,
      updated_at: now
    };

    const payload = FirestoreMappers.fromRoom(newRoom);
    await setDoc(roomRef, payload);

    setRooms(prev => {
      const exists = prev.some(r => r.id === newRoom.id);
      if (exists) return prev.map(r => r.id === newRoom.id ? newRoom : r);
      return [...prev, newRoom];
    });

    return newRoom;
  };

  const updateRoom = async (
    roomId: string, 
    updates: { name?: string; type?: string; icon?: string; color?: string }
  ): Promise<void> => {
    if (!roomId) throw new Error('ID do ambiente é obrigatório para atualização.');

    const cleanUpdates: Partial<Room> = {};
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (!trimmed) throw new Error('O nome do ambiente não pode ser vazio.');
      if (trimmed.length > 40) throw new Error('O nome do ambiente não pode exceder 40 caracteres.');
      cleanUpdates.name = trimmed;
    }
    if (updates.type !== undefined) {
      if (!isValidRoomType(updates.type)) {
        throw new Error(`Tipo de ambiente inválido: "${updates.type}".`);
      }
      cleanUpdates.type = updates.type;
    }
    if (updates.icon !== undefined) {
      cleanUpdates.icon = updates.icon;
    }
    if (updates.color !== undefined) {
      cleanUpdates.color = updates.color;
    }

    const now = new Date().toISOString();
    cleanUpdates.updatedAt = now;
    cleanUpdates.updated_at = now;

    if (isDemoMode || !authFamily) {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...cleanUpdates } : r));
      return;
    }

    const roomRef = doc(db, 'families', authFamily.id, 'rooms', roomId);
    const firestorePayload: Record<string, any> = {
      updatedAt: now,
      updated_at: now
    };
    if (cleanUpdates.name !== undefined) firestorePayload.name = cleanUpdates.name;
    if (cleanUpdates.type !== undefined) firestorePayload.type = cleanUpdates.type;
    if (cleanUpdates.icon !== undefined) firestorePayload.icon = cleanUpdates.icon;
    if (cleanUpdates.color !== undefined) firestorePayload.color = cleanUpdates.color;

    await updateDoc(roomRef, firestorePayload);

    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...cleanUpdates } : r));
  };

  const deactivateRoom = async (roomId: string): Promise<void> => {
    if (!roomId) return;
    const now = new Date().toISOString();

    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, active: false, updatedAt: now, updated_at: now } : r));

    // STAB-002: Soft-deactivate any active FamilyTasks attached to this deactivated room
    // Completed tasks remain immutable with their existing historical records
    setFamilyTasks(prev => prev.map(ft => {
      const isRoomMatch = ft.roomId === roomId || (ft as any).room_id === roomId;
      if (isRoomMatch && ft.active !== false) {
        return { ...ft, active: false, updatedAt: now, updated_at: now };
      }
      return ft;
    }));

    if (!isDemoMode && authFamily) {
      try {
        const roomRef = doc(db, 'families', authFamily.id, 'rooms', roomId);
        await updateDoc(roomRef, {
          active: false,
          updatedAt: now,
          updated_at: now
        });
      } catch (err) {
        console.warn('Could not deactivate room in Firestore:', err);
      }
    }
  };

  const reactivateRoom = async (roomId: string): Promise<void> => {
    if (!roomId) return;
    const now = new Date().toISOString();

    if (isDemoMode || !authFamily) {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, active: true, updatedAt: now, updated_at: now } : r));
      return;
    }

    const roomRef = doc(db, 'families', authFamily.id, 'rooms', roomId);
    await updateDoc(roomRef, {
      active: true,
      updatedAt: now,
      updated_at: now
    });

    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, active: true, updatedAt: now, updated_at: now } : r));
  };

  const syncRoutineOccurrences = async (routinesOverride?: FamilyTask[]): Promise<void> => {
    const routinesToUse = routinesOverride && routinesOverride.length > 0 ? routinesOverride : familyTasks;
    const existingOccs: TaskAssignment[] = tasks.map(t => ({
      id: t.id,
      family_id: t.familyId || (authFamily?.id || 'fam-demo'),
      task_id: t.taskMasterId || t.id,
      family_task_id: t.familyTaskId || t.id,
      room_id: t.roomId || 'geral',
      member_id: t.assignedMemberId || '',
      scheduled_date: t.dueDate || getTodayDateString(),
      scheduled_start: t.scheduledStart || '09:00',
      scheduled_end: t.scheduledEnd || '09:30',
      status: t.status === 'DONE' ? 'COMPLETED' : (t.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED'),
      is_unassigned: t.isUnassigned ?? (!t.assignedMemberId),
      assigned_reason: t.assignedReason,
      unassigned_reason: t.unassignedReason,
      factors: t.factors,
      completed_at: t.completedAt,
      completed_by: t.completedByMemberId,
      completed_by_name: t.completedByName,
      completion_type: t.completionType
    }));

    const isDemo = isDemoMode || !authFamily;
    const currentFamily = isDemo ? family : authFamily;

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: currentFamily,
      routines: routinesToUse,
      existingAssignments: existingOccs,
      isDemoMode: isDemo
    });

    const updatedTasks: Task[] = syncResult.allAssignments.map(asg => {
      const master = allMasterTasks.find(tm => tm.id === asg.task_id);
      const roomObj = rooms.find(r => r.id === asg.room_id);
      const fallbackRoomType = master?.room_type || 'geral';
      const ft = routinesToUse.find(f => f.id === asg.family_task_id || f.id === (asg as any).familyTaskId);
      const displayTitle = ft?.customTitle ?? ft?.custom_title ?? master?.name ?? asg.task_id;
      const displayDescription = ft?.customDescription ?? ft?.custom_description ?? master?.description ?? '';
      return {
        id: asg.id,
        familyId: asg.family_id,
        title: displayTitle,
        description: displayDescription,
        taskMasterId: asg.task_id,
        familyTaskId: asg.family_task_id,
        assignedMemberId: asg.is_unassigned ? '' : asg.member_id,
        assigneeId: asg.is_unassigned ? '' : asg.member_id,
        assigneeName: asg.is_unassigned ? 'Não atribuído' : (members.find(m => m.id === asg.member_id)?.name || 'Não atribuído'),
        status: asg.status === 'COMPLETED' ? 'DONE' : (asg.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'),
        dueDate: asg.scheduled_date || getTodayDateString(),
        scheduledStart: asg.scheduled_start,
        scheduledEnd: asg.scheduled_end,
        assignedReason: asg.assigned_reason,
        unassignedReason: asg.unassigned_reason,
        isUnassigned: asg.is_unassigned,
        factors: asg.factors,
        frequency: (ft?.frequency as any) || 'DAILY',
        effort: master?.effort_level ? master.effort_level * 5 : 10,
        durationMinutes: master?.duration_minutes || 20,
        category: master?.category || 'cleaning',
        roomId: asg.room_id || fallbackRoomType,
        roomName: roomObj?.name || fallbackRoomType,
        completedAt: asg.completed_at,
        completedByMemberId: asg.completed_by,
        completedByName: asg.completed_by_name,
        completionType: asg.completion_type,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
    setTasks(updatedTasks);
  };

  const syncRollingRoutines = async (routinesOverride?: FamilyTask[]): Promise<void> => {
    // Sincronização padrão canônica: gera ocorrências puras sem distribuir (HOTFIX-TASK-CREATE-1-R2D)
    await syncRoutineOccurrences(routinesOverride);
  };

  const addRoutine = async (data: Partial<FamilyTask>): Promise<FamilyTask> => {
    if (currentMember && currentMember.role && currentMember.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar rotinas da família.');
    }
    const now = new Date().toISOString();
    const familyId = authFamily?.id || family.id || 'fam-demo';
    const targetTmId = data.task_master_id || data.taskMasterId || data.task_id || data.taskId;

    // HOTFIX-DUP-1: Invariante canônica: única rotina por task_master_id
    const existingIndex = familyTasks.findIndex(ft => {
      const ftTmId = ft.task_master_id || ft.taskMasterId || ft.task_id || ft.taskId;
      return targetTmId && ftTmId === targetTmId;
    });

    if (existingIndex >= 0) {
      const existing = familyTasks[existingIndex];
      if (existing.active) {
        return existing;
      }
      // Reativar a rotina existente preservando seu ID canônico
      const reactivated: FamilyTask = {
        ...existing,
        ...data,
        id: existing.id,
        active: true,
        updated_at: now,
        updatedAt: now
      };
      if (!isDemoMode && db && authFamily) {
        const ref = doc(db, 'families', authFamily.id, 'familyTasks', existing.id);
        await setDoc(ref, FirestoreMappers.fromFamilyTask(reactivated));
      }
      setFamilyTasks(prev => {
        const next = [...prev];
        next[existingIndex] = reactivated;
        return next;
      });
      return reactivated;
    }

    const routineId = isDemoMode || !authFamily ? `ft-demo-${Date.now()}` : doc(collection(db, 'families', familyId, 'familyTasks')).id;
    const customTitle = data.customTitle || data.custom_title || data.name;
    const customDesc = data.customDescription || data.custom_description;
    const newRoutine: FamilyTask = {
      id: routineId,
      family_id: familyId,
      familyId: familyId,
      task_id: data.task_id || data.taskId || targetTmId || routineId,
      task_master_id: targetTmId || (null as any),
      taskMasterId: targetTmId || (null as any),
      name: customTitle || data.name || 'Rotina',
      customTitle: customTitle,
      custom_title: customTitle,
      customDescription: customDesc,
      custom_description: customDesc,
      frequency: data.frequency || 'DAILY',
      preferred_days: data.preferred_days || data.preferredDays || [0, 1, 2, 3, 4, 5, 6],
      preferred_time: data.preferred_time || data.preferredTime || '09:00',
      preferredTime: data.preferred_time || data.preferredTime || '09:00',
      room_id: data.room_id || data.roomId || 'geral',
      roomId: data.room_id || data.roomId || 'geral',
      active: true,
      chaosEligible: data.chaosEligible === true,
      start_date: data.start_date || (data as any).startDate || getFamilyLocalDate(family.timezone),
      startDate: data.start_date || (data as any).startDate || getFamilyLocalDate(family.timezone),
      created_at: now,
      createdAt: now,
      updated_at: now,
      updatedAt: now
    };

    if (!isDemoMode && db && authFamily) {
      const ref = doc(db, 'families', authFamily.id, 'familyTasks', routineId);
      await setDoc(ref, FirestoreMappers.fromFamilyTask(newRoutine));
    }

    setFamilyTasks(prev => [...prev, newRoutine]);
    return newRoutine;
  };

  const updateRoutine = async (routineId: string, updates: Partial<FamilyTask>): Promise<void> => {
    if (currentMember && currentMember.role && currentMember.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar rotinas da família.');
    }
    const familyId = authFamily?.id || family.id || 'fam-demo';
    const existingOccs: TaskAssignment[] = tasks.map(t => ({
      id: t.id,
      family_id: t.familyId || familyId,
      task_id: t.taskMasterId || t.id,
      family_task_id: t.familyTaskId || t.id,
      room_id: t.roomId || 'geral',
      member_id: t.assignedMemberId || '',
      scheduled_date: t.dueDate || getTodayDateString(),
      scheduled_start: t.scheduledStart || '09:00',
      scheduled_end: t.scheduledEnd || '09:30',
      status: t.status === 'DONE' ? 'COMPLETED' : (t.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED'),
      is_unassigned: t.isUnassigned ?? (!t.assignedMemberId),
      assigned_reason: t.assignedReason,
      unassigned_reason: t.unassignedReason,
      factors: t.factors
    }));

    const result = await RoutineContinuityService.updateRoutine({
      familyId,
      routineId,
      updates,
      existingRoutines: familyTasks,
      existingAssignments: existingOccs,
      isDemoMode: isDemoMode || !authFamily,
      timezone: family.timezone
    });

    setFamilyTasks(prev => prev.map(r => r.id === routineId ? result.updatedRoutine : r));
    // Reflete alterações nas tarefas de UI (horário, ambiente, e customTitle/customDescription)
    const affectedMap = new Map(result.affectedAssignments.map(a => [a.id, a]));
    setTasks(prev => prev.map(t => {
      const isRoutineTask = t.familyTaskId === routineId;
      const aff = affectedMap.get(t.id);
      if (!aff && !isRoutineTask) return t;

      const master = allMasterTasks.find(tm => tm.id === t.taskMasterId);
      const isCompleted = t.status === 'DONE' || (t.status as string) === 'COMPLETED';
      const resolvedTitle = result.updatedRoutine.customTitle ?? result.updatedRoutine.custom_title ?? master?.name ?? t.title;
      const resolvedDescription = result.updatedRoutine.customDescription ?? result.updatedRoutine.custom_description ?? master?.description ?? t.description;

      return {
        ...t,
        title: isCompleted ? t.title : resolvedTitle,
        description: isCompleted ? t.description : resolvedDescription,
        status: aff && aff.status === 'CANCELLED' ? 'CANCELLED' : t.status,
        scheduledStart: aff?.scheduled_start || t.scheduledStart,
        roomId: aff?.room_id || (result.updatedRoutine.room_id || result.updatedRoutine.roomId) || t.roomId
      };
    }));
  };

  const deactivateRoutine = async (routineId: string): Promise<void> => {
    if (currentMember && currentMember.role && currentMember.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar rotinas da família.');
    }
    const familyId = authFamily?.id || family.id || 'fam-demo';
    const existingOccs: TaskAssignment[] = tasks.map(t => ({
      id: t.id,
      family_id: t.familyId || familyId,
      task_id: t.taskMasterId || t.id,
      family_task_id: t.familyTaskId || t.id,
      room_id: t.roomId || 'geral',
      member_id: t.assignedMemberId || '',
      scheduled_date: t.dueDate || getTodayDateString(),
      scheduled_start: t.scheduledStart || '09:00',
      scheduled_end: t.scheduledEnd || '09:30',
      status: t.status === 'DONE' ? 'COMPLETED' : (t.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED'),
      is_unassigned: t.isUnassigned ?? (!t.assignedMemberId),
      assigned_reason: t.assignedReason,
      unassigned_reason: t.unassignedReason,
      factors: t.factors
    }));

    const result = await RoutineContinuityService.deactivateRoutine({
      familyId,
      routineId,
      existingRoutines: familyTasks,
      existingAssignments: existingOccs,
      isDemoMode: isDemoMode || !authFamily,
      timezone: family.timezone
    });

    setFamilyTasks(prev => prev.map(r => r.id === routineId ? result.deactivatedRoutine : r));
    const cancelledMap = new Map(result.cancelledAssignments.map(a => [a.id, a]));
    const targetTmId = result.deactivatedRoutine.task_master_id || (result.deactivatedRoutine as any).taskMasterId;
    const today = getFamilyLocalDate(family.timezone);

    setTasks(prev => prev.map(t => {
      const isMatch = 
        cancelledMap.has(t.id) ||
        t.familyTaskId === routineId ||
        (t.id && t.id.startsWith(`${routineId}_`)) ||
        (targetTmId && t.taskMasterId === targetTmId);

      const tDate = t.dueDate || t.scheduledDate || '';
      if (isMatch && tDate >= today) {
        if (t.status === 'DONE' || (t.status as string) === 'COMPLETED' || t.status === 'IN_PROGRESS') {
          return t;
        }
        return { ...t, status: 'CANCELLED' };
      }
      return t;
    }));
  };

  const reactivateRoutine = async (routineId: string): Promise<void> => {
    if (currentMember && currentMember.role && currentMember.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar rotinas da família.');
    }
    const familyId = authFamily?.id || family.id || 'fam-demo';
    const existingOccs: TaskAssignment[] = tasks.map(t => ({
      id: t.id,
      family_id: t.familyId || familyId,
      task_id: t.taskMasterId || t.id,
      family_task_id: t.familyTaskId || t.id,
      room_id: t.roomId || 'geral',
      member_id: t.assignedMemberId || '',
      scheduled_date: t.dueDate || getTodayDateString(),
      scheduled_start: t.scheduledStart || '09:00',
      scheduled_end: t.scheduledEnd || '09:30',
      status: t.status === 'DONE' ? 'COMPLETED' : (t.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED'),
      is_unassigned: t.isUnassigned ?? (!t.assignedMemberId),
      assigned_reason: t.assignedReason,
      unassigned_reason: t.unassignedReason,
      factors: t.factors
    }));

    const result = await RoutineContinuityService.reactivateRoutine({
      familyId,
      routineId,
      existingRoutines: familyTasks,
      existingAssignments: existingOccs,
      isDemoMode: isDemoMode || !authFamily,
      timezone: family.timezone
    });

    setFamilyTasks(prev => prev.map(r => r.id === routineId ? result.reactivatedRoutine : r));
    const restoredMap = new Map(result.restoredAssignments.map(a => [a.id, a]));
    const restoredDates = new Set(result.restoredAssignments.map(a => a.scheduled_date));
    setTasks(prev => prev.map(t => {
      if (restoredMap.has(t.id)) {
        return { ...t, status: 'PENDING' };
      }
      const tDate = t.dueDate || t.scheduledDate;
      if (t.status === 'CANCELLED' && t.familyTaskId === routineId && tDate && restoredDates.has(tDate)) {
        return { ...t, status: 'PENDING' };
      }
      return t;
    }));

    if (result.newAssignments.length > 0) {
      const newTasks: Task[] = result.newAssignments.map(asg => {
        const master = allMasterTasks.find(tm => tm.id === asg.task_id);
        const roomObj = rooms.find(r => r.id === asg.room_id);
        const fallbackRoomType = master?.room_type || 'geral';
        const ft = result.reactivatedRoutine;
        const displayTitle = ft.customTitle ?? ft.custom_title ?? master?.name ?? asg.task_id;
        const displayDescription = ft.customDescription ?? ft.custom_description ?? master?.description ?? '';
        return {
          id: asg.id,
          familyId: asg.family_id,
          title: displayTitle,
          description: displayDescription,
          taskMasterId: asg.task_id,
          familyTaskId: asg.family_task_id,
          assignedMemberId: '',
          assigneeId: '',
          status: 'PENDING',
          dueDate: asg.scheduled_date || getTodayDateString(),
          scheduledStart: asg.scheduled_start,
          scheduledEnd: asg.scheduled_end,
          isUnassigned: true,
          frequency: 'DAILY',
          effort: master?.effort_level ? master.effort_level * 5 : 10,
          durationMinutes: master?.duration_minutes || 20,
          category: master?.category || 'cleaning',
          roomId: asg.room_id || fallbackRoomType,
          roomName: roomObj?.name || fallbackRoomType,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      });
      setTasks(prev => [...prev, ...newTasks]);
    }
  };

  const batchAddRoutines = async (items: BatchAddRoutineInput[]): Promise<BatchAddResult> => {
    if (currentMember && currentMember.role && currentMember.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar rotinas da família.');
    }
    const familyId = authFamily?.id || family.id || 'fam-demo';
    const now = new Date().toISOString();
    const today = getFamilyLocalDate(family.timezone);

    let addedCount = 0;
    let reactivatedCount = 0;
    let skippedCount = 0;
    const failed: string[] = [];

    const currentRoutines = [...familyTasks];

    for (const item of items) {
      try {
        const existingIndex = currentRoutines.findIndex(
          ft => (ft.task_master_id === item.taskMasterId || ft.taskMasterId === item.taskMasterId || ft.task_id === item.taskMasterId || ft.taskId === item.taskMasterId)
        );

        if (existingIndex >= 0) {
          const existing = currentRoutines[existingIndex];
          if (existing.active) {
            skippedCount++;
            continue;
          }

          // Reactivate existing FamilyTask: REUSE SAME ID!
          const reactivated: FamilyTask = {
            ...existing,
            active: true,
            room_id: item.roomId || existing.room_id || existing.roomId || 'geral',
            roomId: item.roomId || existing.roomId || existing.room_id || 'geral',
            frequency: item.frequency || existing.frequency || 'DAILY',
            preferred_days: item.preferredDays || existing.preferred_days || existing.preferredDays || [],
            preferredDays: item.preferredDays || existing.preferredDays || existing.preferred_days || [],
            day_of_month: item.dayOfMonth ?? existing.day_of_month ?? existing.dayOfMonth,
            dayOfMonth: item.dayOfMonth ?? existing.dayOfMonth ?? existing.day_of_month,
            preferred_time: item.preferredTime || existing.preferred_time || existing.preferredTime || '09:00',
            preferredTime: item.preferredTime || existing.preferredTime || existing.preferred_time || '09:00',
            start_date: item.startDate || today,
            startDate: item.startDate || today,
            updated_at: now,
            updatedAt: now
          };

          if (!isDemoMode && db && authFamily) {
            const ref = doc(db, 'families', authFamily.id, 'familyTasks', existing.id);
            await setDoc(ref, FirestoreMappers.fromFamilyTask(reactivated));
          }

          currentRoutines[existingIndex] = reactivated;
          reactivatedCount++;
        } else {
          // Create new canonical FamilyTask
          const routineId = isDemoMode || !authFamily ? `ft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : doc(collection(db, 'families', familyId, 'familyTasks')).id;
          const newRoutine: FamilyTask = {
            id: routineId,
            family_id: familyId,
            familyId,
            task_id: item.taskMasterId,
            taskId: item.taskMasterId,
            task_master_id: item.taskMasterId,
            taskMasterId: item.taskMasterId,
            name: item.name,
            category: item.category,
            room_id: item.roomId || 'geral',
            roomId: item.roomId || 'geral',
            frequency: item.frequency || 'DAILY',
            preferred_days: item.preferredDays || (item.frequency === 'WEEKLY' ? [1] : []),
            preferredDays: item.preferredDays || (item.frequency === 'WEEKLY' ? [1] : []),
            day_of_month: item.dayOfMonth,
            dayOfMonth: item.dayOfMonth,
            preferred_time: item.preferredTime || '09:00',
            preferredTime: item.preferredTime || '09:00',
            active: true,
            start_date: item.startDate || today,
            startDate: item.startDate || today,
            created_at: now,
            createdAt: now,
            updated_at: now,
            updatedAt: now
          };

          if (!isDemoMode && db && authFamily) {
            const ref = doc(db, 'families', authFamily.id, 'familyTasks', routineId);
            await setDoc(ref, FirestoreMappers.fromFamilyTask(newRoutine));
          }

          currentRoutines.push(newRoutine);
          addedCount++;
        }
      } catch (err: any) {
        failed.push(item.taskMasterId);
      }
    }

    setFamilyTasks(currentRoutines);

    // Call syncRollingRoutines to immediately generate occurrences in 15-day horizon
    try {
      const existingOccs: TaskAssignment[] = tasks.map(t => ({
        id: t.id,
        family_id: t.familyId || familyId,
        task_id: t.taskMasterId || t.id,
        family_task_id: t.familyTaskId || t.id,
        room_id: t.roomId || 'geral',
        member_id: t.assignedMemberId || '',
        scheduled_date: t.dueDate || getTodayDateString(),
        scheduled_start: t.scheduledStart || '09:00',
        scheduled_end: t.scheduledEnd || '09:30',
        status: t.status === 'DONE' ? 'COMPLETED' : (t.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED'),
        is_unassigned: t.isUnassigned ?? (!t.assignedMemberId),
        assigned_reason: t.assignedReason,
        unassigned_reason: t.unassignedReason,
        factors: t.factors
      }));

      const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
        family: isDemoMode || !authFamily ? { id: familyId, timezone: family.timezone } as Family : authFamily,
        routines: currentRoutines,
        existingAssignments: existingOccs,
        isDemoMode: isDemoMode || !authFamily
      });

      const list: Task[] = syncResult.allAssignments.map(asg => {
        const master = allMasterTasks.find(tm => tm.id === asg.task_id);
        const roomObj = rooms.find(r => r.id === asg.room_id);
        const fallbackRoomType = master?.room_type || 'geral';
        const ft = currentRoutines.find(f => f.id === asg.family_task_id || f.id === (asg as any).familyTaskId);
        const displayTitle = ft?.customTitle ?? ft?.custom_title ?? master?.name ?? asg.task_id;
        const displayDescription = ft?.customDescription ?? ft?.custom_description ?? master?.description ?? '';
        return {
          id: asg.id,
          familyId: asg.family_id,
          title: displayTitle,
          description: displayDescription,
          taskMasterId: asg.task_id,
          familyTaskId: asg.family_task_id,
          assignedMemberId: asg.is_unassigned ? '' : asg.member_id,
          assigneeId: asg.is_unassigned ? '' : asg.member_id,
          status: asg.status === 'COMPLETED' ? 'DONE' : (asg.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'),
          dueDate: asg.scheduled_date || getTodayDateString(),
          scheduledStart: asg.scheduled_start,
          scheduledEnd: asg.scheduled_end,
          assignedReason: asg.assigned_reason,
          unassignedReason: asg.unassigned_reason,
          isUnassigned: asg.is_unassigned,
          factors: asg.factors,
          frequency: 'DAILY',
          effort: master?.effort_level ? master.effort_level * 5 : 10,
          durationMinutes: master?.duration_minutes || 20,
          category: master?.category || 'cleaning',
          roomId: asg.room_id || fallbackRoomType,
          roomName: roomObj?.name || fallbackRoomType,
          completedAt: asg.completed_at,
          completedByMemberId: asg.completed_by,
          completedByName: asg.completed_by_name,
          completionType: asg.completion_type,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      });
      setTasks(list);
    } catch (syncErr) {
      console.warn('Could not sync rolling routines after batch add:', syncErr);
    }

    return { added: addedCount, reactivated: reactivatedCount, skipped: skippedCount, failed };
  };

  const batchDeactivateRoutines = async (routineIds: string[]): Promise<BatchDeactivateResult> => {
    if (currentMember && currentMember.role && currentMember.role !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar rotinas da família.');
    }
    let deactivatedCount = 0;
    const failed: string[] = [];

    for (const routineId of routineIds) {
      try {
        await deactivateRoutine(routineId);
        deactivatedCount++;
      } catch (err: any) {
        failed.push(routineId);
      }
    }

    return { deactivated: deactivatedCount, failed };
  };

  return (
    <AppContext.Provider
      value={{
        currentView,
        setCurrentView,
        selectedDate,
        setSelectedDate,
        family,
        members,
        activeMembers,
        getActiveMembers: (list?: Member[]) => (list ? getActiveMembers(list) : activeMembers),
        rooms,
        tasks,
        protectedTimes,
        familyTasks,
        syncRollingRoutines,
        syncRoutineOccurrences,
        addRoutine,
        updateRoutine,
        deactivateRoutine,
        reactivateRoutine,
        batchAddRoutines,
        batchDeactivateRoutines,
        isDemoMode,
        isOnboarding,
        setIsOnboarding,
        isDevSimulatorOpen,
        openDevSimulator: () => setIsDevSimulatorOpen(true),
        closeDevSimulator: () => setIsDevSimulatorOpen(false),
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        isCreateFamilyModalOpen,
        openCreateFamilyModal: () => {
          if (!isDemoMode && currentMember && currentMember.role !== 'ADMIN') {
            return; // MEMBER-RBAC-1A: bloqueado para MEMBER
          }
          setIsCreateFamilyModalOpen(true);
        },
        closeCreateFamilyModal: () => setIsCreateFamilyModalOpen(false),
        isFamilySelectorOpen,
        openFamilySelector: () => setIsFamilySelectorOpen(true),
        closeFamilySelector: () => setIsFamilySelectorOpen(false),
        isMemberProfileModalOpen,
        activeMemberForProfile,
        openMemberProfile,
        closeMemberProfile,
        updateMemberProfile,
        loadProtectedTimes,
        addProtectedTime,
        updateProtectedTime,
        deleteProtectedTime,
        loadRealRooms,
        addRoom,
        updateRoom,
        deactivateRoom,
        reactivateRoom,
        cloudSyncStatus,
        loadDemoFamily,
        currentMember,
        completeTask,
        completeTaskDetailed,
        addTask,
        updateTask,
        deleteTask,
        addMember,
        updateMemberRole,
        removeMember,
        deactivateMember,
        reactivateMember,
        activeTaskForExecution,
        setActiveTaskForExecution,
        activeTaskForInspect,
        setActiveTaskForInspect,
        activeTaskForReschedule,
        setActiveTaskForReschedule,
        isBlitzModalOpen,
        setIsBlitzModalOpen,
        isChaosModalOpen,
        setIsChaosModalOpen,
        openChaosModal: () => {
          setIsChaosModalOpen(true);
          setIsBlitzModalOpen(true);
        },
        closeChaosModal: () => {
          setIsChaosModalOpen(false);
          setIsBlitzModalOpen(false);
        },
        isRebalanceModalOpen,
        setIsRebalanceModalOpen,
        rebalanceTasksWithEngine,
        applyRebalanceUpdates,
        assignTaskManually,
        activeChaosSession,
        loadActiveChaosSession,
        setActiveChaosSession
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
