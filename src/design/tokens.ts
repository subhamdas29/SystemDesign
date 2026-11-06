/**
 * Design tokens for "Life of a Request" System Design Simulator.
 * Strictly adheres to the monochrome-first silver/white & deep black palette.
 * Colors, gradients, shadows, borders, radii, fonts, and animation durations.
 */

export const tokens = {
  colors: {
    bg: {
      canvas: '#0b0b0d',
      surface: '#111113',
      panel: '#131316',
      subtle: '#18181b',
      active: '#222226',
      hover: '#1c1c20',
      dot: '#26262b',
    },
    border: {
      subtle: '#27272a',
      default: '#3f3f46',
      silver: '#8e8e93',
      silverLight: '#b8b8b8',
      white: '#ffffff',
      dashed: '#71717a',
    },
    text: {
      primary: '#ffffff',
      secondary: '#d4d4d4',
      muted: '#a1a1aa',
      faint: '#71717a',
    },
    accent: {
      silver: '#d4d4d4',
      silverGlow: 'rgba(212, 212, 212, 0.25)',
      silverHighlight: 'rgba(255, 255, 255, 0.4)',
      amberAttack: 'rgba(245, 158, 11, 0.2)', // Max 20% opacity for attack/malicious traffic
      amberAttackBorder: 'rgba(245, 158, 11, 0.5)',
    },
    status: {
      healthy: '#f4f4f5',
      warning: '#a1a1aa',
      overloaded: '#e4e4e7',
      failed: '#71717a',
    },
  },
  gradients: {
    silverBorder: 'linear-gradient(135deg, #b8b8b8 0%, #ffffff 100%)',
    silverGlow: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, rgba(17, 17, 19, 0) 70%)',
    nodeSurface: 'linear-gradient(180deg, #161619 0%, #111113 100%)',
    headerSurface: 'linear-gradient(180deg, #141417 0%, #0d0d0f 100%)',
  },
  shadows: {
    soft: '0 4px 12px rgba(0, 0, 0, 0.6)',
    glow: '0 0 15px rgba(212, 212, 212, 0.22)',
    glowHover: '0 0 22px rgba(255, 255, 255, 0.35)',
    glowSelected: '0 0 25px rgba(255, 255, 255, 0.45)',
    glowValidTarget: '0 0 20px rgba(255, 255, 255, 0.5)',
  },
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  spacing: {
    canvasNodeWidth: 160,
    canvasNodeHeight: 96,
    tierGapX: 200,
    instanceGapY: 120,
    paddingPanel: '16px',
  },
  fonts: {
    ui: 'Inter, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, Menlo, monospace',
  },
  animation: {
    fast: '150ms',
    default: '250ms',
    smooth: '400ms',
    layoutSpring: { stiffness: 300, damping: 28 },
  },
  zIndex: {
    canvas: 0,
    edges: 1,
    nodes: 2,
    packets: 3,
    overlays: 10,
    panels: 20,
    dashboard: 30,
    modal: 40,
    tooltip: 50,
  },
} as const;

export type DesignTokens = typeof tokens;
