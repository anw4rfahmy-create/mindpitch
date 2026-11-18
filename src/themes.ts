export const themes = {
  dark: {
    name: 'Dark',
    bg: '#0f172a',
    text: '#e2e8f0',
    accent: '#38bdf8',
    nodeBg: '#1e293b',
    nodeBorder: '#334155',
    line: '#475569',
  },
  light: {
    name: 'Light',
    bg: '#f8fafc',
    text: '#0f172a',
    accent: '#0284c7',
    nodeBg: '#ffffff',
    nodeBorder: '#cbd5e1',
    line: '#94a3b8',
  },
  ocean: {
    name: 'Ocean',
    bg: '#0c4a6e',
    text: '#e0f2fe',
    accent: '#22d3ee',
    nodeBg: '#075985',
    nodeBorder: '#0ea5e9',
    line: '#38bdf8',
  },
  forest: {
    name: 'Forest',
    bg: '#14532d',
    text: '#dcfce7',
    accent: '#4ade80',
    nodeBg: '#166534',
    nodeBorder: '#22c55e',
    line: '#86efac',
  },
  sunset: {
    name: 'Sunset',
    bg: '#431407',
    text: '#ffedd5',
    accent: '#fb923c',
    nodeBg: '#7c2d12',
    nodeBorder: '#f97316',
    line: '#fdba74',
  },
} as const

export type ThemeKey = keyof typeof themes
export type Theme = (typeof themes)[ThemeKey]
