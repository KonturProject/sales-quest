/** A point on a panel: `u` left → right, `v` top → bottom, both 0…1 (image coordinates). */
export type PanelPoint = { u: number; v: number };

export type AmbientKind = 'motes' | 'snow' | 'embers' | 'sparkles';

/** How a location looks on the board: its painted panel and the path its cells follow (D-37, D-41). */
export type ThemePanel = {
  themePackId: string;
  /** Ground colour while the art loads, and of a theme without art. */
  color: string;
  /** From the middle of the left edge to the middle of the right edge (`docs/ART_BRIEF.md`). */
  path: PanelPoint[];
  /** The location's life during moves (3b). */
  ambient: AmbientKind;
};

/**
 * The author's panels are 1408×768 (≈ 11:6); the pipeline refuses art of another shape, the board
 * keeps it (D-41).
 */
export const PANEL_ASPECT = 1408 / 768;

/** The mist every panel edge fades into (the pipeline bakes it in) and the board slab's colour. */
export const BOARD_BACKGROUND = '#2d4050';

const pts = (list: [number, number][]): PanelPoint[] => list.map(([u, v]) => ({ u, v }));

// The painted paths, traced on the art (control points of a Catmull-Rom curve, plan 3b).
export const THEMES: Record<string, ThemePanel> = {
  ruins: {
    themePackId: 'ruins',
    color: '#5f7a52',
    ambient: 'motes',
    path: pts([
      [0, 0.5],
      [0.12, 0.49],
      [0.22, 0.485],
      [0.31, 0.42],
      [0.4, 0.405],
      [0.5, 0.47],
      [0.58, 0.495],
      [0.66, 0.455],
      [0.74, 0.44],
      [0.84, 0.475],
      [1, 0.5],
    ]),
  },
  ice: {
    themePackId: 'ice',
    color: '#8fb3cf',
    ambient: 'snow',
    path: pts([
      [0, 0.5],
      [0.12, 0.49],
      [0.2, 0.43],
      [0.28, 0.335],
      [0.38, 0.305],
      [0.46, 0.37],
      [0.53, 0.5],
      [0.62, 0.6],
      [0.72, 0.6],
      [0.82, 0.52],
      [0.9, 0.49],
      [1, 0.5],
    ]),
  },
  volcano: {
    themePackId: 'volcano',
    color: '#7a4a3a',
    ambient: 'embers',
    path: pts([
      [0, 0.5],
      [0.13, 0.495],
      [0.2, 0.46],
      [0.28, 0.385],
      [0.36, 0.335],
      [0.44, 0.34],
      [0.5, 0.44],
      [0.56, 0.58],
      [0.63, 0.655],
      [0.7, 0.64],
      [0.78, 0.54],
      [0.87, 0.49],
      [1, 0.5],
    ]),
  },
  heaven: {
    themePackId: 'heaven',
    color: '#d8c98f',
    ambient: 'sparkles',
    path: pts([
      [0, 0.5],
      [0.12, 0.49],
      [0.21, 0.465],
      [0.28, 0.38],
      [0.35, 0.295],
      [0.42, 0.295],
      [0.48, 0.37],
      [0.53, 0.51],
      [0.6, 0.665],
      [0.67, 0.7],
      [0.74, 0.625],
      [0.8, 0.52],
      [0.88, 0.49],
      [1, 0.5],
    ]),
  },
};

// A theme the scene has no art for: a plain panel with a gentle S-path.
const S_PATH = pts([
  [0, 0.5],
  [0.25, 0.32],
  [0.5, 0.5],
  [0.75, 0.68],
  [1, 0.5],
]);

/** A theme pack the scene does not know yet still gets a panel. */
export function themeOf(themePackId: string): ThemePanel {
  return THEMES[themePackId] ?? { themePackId, color: '#808a94', path: S_PATH, ambient: 'motes' };
}
