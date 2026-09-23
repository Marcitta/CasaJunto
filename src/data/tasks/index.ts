import { TaskMaster } from '../../types';
import { cleaningTasks } from './cleaning';
import { kitchenTasks } from './kitchen';
import { organizationTasks } from './organization';
import { laundryTasks } from './laundry';
import { bathroomTasks } from './bathroom';
import { wasteTasks } from './waste';
import { petsTasks } from './pets';
import { outdoorTasks } from './outdoor';
import { maintenanceTasks } from './maintenance';
import { householdManagementTasks } from './household_management';

export const allMasterTasks: TaskMaster[] = [
  ...cleaningTasks,          // 25
  ...kitchenTasks,           // 25
  ...organizationTasks,      // 20
  ...laundryTasks,           // 15
  ...bathroomTasks,          // 15
  ...wasteTasks,             // 10
  ...petsTasks,              // 10
  ...outdoorTasks,           // 10
  ...maintenanceTasks,       // 10
  ...householdManagementTasks // 10
]; // Total: 150 tasks

export const taskCategoryLabels: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  cleaning: { label: 'Limpeza Geral', icon: '🧹', color: '#5b32a3', bg: '#f4f0fb' },
  kitchen: { label: 'Cozinha & Refeições', icon: '🍳', color: '#947f2b', bg: '#fdf7e3' },
  organization: { label: 'Organização', icon: '📦', color: '#2b4d66', bg: '#e8f4fc' },
  laundry: { label: 'Lavanderia & Roupas', icon: '🧺', color: '#4c875d', bg: '#edf7f0' },
  bathroom: { label: 'Banheiros', icon: '🚿', color: '#387382', bg: '#e4f5f8' },
  waste: { label: 'Lixo & Reciclagem', icon: '♻️', color: '#4a3a0a', bg: '#faf5d8' },
  pets: { label: 'Pets & Cuidados', icon: '🐾', color: '#7a4260', bg: '#fbedf4' },
  outdoor: { label: 'Área Externa & Jardim', icon: '🌱', color: '#366e40', bg: '#eef8ef' },
  maintenance: { label: 'Manutenção & Reparos', icon: '🔧', color: '#545b62', bg: '#f0f1f2' },
  household_management: { label: 'Gestão da Casa', icon: '📋', color: '#43436d', bg: '#f0f0fa' }
};

export const roomTypeLabels: Record<string, string> = {
  kitchen: 'Cozinha',
  living_room: 'Sala de Estar',
  dining_room: 'Sala de Jantar',
  bedroom: 'Quarto',
  bathroom: 'Banheiro',
  laundry: 'Lavanderia',
  balcony: 'Varanda/Sacada',
  garage: 'Garagem',
  backyard: 'Quintal/Jardim',
  office: 'Escritório',
  pantry: 'Despensa',
  closet: 'Closet',
  household_management: 'Toda a Casa',
  outdoor: 'Área Externa',
  other: 'Outro'
};
