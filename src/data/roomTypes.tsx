import React from 'react';
import {
  Utensils,
  Sofa,
  Coffee,
  Bed,
  Bath,
  Shirt,
  Sun,
  Car,
  Trees,
  Briefcase,
  Archive,
  Layers,
  Compass,
  Home,
  Box,
  LucideIcon
} from 'lucide-react';

export const CANONICAL_ROOM_TYPES = [
  'kitchen',
  'living_room',
  'dining_room',
  'bedroom',
  'bathroom',
  'laundry',
  'balcony',
  'garage',
  'backyard',
  'office',
  'pantry',
  'closet',
  'outdoor',
  'household_management',
  'other'
] as const;

export type CanonicalRoomType = (typeof CANONICAL_ROOM_TYPES)[number];

export function isValidRoomType(type: string): type is CanonicalRoomType {
  return (CANONICAL_ROOM_TYPES as readonly string[]).includes(type);
}

export interface RoomTypeOption {
  key: CanonicalRoomType;
  label: string;
  icon: string;
  defaultColor: string;
  description: string;
}

export const ROOM_TYPE_OPTIONS: RoomTypeOption[] = [
  { key: 'kitchen', label: 'Cozinha', icon: 'Utensils', defaultColor: '#F59E0B', description: 'Preparo de refeições, louças e mantimentos' },
  { key: 'living_room', label: 'Sala de Estar', icon: 'Sofa', defaultColor: '#3B82F6', description: 'Convívio familiar, TV e descanso' },
  { key: 'dining_room', label: 'Sala de Jantar', icon: 'Coffee', defaultColor: '#8B5CF6', description: 'Mesa de jantar e refeições em família' },
  { key: 'bedroom', label: 'Quarto', icon: 'Bed', defaultColor: '#EC4899', description: 'Dormitório, roupas de cama e organização pessoal' },
  { key: 'bathroom', label: 'Banheiro', icon: 'Bath', defaultColor: '#06B6D4', description: 'Higiene pessoal, toalhas e sanitários' },
  { key: 'laundry', label: 'Lavanderia', icon: 'Shirt', defaultColor: '#10B981', description: 'Lavagem de roupas, secagem e produtos de limpeza' },
  { key: 'balcony', label: 'Varanda / Sacada', icon: 'Sun', defaultColor: '#F97316', description: 'Área aberta de relaxamento e ventilação' },
  { key: 'garage', label: 'Garagem', icon: 'Car', defaultColor: '#6B7280', description: 'Estacionamento, ferramentas e oficina' },
  { key: 'backyard', label: 'Quintal / Jardim', icon: 'Trees', defaultColor: '#84CC16', description: 'Área externa, plantas e lazer ao ar livre' },
  { key: 'office', label: 'Escritório / Home Office', icon: 'Briefcase', defaultColor: '#6366F1', description: 'Trabalho, estudos e computadores' },
  { key: 'pantry', label: 'Despensa', icon: 'Archive', defaultColor: '#D97706', description: 'Armazenamento de alimentos e suprimentos' },
  { key: 'closet', label: 'Closet', icon: 'Layers', defaultColor: '#A855F7', description: 'Guarda-roupas e calçados' },
  { key: 'outdoor', label: 'Área Externa', icon: 'Compass', defaultColor: '#14B8A6', description: 'Calçadas, portão e acessos externos' },
  { key: 'household_management', label: 'Toda a Casa (Geral)', icon: 'Home', defaultColor: '#64748B', description: 'Tarefas que abrangem múltiplos ambientes' },
  { key: 'other', label: 'Outro', icon: 'Box', defaultColor: '#94A3B8', description: 'Outro cômodo ou espaço específico' }
];

export const ROOM_TYPE_LABELS: Record<CanonicalRoomType, string> = ROOM_TYPE_OPTIONS.reduce((acc, opt) => {
  acc[opt.key] = opt.label;
  return acc;
}, {} as Record<CanonicalRoomType, string>);

export const ROOM_ICON_MAP: Record<string, LucideIcon> = {
  Utensils,
  Sofa,
  Coffee,
  Bed,
  Bath,
  Shirt,
  Sun,
  Car,
  Trees,
  Briefcase,
  Archive,
  Layers,
  Compass,
  Home,
  Box
};

