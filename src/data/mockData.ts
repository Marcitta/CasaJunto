import { Family, Member, Room, Task, CatalogTemplate, ProtectedTime } from '../types';

export const DEMO_FAMILY: Family = {
  id: 'demo-family-silva',
  name: 'Família Silva',
  ownerUserId: 'demo-user-sofia',
  code: 'SILVA26',
  adminCount: 2,
  memberCount: 4,
  createdAt: '2026-01-10T10:00:00Z',
  updatedAt: '2026-09-01T12:00:00Z'
};

export const DEMO_MEMBERS: Member[] = [
  {
    id: 'mem-sofia',
    familyId: 'demo-family-silva',
    name: 'Sofia Silva',
    role: 'ADMIN',
    avatar: '👩',
    color: '#8c52ff',
    birth_date: '1984-05-12',
    autonomy_level: 4,
    bio: 'Mãe e administradora do lar.',
    points: 145,
    streak: 8,
    tasksCompleted: 24,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z'
  },
  {
    id: 'mem-lucas',
    familyId: 'demo-family-silva',
    name: 'Lucas Silva',
    role: 'ADMIN',
    avatar: '👨',
    color: '#38b6ff',
    birth_date: '1982-11-20',
    autonomy_level: 4,
    bio: 'Pai e focado na organização geral.',
    points: 120,
    streak: 6,
    tasksCompleted: 19,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z'
  },
  {
    id: 'mem-beatriz',
    familyId: 'demo-family-silva',
    name: 'Beatriz',
    role: 'MEMBER',
    avatar: '👧',
    color: '#ff66c4',
    birth_date: '2011-03-15',
    autonomy_level: 3,
    bio: 'Filha mais velha. Estuda pela manhã.',
    points: 90,
    streak: 4,
    tasksCompleted: 14,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z'
  },
  {
    id: 'mem-gabriel',
    familyId: 'demo-family-silva',
    name: 'Gabriel',
    role: 'MEMBER',
    avatar: '👦',
    color: '#ffbd59',
    birth_date: '2016-08-22',
    autonomy_level: 2,
    bio: 'Filho mais novo. Aprendendo a organizar o quarto.',
    points: 80,
    streak: 3,
    tasksCompleted: 11,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z'
  }
];

export const DEMO_PROTECTED_TIMES: ProtectedTime[] = [
  {
    id: 'pt-demo-1',
    family_id: 'demo-family-silva',
    member_id: 'mem-beatriz',
    type: 'school',
    label: 'Escola Estadual (Ensino Médio)',
    day_of_week: [1, 2, 3, 4, 5],
    start_time: '07:30',
    end_time: '13:00',
    active: true
  },
  {
    id: 'pt-demo-2',
    family_id: 'demo-family-silva',
    member_id: 'mem-beatriz',
    type: 'sports',
    label: 'Treino de Vôlei',
    day_of_week: [2, 4],
    start_time: '16:00',
    end_time: '17:30',
    active: true
  },
  {
    id: 'pt-demo-3',
    family_id: 'demo-family-silva',
    member_id: 'mem-gabriel',
    type: 'school',
    label: 'Colégio (Ensino Fundamental)',
    day_of_week: [1, 2, 3, 4, 5],
    start_time: '07:30',
    end_time: '12:30',
    active: true
  },
  {
    id: 'pt-demo-4',
    family_id: 'demo-family-silva',
    member_id: 'mem-lucas',
    type: 'work',
    label: 'Trabalho Comercial',
    day_of_week: [1, 2, 3, 4, 5],
    start_time: '08:30',
    end_time: '17:30',
    active: true
  }
];

export const DEMO_ROOMS: Room[] = [
  { id: 'room-cozinha', name: 'Cozinha', icon: 'UtensilsCrossed', color: '#ffbd59', taskCount: 4 },
  { id: 'room-sala', name: 'Sala de Estar', icon: 'Sofa', color: '#38b6ff', taskCount: 3 },
  { id: 'room-banheiro', name: 'Banheiro Principal', icon: 'Bath', color: '#7ed957', taskCount: 2 },
  { id: 'room-lavanderia', name: 'Área de Serviço', icon: 'Shirt', color: '#545454', taskCount: 3 },
  { id: 'room-quartos', name: 'Quartos', icon: 'Bed', color: '#8c52ff', taskCount: 4 }
];

