/**
 * CasaJunto - Scoring & Distribution Configuration (Motor 2.0)
 * Centraliza e documenta todos os pesos, penalidades, bônus e limites do algoritmo.
 */

export const SCORING_CONFIG = {
  // 1. Pesos de Autonomia & Capacidade
  AUTONOMY: {
    MENTOR: 35,
    AUTONOMOUS: 30,
    LEARNING: 10,
    NOT_LEARNED: 0,
    SUPERVISION_PENALTY: -10,
    // Inferências por nível geral (1 a 4) caso não haja skill individual
    LEVEL_4: 35,
    LEVEL_3: 30,
    LEVEL_2: 10,
    LEVEL_1: 0,
    DEFAULT_CAPACITY: 15
  },

  // 2. Pesos de Disponibilidade
  AVAILABILITY: {
    FITS_COMFORTABLY: 20, // Sobram 15+ min de folga
    FITS_EXACT: 10, // Cabe na janela, mas com pouca margem
    MAX_SCORE: 25,
    COMFORT_MARGIN_MINUTES: 15
  },

  // 3. Pesos de Preferência Pessoal
  PREFERENCE: {
    LIKE: 10,
    NEUTRAL: 0,
    DISLIKE: -10 // Desestimula, mas não elimina se necessário
  },

  // 4. Pesos de Equilíbrio e Esforço Semanal (Balance Score)
  BALANCE: {
    BELOW_AVERAGE_BONUS: 25, // Morador com esforço acumulado < 80% da média -> prioriza
    ABOVE_AVERAGE_PENALTY: -20, // Morador sobrecarregado (> 125% da média) -> alivia
    NORMAL: 10,
    LOW_CONTRIBUTION_THRESHOLD: 0.8,
    HIGH_CONTRIBUTION_THRESHOLD: 1.25,
    MINIMUM_SIGNIFICANT_AVG_EFFORT: 30
  },

  // 5. Pesos de Recência e Rotação
  RECENCY: {
    WITHIN_24_HOURS: -30,
    WITHIN_3_DAYS: -20,
    WITHIN_7_DAYS: -10,
    NO_PENALTY: 0
  },

  // 6. Agrupamento por Ambiente (Room Affinity)
  ROOM_AFFINITY: {
    SAME_ROOM_BONUS: 15
  },

  // 7. Prioridade de Tarefas no Dia (Task Priority Queue)
  TASK_PRIORITY: {
    BASE_SCORE: 50,
    CATEGORY_URGENT_BONUS: 35, // Lixo, Pets
    CATEGORY_KITCHEN_BONUS: 25, // Louça e Refeições
    ROOM_HIGH_IMPACT_BONUS: 20, // Sala e Banheiros
    DAILY_FREQUENCY_BONUS: 20,
    HELPER_TODAY_PENALTY: -80,
    HELPER_YESTERDAY_PENALTY: -30
  },

  // 8. Limites Diários Padrão por Faixa Etária (Minutos/dia)
  DAILY_MINUTES_BY_AGE: {
    UNDER_7: 15,
    UNDER_11: 30,
    UNDER_15: 45,
    UNDER_18: 60,
    ADULT: 75
  }
} as const;

export type ScoringConfigType = typeof SCORING_CONFIG;
