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