export const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const DEMO_TASKS: Task[] = [
  {
    id: 'task-1',
    familyId: 'demo-family-silva',
    title: 'Esvaziar e organizar lava-louças',
    description: 'Guardar copos, pratos e talheres limpos',
    roomId: 'room-cozinha',
    roomName: 'Cozinha',
    assigneeId: 'mem-beatriz',
    assigneeName: 'Beatriz',
    assignedMemberId: 'mem-beatriz',
    frequency: 'DAILY',
    effort: 10,
    status: 'PENDING',
    dueDate: getTodayDateString(),
    category: 'kitchen',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T08:00:00Z'
  },
  {
    id: 'task-2',
    familyId: 'demo-family-silva',
    title: 'Retirar lixo orgânico e reciclável',
    description: 'Trocar sacolas plásticas das lixeiras da cozinha e pia',
    roomId: 'room-cozinha',
    roomName: 'Cozinha',
    assigneeId: 'mem-gabriel',
    assigneeName: 'Gabriel',
    assignedMemberId: 'mem-gabriel',
    frequency: 'DAILY',
    effort: 10,
    status: 'PENDING',
    dueDate: getTodayDateString(),
    category: 'cleaning',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T08:00:00Z'
  },
  {
    id: 'task-3',
    familyId: 'demo-family-silva',
    title: 'Passar pano no piso da sala',
    description: 'Remover poeira e aromatizar o ambiente',
    roomId: 'room-sala',
    roomName: 'Sala de Estar',
    assigneeId: 'mem-lucas',
    assigneeName: 'Lucas Silva',
    assignedMemberId: 'mem-lucas',
    frequency: 'WEEKLY',
    effort: 15,
    status: 'PENDING',
    dueDate: getTodayDateString(),
    category: 'cleaning',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T08:00:00Z'
  },
  {
    id: 'task-4',
    familyId: 'demo-family-silva',
    title: 'Estender roupas da máquina de lavar',
    description: 'Centrifugação concluída, estender no varal',
    roomId: 'room-lavanderia',
    roomName: 'Área de Serviço',
    assigneeId: 'mem-sofia',
    assigneeName: 'Sofia Silva',
    assignedMemberId: 'mem-sofia',
    frequency: 'DAILY',
    effort: 15,
    status: 'DONE',
    dueDate: getTodayDateString(),
    completedAt: '2026-09-03T09:30:00Z',
    completedByMemberId: 'mem-sofia',
    completedByName: 'Sofia Silva',
    category: 'laundry',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-03T09:30:00Z'
  },
  {
    id: 'task-5',
    familyId: 'demo-family-silva',
    title: 'Higienizar pia e bancada do banheiro',
    description: 'Usar desinfetante e repor toalha de rosto',
    roomId: 'room-banheiro',
    roomName: 'Banheiro Principal',
    assigneeId: 'mem-beatriz',
    assigneeName: 'Beatriz',
    assignedMemberId: 'mem-beatriz',
    frequency: 'WEEKLY',
    effort: 10,
    status: 'PENDING',
    dueDate: getTodayDateString(),
    category: 'cleaning',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T08:00:00Z'
  }
];

export const CATALOG_TEMPLATES: CatalogTemplate[] = [
  {
    id: 'cat-louca',
    title: 'Lavar e guardar louça',
    description: 'Limpar pia e guardar pratos e copos secos',
    category: 'kitchen',
    defaultRoom: 'Cozinha',
    suggestedFrequency: 'DAILY',
    estimatedMinutes: 15,
    effort: 10
  },
  {
    id: 'cat-lixo',
    title: 'Trocar sacos de lixo',
    description: 'Separar lixo comum e reciclável e levar para fora',
    category: 'cleaning',
    defaultRoom: 'Cozinha',
    suggestedFrequency: 'DAILY',
    estimatedMinutes: 5,
    effort: 5
  },
  {
    id: 'cat-aspirar',
    title: 'Aspirar pó da casa',
    description: 'Aspirar tapetes, estofados e cantos dos cômodos',
    category: 'cleaning',
    defaultRoom: 'Sala de Estar',
    suggestedFrequency: 'WEEKLY',
    estimatedMinutes: 25,
    effort: 20
  },
  {
    id: 'cat-roupa-lavar',
    title: 'Lavar roupas claras',
    description: 'Separar e programar ciclo na máquina de lavar',
    category: 'laundry',
    defaultRoom: 'Área de Serviço',
    suggestedFrequency: 'WEEKLY',
    estimatedMinutes: 15,
    effort: 15
  },
  {
    id: 'cat-banheiro-geral',
    title: 'Limpeza profunda do banheiro',
    description: 'Lavar box, vaso sanitário, piso e azulejos',
    category: 'cleaning',
    defaultRoom: 'Banheiro Principal',
    suggestedFrequency: 'WEEKLY',
    estimatedMinutes: 35,
    effort: 25
  },
  {
    id: 'cat-pets',
    title: 'Alimentar e trocar água dos pets',
    description: 'Repor ração limpa e higienizar potes de água',
    category: 'pets',
    defaultRoom: 'Área de Serviço',
    suggestedFrequency: 'DAILY',
    estimatedMinutes: 5,
    effort: 5
  },
  {
    id: 'cat-geladeira',
    title: 'Limpar prateleiras da geladeira',
    description: 'Descartar vencidos e limpar gavetas de legumes',
    category: 'kitchen',
    defaultRoom: 'Cozinha',
    suggestedFrequency: 'BIWEEKLY',
    estimatedMinutes: 30,
    effort: 20
  },
  {
    id: 'cat-camas',
    title: 'Trocar lençóis e fronhas',
    description: 'Substituir jogos de cama por peças limpas e cheirosas',
    category: 'organization',
    defaultRoom: 'Quartos',
    suggestedFrequency: 'WEEKLY',
    estimatedMinutes: 15,
    effort: 15
  }
];