export const QUICK_ADD_SUGGESTIONS: Array<{ label: string; name: string; type: CanonicalRoomType }> = [
  { label: '+ Cozinha', name: 'Cozinha', type: 'kitchen' },
  { label: '+ Sala de Estar', name: 'Sala de Estar', type: 'living_room' },
  { label: '+ Banheiro', name: 'Banheiro Social', type: 'bathroom' },
  { label: '+ Quarto', name: 'Quarto', type: 'bedroom' },
  { label: '+ Lavanderia', name: 'Lavanderia', type: 'laundry' },
  { label: '+ Quintal', name: 'Quintal', type: 'backyard' }
];

export interface SafeRoomIconProps {
  iconName?: string;
  roomType?: string;
  className?: string;
}

export const SafeRoomIcon: React.FC<SafeRoomIconProps> = ({ iconName, roomType, className = 'w-5 h-5' }) => {
  // 1. Try explicit icon name from map
  if (iconName && ROOM_ICON_MAP[iconName]) {
    const IconComponent = ROOM_ICON_MAP[iconName];
    return <IconComponent className={className} />;
  }

  // 2. Try default icon associated with the roomType
  if (roomType) {
    const opt = ROOM_TYPE_OPTIONS.find(o => o.key === roomType);
    if (opt && ROOM_ICON_MAP[opt.icon]) {
      const IconComponent = ROOM_ICON_MAP[opt.icon];
      return <IconComponent className={className} />;
    }
  }

  // 3. Fallback to Home
  return <Home className={className} />;
};

/**
 * Normaliza o nome do ambiente para comparações semânticas e prevenção de duplicações.
 * Remove acentos, pontuação, múltiplos espaços e converte para minúsculo.
 */
export function normalizeRoomName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Dicionário canônico de sinonímia e termos correlatos para ambientes em Português.
 */
export const ROOM_TYPE_SYNONYMS: Record<CanonicalRoomType, readonly string[]> = {
  kitchen: ['cozinha', 'copa', 'coz'],
  living_room: ['sala', 'sala de estar', 'salao', 'salão', 'living', 'estar', 'sala de tv'],
  dining_room: ['sala de jantar', 'jantar', 'refeicoes', 'refeições'],
  bedroom: ['quarto', 'suite', 'suíte', 'dormitorio', 'dormitório', 'quarto 1', 'quarto 2', 'quarto 3'],
  bathroom: ['banheiro', 'lavabo', 'wc', 'sanitario', 'sanitário', 'banho', 'bwc'],
  laundry: ['lavanderia', 'area de servico', 'área de serviço', 'servico', 'serviço', 'lavand'],
  balcony: ['varanda', 'sacada', 'area gourmet', 'área gourmet', 'gourmet', 'terraco', 'terraço'],
  garage: ['garagem', 'estacionamento', 'vaga', 'box'],
  backyard: ['quintal', 'jardim', 'gramado', 'horta'],
  office: ['escritorio', 'escritório', 'home office', 'estudo', 'gabinete', 'biblioteca'],
  pantry: ['despensa', 'dispensa', 'mantimentos'],
  closet: ['closet', 'vestiario', 'vestiário'],
  outdoor: ['area externa', 'área externa', 'patio', 'pátio', 'calcada', 'calçada'],
  household_management: ['geral', 'toda a casa', 'casa toda', 'casa'],
  other: ['outro', 'outros', 'espaco', 'espaço']
};

/**
 * Detecta automaticamente o tipo canônico a partir do nome digitado pelo usuário.
 */
export function detectRoomTypeFromName(name: string): CanonicalRoomType | null {
  if (!name) return null;
  const normalized = normalizeRoomName(name);
  if (!normalized) return null;

  // 1. Verificação prioritária de termos específicos
  if (normalized.includes('lavabo')) return 'bathroom';
  if (normalized.includes('gourmet')) return 'balcony';
  if (normalized.includes('escritorio')) return 'office';
  if (normalized.includes('homeoffice')) return 'office';
  if (normalized.includes('lavanderia') || normalized.includes('servico')) return 'laundry';
  if (normalized.includes('garagem')) return 'garage';
  if (normalized.includes('quintal') || normalized.includes('jardim')) return 'backyard';
  if (normalized.includes('jantar')) return 'dining_room';
  if (normalized.includes('suite') || normalized.includes('quarto') || normalized.includes('dormitorio')) {
    // Se contiver banheiro junto (ex: "Banheiro da suíte"), é bathroom!
    if (normalized.includes('banheiro') || normalized.includes('banho')) {
      return 'bathroom';
    }
    return 'bedroom';
  }
  if (normalized.includes('banheiro') || normalized.includes('sanitario')) return 'bathroom';
  if (normalized.includes('cozinha') || normalized.includes('copa')) return 'kitchen';
  if (normalized.includes('sala') || normalized.includes('salao')) return 'living_room';
  if (normalized.includes('varanda') || normalized.includes('sacada')) return 'balcony';
  if (normalized.includes('despensa') || normalized.includes('dispensa')) return 'pantry';
  if (normalized.includes('closet')) return 'closet';

  // 2. Busca genérica no dicionário de sinonímia
  for (const [key, synonyms] of Object.entries(ROOM_TYPE_SYNONYMS) as Array<[CanonicalRoomType, readonly string[]]>) {
    for (const syn of synonyms) {
      const normSyn = normalizeRoomName(syn);
      if (normalized === normSyn || normalized.includes(normSyn)) {
        return key;
      }
    }
  }

  return null;
}

