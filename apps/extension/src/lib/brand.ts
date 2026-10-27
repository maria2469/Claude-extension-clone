// Single source of truth for the product brand (see SDD Section 1).
export const PRODUCT_NAME = 'Malude';

// Official Claude-inspired warm charcoal black & terracotta orange design tokens
export const BRAND_TOKENS = {
  light: {
    bg: '#FAF9F5',
    surface: '#F4F2EB',
    card: '#FFFFFF',
    border: '#E8E5DC',
    text: '#1F1E1D',
    muted: '#7A766F',
    accent: '#D97757', // Signature Claude terracotta orange
    accentHover: '#C15F3E',
    ok: '#2D8A4E',
    warn: '#D97706',
    bad: '#D9383A',
  },
  dark: {
    bg: '#141413', // Deep warm charcoal black
    surface: '#1F1E1B', // Warm dark card surface
    card: '#262522',
    border: '#36342E', // Subtle warm border
    text: '#F5F4F0', // Clean warm white
    muted: '#969288', // Warm muted gray
    accent: '#D97757', // Signature Claude terracotta orange
    accentHover: '#E08A6C',
    ok: '#3FB950',
    warn: '#E39C3D',
    bad: '#F85149',
  },
} as const;
