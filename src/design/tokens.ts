/**
 * Design tokens for "Life of a Request" System Design Simulator.
 * Strictly adheres to the redesign specification derived from Figma and local comp references.
 * Palette: Cream (#F3EEE3), Burnt Orange (#D9541E), Canvas (#0B0B0D), Monochrome neutrals.
 * Typography: Roboto Mono across all navigation, controls, nodes, and telemetry.
 */

export const tokens = {
  colors: {
    cream: '#F3EEE3',
    burntOrange: '#D9541E',
    canvas: '#0B0B0D',
    bg: {
      canvas: '#0B0B0D',
      surface: '#111111',
      panel: '#141414',
      subtle: '#181818',
      active: '#242424',
      hover: '#1F1F1F',
      dot: '#262626',
      toolbarPill: '#2C2C2C',
      toolbarPillActive: '#656565',
      bottomBar: '#2C2C2C',
    },
    border: {
      subtle: '#262626',
      default: '#383838',
      silver: '#8E8E93',
      white: '#FFFFFF',
      orange: '#D9541E',
      dashed: '#737373',
    },
    text: {
      primary: '#FFFFFF',
      dark: '#111111',
      secondary: '#8E8E8E',
      muted: '#888888',
      faint: '#545454',
      accentOrange: '#D9541E',
    },
    accent: {
      orange: '#D9541E',
      cream: '#F3EEE3',
      amberAttack: 'rgba(217, 84, 30, 0.25)',
      amberAttackBorder: '#D9541E',
    },
    status: {
      healthy: '#008604',
      warning: '#F59E0B',
      overloaded: '#D9541E',
      failed: '#EF4444',
    },
  },
  typography: {
    fontFamily: "'Roboto Mono', Menlo, Consolas, monospace",
    nav: {
      fontSize: '16px',
      fontWeight: 700,
    },
    secondBar: {
      fontSize: '11px',
      fontWeight: 500,
    },
    canvasLabel: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: '1.25',
    },
    canvasUtilization: {
      fontSize: '10px',
      fontWeight: 400,
    },
    healthIndicator: {
      fontSize: '11px',
      fontWeight: 400,
    },
  },
  fonts: {
    ui: "'Roboto Mono', Menlo, Consolas, monospace",
    mono: "'Roboto Mono', Menlo, Consolas, monospace",
  },
  dimensions: {
    topBarHeight: 80,
    secondBarHeight: 54,
    bottomBarHeight: 45,
    navIconSize: 16,
    canvasIconSize: 48,
    edgeWeight: 2,
    iconStrokeWidth: 2,
  },
  radii: {
    none: '0px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    full: '9999px',
  },
  spacing: {
    canvasNodeWidth: 160,
    canvasNodeHeight: 96,
    tierGapX: 220,
    instanceGapY: 130,
    paddingPanel: '16px',
  },
  animation: {
    fast: '150ms',
    default: '250ms',
    smooth: '300ms',
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
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