export interface MatchRoomForTaskResult {
  matchedRoomId?: string;
  isAmbiguous: boolean;
  matchingRooms: Array<{ id: string; name: string; type?: string }>;
}

/**
 * Associa tarefas a ambientes com semântica estrita e rejeição de fallbacks silenciosos.
 * Em casos ambíguos (múltiplos cômodos compatíveis), retorna isAmbiguous: true para exigir escolha explícita.
 */
export function matchRoomForTask(params: {
  taskRoomType?: string;
  activeRooms: Array<{ id: string; name: string; type?: string }>;
}): MatchRoomForTaskResult {
  const { taskRoomType, activeRooms } = params;
  if (!taskRoomType || !activeRooms || activeRooms.length === 0) {
    return { isAmbiguous: false, matchingRooms: [] };
  }

  const rawType = taskRoomType.toLowerCase().trim();
  const synonyms = (ROOM_TYPE_SYNONYMS as Record<string, readonly string[]>)[rawType] || [rawType];

  const matches = activeRooms.filter(r => {
    // 1. Igualdade estrita do tipo canônico
    if (r.type && r.type.toLowerCase() === rawType) return true;

    // 2. Nome contém o tipo canônico
    const normName = r.name.toLowerCase();
    if (normName.includes(rawType)) return true;

    // 3. Nome contém algum sinônimo em português
    return synonyms.some(syn => normName.includes(syn));
  });

  if (matches.length === 1) {
    return { matchedRoomId: matches[0].id, isAmbiguous: false, matchingRooms: matches };
  }

  if (matches.length > 1) {
    // Ambiguidade detectada (ex: casa com Banheiro Social, Suíte e Lavabo)
    return { matchedRoomId: undefined, isAmbiguous: true, matchingRooms: matches };
  }

  // 0 matches: sem fallback silencioso para o primeiro cômodo!
  return { matchedRoomId: undefined, isAmbiguous: false, matchingRooms: [] };
}

export interface CustomRoomNameValidation {
  valid: boolean;
  requiresConfirmation: boolean;
  detectedType: CanonicalRoomType | null;
  reason?: string;
}

/**
 * Valida se um nome personalizado de ambiente diverge da categoria esperada ou é ambíguo,
 * exigindo confirmação explícita antes da gravação (Condição 3 da Fase B).
 */
export function validateCustomRoomName(
  customName: string,
  expectedType: CanonicalRoomType
): CustomRoomNameValidation {
  const trimmed = (customName || '').trim();
  if (!trimmed) {
    return { valid: false, requiresConfirmation: false, detectedType: null, reason: 'O nome do ambiente é obrigatório.' };
  }
  if (trimmed.length > 40) {
    return { valid: false, requiresConfirmation: false, detectedType: null, reason: 'O nome não pode exceder 40 caracteres.' };
  }

  const detected = detectRoomTypeFromName(trimmed);
  if (!detected) {
    return {
      valid: true,
      requiresConfirmation: true,
      detectedType: null,
      reason: 'Não foi possível identificar automaticamente a categoria do cômodo. Confirme que deseja manter este nome.'
    };
  }

  if (detected !== expectedType) {
    const detectedLabel = (ROOM_TYPE_LABELS as any)[detected] || detected;
    const expectedLabel = (ROOM_TYPE_LABELS as any)[expectedType] || expectedType;
    return {
      valid: true,
      requiresConfirmation: true,
      detectedType: detected,
      reason: `O nome parece referir-se a "${detectedLabel}", enquanto a categoria original é "${expectedLabel}". Confirme a associação.`
    };
  }

  return { valid: true, requiresConfirmation: false, detectedType: detected };
}

