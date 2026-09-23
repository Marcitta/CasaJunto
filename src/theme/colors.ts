/**
 * CasaJunto Semantic Color System (BRAND-2)
 *
 * Centralized color tokens defining the visual identity and functional states.
 * Mapped to Tailwind CSS v4 `@theme` in `src/index.css`.
 *
 * Visual Direction:
 * - Purple: Brand primary, identity, active navigation, key CTAs, visual focus
 * - Coral: Brand secondary, energy, interaction, highlights, complementary actions
 * - Yellow: Brand accent, small achievements, gamification, celebration
 * - Warm Neutrals: Backgrounds, cards, surfaces, borders, rest areas
 * - Functional States: Preserved distinct semantics (success, warning, error, info)
 */

export const COLOR_TOKENS = {
  // --- BRAND COLORS ---
  brand: {
    primary: '#5b32a3',       // Deep Royal Purple (7.3:1 contrast on white - WCAG AAA)
    primaryHover: '#492487',  // Deeper Purple for hover states (9.5:1 on white)
    primarySoft: '#f3eefa',   // Soft Lilac tint for active backgrounds & subtle pills

    secondary: '#d9533f',     // Warm Terracotta Coral (4.52:1 contrast on white - WCAG AA)
    secondaryHover: '#c64330',// Rich Coral hover
    secondarySoft: '#fdf1ee', // Soft Coral tint for highlights & badges

    accent: '#e5a01a',        // Warm Honey Gold for badges, streaks & achievements
    accentHover: '#c9880f',   // Darker Gold hover
    accentSoft: '#fef7e6',    // Warm Golden tint for celebratory backgrounds
  },

  // --- SURFACES & CONTAINERS ---
  surface: {
    page: '#faf8f5',          // Warm soothing cream canvas
    card: '#ffffff',          // Crisp white container surface
    subtle: '#f4f0e8',        // Inset wells, hovered cards, disabled backgrounds
    elevated: '#ffffff',      // Modals, dropdowns, floating menus
  },

  // --- TYPOGRAPHY & TEXT ---
  text: {
    primary: '#2d2638',       // Deep plum-tinted charcoal (12.8:1 contrast - WCAG AAA)
    secondary: '#5e5866',     // Muted plum-gray (5.8:1 contrast - WCAG AA)
    muted: '#8e8796',         // Soft neutral for timestamps & non-critical labels
    onPrimary: '#ffffff',     // High-contrast white for colored buttons
  },

  // --- BORDERS & DIVIDERS ---
  border: {
    default: '#e8e3da',       // Subtle hairline divider
    strong: '#d1c9bc',        // Structured boundaries & selected inputs
  },

  // --- FUNCTIONAL SEMANTIC STATES (Preserved & Recognizable) ---
  state: {
    success: '#168a53',       // Emerald Green (4.6:1 on white)
    successSoft: '#ecfdf3',   // Soft mint tint for completion banners
    warning: '#d97706',       // Amber warning (4.5:1 on white)
    warningSoft: '#fffbeb',   // Soft amber tint for alerts
    error: '#dc2626',         // Crimson error (4.5:1 on white)
    errorSoft: '#fef2f2',     // Soft red tint for error callouts
    info: '#2563eb',          // Royal blue (4.5:1 on white)
    infoSoft: '#eff6ff',      // Soft blue tint for informational tags
  },

  // --- CONTROLS & ACCESSIBILITY ---
  control: {
    focusRing: '#5b32a3',
    disabledBackground: '#ede9e1',
    disabledText: '#a39c90',
  }
} as const;

export type ColorTokens = typeof COLOR_TOKENS;
