import { TaskMaster, Room } from '../../types';
import { normalizeRoomName } from '../../data/roomTypes';

export interface RoomTaskCompatibilityResult {
  isCompatible: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  warning?: string;
}

/**
 * Verifica se um ambiente é do tipo Lavabo (lavabo, meio banheiro, etc.)
 */
export function isLavaboRoom(room: Room): boolean {
  if (!room) return false;
  const normName = normalizeRoomName(room.name || '');
  const normType = (room.type || '').toLowerCase();
  return (
    normName.includes('lavabo') ||
    normType === 'half_bath' ||
    normType === 'lavabo'
  );
}

/**
 * Verifica se uma tarefa envolve equipamentos de banho/box/chuveiro/banheira
 */
export function isBoxOrShowerTask(task: TaskMaster): boolean {
  if (!task) return false;
  const textToSearch = [
    task.name || '',
    task.description || '',
    ...(task.instructions || []),
    ...(task.materials || [])
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const showerKeywords = [
    'box',
    'chuveiro',
    'ducha',
    'banheira',
    'ralo do box',
    'rejunte do box',
    'vidros do box'
  ];

  return showerKeywords.some(keyword => textToSearch.includes(keyword));
}

/**
 * Avalia a compatibilidade de um TaskMaster com um Room específico.
 * Não presume que todos os ambientes possuam os mesmos equipamentos (Fase B.5.3).
 * Retorna se é compatível e se exige confirmação explícita do administrador.
 */
export function checkRoomTaskCompatibility(
  task: TaskMaster,
  room: Room
): RoomTaskCompatibilityResult {
  if (!task || !room) {
    return { isCompatible: true, requiresConfirmation: false };
  }

  // 1. Caso crítico: tarefas de box/chuveiro em Lavabo
  if (isLavaboRoom(room) && isBoxOrShowerTask(task)) {
    return {
      isCompatible: false,
      requiresConfirmation: true,
      reason: 'LAVABO_WITHOUT_SHOWER',
      warning: `O ambiente "${room.name}" é um lavabo e normalmente não possui box ou chuveiro. Confirme se este espaço possui o equipamento antes de prosseguir.`
    };
  }

  // 2. Caso de incompatibilidade evidente entre cômodos de tipos totalmente distintos
  const taskRoomType = (task.room_type || '').toLowerCase();
  const roomType = (room.type || '').toLowerCase();
  const roomNameNorm = normalizeRoomName(room.name || '');

  // Tarefa de Cozinha em Quarto, Banheiro, etc.
  if (taskRoomType === 'kitchen') {
    const isKitchenLike =
      roomType === 'kitchen' ||
      roomType === 'pantry' ||
      roomNameNorm.includes('cozinha') ||
      roomNameNorm.includes('copa') ||
      roomNameNorm.includes('despensa');
    if (!isKitchenLike) {
      return {
        isCompatible: false,
        requiresConfirmation: true,
        reason: 'CATEGORY_MISMATCH',
        warning: `A tarefa "${task.name}" é típica de Cozinha, mas o ambiente "${room.name}" pertence a outra categoria.`
      };
    }
  }

  // Tarefa de Banheiro em Cozinha, Garagem, Quintal, etc.
  if (taskRoomType === 'bathroom') {
    const isBathroomLike =
      roomType === 'bathroom' ||
      roomType === 'half_bath' ||
      roomNameNorm.includes('banheiro') ||
      roomNameNorm.includes('lavabo') ||
      roomNameNorm.includes('suite') ||
      roomNameNorm.includes('wc') ||
      roomNameNorm.includes('sanitario');
    if (!isBathroomLike) {
      return {
        isCompatible: false,
        requiresConfirmation: true,
        reason: 'CATEGORY_MISMATCH',
        warning: `A tarefa "${task.name}" é típica de Banheiro, mas o ambiente "${room.name}" pertence a outra categoria.`
      };
    }
  }

  // Tarefa de Quarto em Banheiro ou Cozinha
  if (taskRoomType === 'bedroom') {
    const isBedroomLike =
      roomType === 'bedroom' ||
      roomType === 'closet' ||
      roomNameNorm.includes('quarto') ||
      roomNameNorm.includes('suite') ||
      roomNameNorm.includes('dormitorio');
    if (!isBedroomLike) {
      return {
        isCompatible: false,
        requiresConfirmation: true,
        reason: 'CATEGORY_MISMATCH',
        warning: `A tarefa "${task.name}" é típica de Quarto, mas o ambiente "${room.name}" pertence a outra categoria.`
      };
    }
  }

  return { isCompatible: true, requiresConfirmation: false };
}