export interface RoomPresetItem {
  idSuffix: string;
  name: string;
  type: CanonicalRoomType;
  icon: string;
  defaultColor: string;
  description: string;
}

export interface RoomPreset {
  id: string;
  name: string;
  description: string;
  rooms: RoomPresetItem[];
}

/**
 * Preset Canônico "Casa familiar — 3 quartos" (15 ambientes)
 * Reutiliza os tipos canônicos existentes:
 * - Escritório: office
 * - Salão: living_room
 * - Área gourmet: balcony
 * - Suíte: bedroom
 * - Banheiro da suíte: bathroom (independente da Suíte)
 */
export const FAMILY_3_BEDROOMS_PRESET: RoomPreset = {
  id: 'preset-casa-familiar-3-quartos',
  name: 'Casa familiar — 3 quartos',
  description: 'Estrutura completa de 15 ambientes balanceados para famílias com 3 dormitórios, múltiplos banheiros e áreas de lazer.',
  rooms: [
    {
      idSuffix: 'suite',
      name: 'Suíte',
      type: 'bedroom',
      icon: 'Bed',
      defaultColor: '#EC4899',
      description: 'Dormitório principal do casal'
    },
    {
      idSuffix: 'banheiro-suite',
      name: 'Banheiro da suíte',
      type: 'bathroom',
      icon: 'Bath',
      defaultColor: '#06B6D4',
      description: 'Banheiro privativo da suíte'
    },
    {
      idSuffix: 'quarto-2',
      name: 'Quarto 2',
      type: 'bedroom',
      icon: 'Bed',
      defaultColor: '#EC4899',
      description: 'Segundo dormitório (filhos/hóspedes)'
    },
    {
      idSuffix: 'quarto-3',
      name: 'Quarto 3',
      type: 'bedroom',
      icon: 'Bed',
      defaultColor: '#EC4899',
      description: 'Terceiro dormitório (filhos/estudos)'
    },
    {
      idSuffix: 'banheiro-social',
      name: 'Banheiro social',
      type: 'bathroom',
      icon: 'Bath',
      defaultColor: '#06B6D4',
      description: 'Banheiro de uso comum'
    },
    {
      idSuffix: 'lavabo',
      name: 'Lavabo',
      type: 'bathroom',
      icon: 'Bath',
      defaultColor: '#06B6D4',
      description: 'Banheiro social para visitas'
    },
    {
      idSuffix: 'sala',
      name: 'Sala',
      type: 'living_room',
      icon: 'Sofa',
      defaultColor: '#3B82F6',
      description: 'Sala de estar e convivência familiar'
    },
    {
      idSuffix: 'sala-jantar',
      name: 'Sala de jantar',
      type: 'dining_room',
      icon: 'Coffee',
      defaultColor: '#8B5CF6',
      description: 'Mesa de jantar e refeições em família'
    },
    {
      idSuffix: 'cozinha',
      name: 'Cozinha',
      type: 'kitchen',
      icon: 'Utensils',
      defaultColor: '#F59E0B',
      description: 'Preparo de refeições, louças e mantimentos'
    },
    {
      idSuffix: 'lavanderia',
      name: 'Lavanderia',
      type: 'laundry',
      icon: 'Shirt',
      defaultColor: '#10B981',
      description: 'Lavagem de roupas, secagem e produtos de limpeza'
    },
    {
      idSuffix: 'garagem',
      name: 'Garagem',
      type: 'garage',
      icon: 'Car',
      defaultColor: '#6B7280',
      description: 'Estacionamento, ferramentas e oficina'
    },
    {
      idSuffix: 'quintal',
      name: 'Quintal',
      type: 'backyard',
      icon: 'Trees',
      defaultColor: '#84CC16',
      description: 'Área externa, plantas e lazer ao ar livre'
    },
    {
      idSuffix: 'escritorio',
      name: 'Escritório',
      type: 'office',
      icon: 'Briefcase',
      defaultColor: '#6366F1',
      description: 'Trabalho, estudos e computadores'
    },
    {
      idSuffix: 'salao',
      name: 'Salão',
      type: 'living_room',
      icon: 'Sofa',
      defaultColor: '#3B82F6',
      description: 'Espaço de jogos, festas ou convivência'
    },
    {
      idSuffix: 'area-gourmet',
      name: 'Área gourmet',
      type: 'balcony',
      icon: 'Sun',
      defaultColor: '#F97316',
      description: 'Churrasqueira, bancada externa e refeições de lazer'
    }
  ]
};
