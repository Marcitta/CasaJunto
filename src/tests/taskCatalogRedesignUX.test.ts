import fs from 'fs';
import path from 'path';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export async function runTaskCatalogRedesignUXTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const taskCatalogPath = path.resolve(process.cwd(), 'src/components/TaskCatalogView.tsx');
  const headerPath = path.resolve(process.cwd(), 'src/components/Header.tsx');
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');

  const taskCatalogContent = fs.readFileSync(taskCatalogPath, 'utf-8');
  const headerContent = fs.readFileSync(headerPath, 'utf-8');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  // UXC01: Single title "Catálogo de Tarefas" in Header, no duplicate visual title in TaskCatalogView
  const hasCatalogTitleInHeader = headerContent.includes("case 'catalog': return 'Catálogo de Tarefas';");
  const noVisualDuplicateInContent = !taskCatalogContent.includes("<h1 className=\"text-xl") &&
    taskCatalogContent.includes('<h1 className="sr-only">Catálogo de Tarefas Domésticas</h1>');
  results.push({
    id: 'UXC01',
    name: 'Título único "Catálogo de Tarefas" no Header e sem duplicação visual no conteúdo',
    passed: hasCatalogTitleInHeader && noVisualDuplicateInContent,
    expected: 'Header define "Catálogo de Tarefas" e TaskCatalogView não duplica visualmente',
    actual: `Header: ${hasCatalogTitleInHeader}, Sem duplicação visual: ${noVisualDuplicateInContent}`
  });

  // UXC02: Subtitle in Header
  const hasSubtitle = headerContent.includes('Encontre e personalize as tarefas da sua casa.') &&
    headerContent.includes("currentView === 'catalog'");
  results.push({
    id: 'UXC02',
    name: 'Subtitle "Encontre e personalize as tarefas da sua casa." no Header',
    passed: hasSubtitle,
    expected: 'Subtítulo presente e contextual ao catálogo',
    actual: hasSubtitle ? 'Subtítulo presente' : 'Subtítulo ausente'
  });

  // UXC03: CTA "Nova tarefa" (with single Plus icon, no duplicate +)
  const hasNewTaskCTA = headerContent.includes('Nova tarefa') && !headerContent.includes('+ Nova tarefa');
  results.push({
    id: 'UXC03',
    name: 'CTA "Nova tarefa" no Header (sem duplicidade de +)',
    passed: hasNewTaskCTA,
    expected: 'CTA "Nova tarefa" no Header com ícone único',
    actual: hasNewTaskCTA ? 'CTA com texto único' : 'CTA ausente ou com duplicidade'
  });

  // UXC04: Equilibrar Carga hidden in catalog view
  const hidesRebalanceInCatalog = headerContent.includes("currentView !== 'catalog'") &&
    headerContent.includes('btn-header-rebalance');
  results.push({
    id: 'UXC04',
    name: 'Botão "Equilibrar Carga" oculto na visão do catálogo',
    passed: hidesRebalanceInCatalog,
    expected: 'currentView !== "catalog" protege btn-header-rebalance',
    actual: hidesRebalanceInCatalog ? 'Oculto no catálogo' : 'Visível indevidamente'
  });

  // UXC05: RightSidebar hidden in catalog view
  const hidesRightSidebar = appContent.includes("currentView !== 'catalog' && <RightSidebar />");
  results.push({
    id: 'UXC05',
    name: 'RightSidebar oculta no catálogo para maximizar área útil (largura total)',
    passed: hidesRightSidebar,
    expected: 'RightSidebar condicional ao catalog',
    actual: hidesRightSidebar ? 'Oculto na visão de catálogo' : 'Visível indevidamente'
  });

  // UXC06: Compact filter toolbar with search and popover toggle
  const hasCompactToolbar = taskCatalogContent.includes('catalog-search') &&
    taskCatalogContent.includes('btn-toggle-filters') &&
    taskCatalogContent.includes('catalog-filter-popover');
  results.push({
    id: 'UXC06',
    name: 'Barra de busca e filtros compacta com painel expansível',
    passed: hasCompactToolbar,
    expected: 'Toolbar compacta com popover/painel expansível de filtros',
    actual: hasCompactToolbar ? 'Toolbar compacta implementada' : 'Toolbar inadequada'
  });

  // UXC07: Status navigation chips (Todas, Na minha casa, Disponíveis)
  const hasStatusChips = taskCatalogContent.includes('chip-status-all') &&
    taskCatalogContent.includes('chip-status-active') &&
    taskCatalogContent.includes('chip-status-available') &&
    taskCatalogContent.includes('totalCount') &&
    taskCatalogContent.includes('activeCount') &&
    taskCatalogContent.includes('availableCount');
  results.push({
    id: 'UXC07',
    name: 'Navegação por chips de status (Todas, Na minha casa, Disponíveis) com contadores',
    passed: hasStatusChips,
    expected: 'Chips de status presentes com contadores dinâmicos',
    actual: hasStatusChips ? 'Chips de status presentes com contadores' : 'Chips ausentes'
  });

  // UXC08: Grid responsiveness (1, 2, 3, 4 columns)
  const hasResponsiveGrid = taskCatalogContent.includes('grid-cols-1') &&
    taskCatalogContent.includes('sm:grid-cols-2') &&
    taskCatalogContent.includes('lg:grid-cols-3') &&
    taskCatalogContent.includes('xl:grid-cols-4');
  results.push({
    id: 'UXC08',
    name: 'Grid responsivo adaptativo (4 colunas xl, 3 colunas lg, 2 colunas sm, 1 coluna mobile)',
    passed: hasResponsiveGrid,
    expected: 'Classes responsivas xl:grid-cols-4, lg:grid-cols-3, sm:grid-cols-2, grid-cols-1',
    actual: hasResponsiveGrid ? 'Grid responsivo configurado' : 'Grid não responsivo'
  });

  // UXC09: Card hierarchy (Name, Room/Category, Short description, Duration/Points, Action)
  const hasCardHierarchy = taskCatalogContent.includes('line-clamp-1') && // title
    taskCatalogContent.includes('line-clamp-2') && // description
    taskCatalogContent.includes('roomLabel') &&
    taskCatalogContent.includes('effortPts');
  results.push({
    id: 'UXC09',
    name: 'Hierarquia visual compacta do card (Título, Cômodo/Cat, Descrição clamp 2, Duração/Pontos)',
    passed: hasCardHierarchy,
    expected: 'Card compacto respeitando hierarquia e clamp de 2 linhas',
    actual: hasCardHierarchy ? 'Hierarquia respeitada' : 'Hierarquia ausente'
  });

  // UXC10: Active card actions: Editar and ⋯ menu with Remover
  const hasActiveActions = taskCatalogContent.includes('btn-edit-family-') &&
    taskCatalogContent.includes('btn-menu-') &&
    taskCatalogContent.includes('btn-remove-');
  results.push({
    id: 'UXC10',
    name: 'Ações contextuais para tarefa ativa (Editar e menu ⋯ com Remover da minha casa)',
    passed: hasActiveActions,
    expected: 'Editar direto e Remover via menu discreto',
    actual: hasActiveActions ? 'Ações contextuais ativas' : 'Ações ausentes'
  });

  // UXC11: Available / Inactive actions
  const hasAvailableActions = taskCatalogContent.includes('btn-configure-') &&
    taskCatalogContent.includes('btn-reactivate-');
  results.push({
    id: 'UXC11',
    name: 'Ações contextuais para disponível (+ Adicionar) e inativa (Reativar)',
    passed: hasAvailableActions,
    expected: 'Botões contextuais + Adicionar e Reativar',
    actual: hasAvailableActions ? 'Botões contextuais presentes' : 'Botões ausentes'
  });

  // UXC12: Contextual Sticky Batch Bar
  const hasBatchBar = taskCatalogContent.includes('catalog-batch-bar') &&
    taskCatalogContent.includes('selection-counter') &&
    taskCatalogContent.includes('btn-batch-add') &&
    taskCatalogContent.includes('btn-clear-selection');
  results.push({
    id: 'UXC12',
    name: 'Barra de ação em lote contextual (sticky/flutuante apenas com seleção ativa)',
    passed: hasBatchBar,
    expected: 'Barra oculta quando vazia e exibida flutuante quando há seleção',
    actual: hasBatchBar ? 'Barra contextual sticky presente' : 'Barra ausente'
  });

  // UXC13: BRAND-2 semantic tokens
  const usesBrandTokens = taskCatalogContent.includes('bg-surface-card') &&
    taskCatalogContent.includes('bg-brand-primary') &&
    taskCatalogContent.includes('text-text-primary') &&
    taskCatalogContent.includes('border-border-default') &&
    !taskCatalogContent.includes('bg-indigo-600') &&
    !taskCatalogContent.includes('bg-blue-600');
  results.push({
    id: 'UXC13',
    name: 'Aplicação estrita dos tokens de design semânticos BRAND-2',
    passed: usesBrandTokens,
    expected: 'Tokens BRAND-2 sem cores hardcoded legadas',
    actual: usesBrandTokens ? 'Tokens BRAND-2 aplicados com sucesso' : 'Cores legadas encontradas'
  });

  // UXC14: Touch targets >= 44px
  const hasAccessibleTouchTargets = taskCatalogContent.includes('min-h-[44px]') ||
    taskCatalogContent.includes('min-w-[44px]');
  results.push({
    id: 'UXC14',
    name: 'Área de toque acessível (touch target >= 44px) em seletores e controles',
    passed: hasAccessibleTouchTargets,
    expected: 'Padrão min-h-[44px] respeitado',
    actual: hasAccessibleTouchTargets ? 'Touch targets acessíveis' : 'Touch targets insuficientes'
  });

  return results;
}
