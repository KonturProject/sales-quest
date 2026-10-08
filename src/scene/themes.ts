/** A point on a panel: `u` left → right, `v` top → bottom, both 0…1 (image coordinates). */
export type PanelPoint = { u: number; v: number };

/** How a location looks on the board: its panel and the path its cells follow (D-37). */
export type ThemePanel = {
  themePackId: string;
  /** Placeholder ground colour until the painted panel of plan 3b. */
  color: string;
  /** From the middle of the left edge to the middle of the right edge (`docs/ART_BRIEF.md`). */
  path: PanelPoint[];
};

// Placeholder S-path of plan 3a; 3b traces the painted path of each panel.
const S_PATH: PanelPoint[] = [
  { u: 0, v: 0.5 },
  { u: 0.25, v: 0.32 },
  { u: 0.5, v: 0.5 },
  { u: 0.75, v: 0.68 },
  { u: 1, v: 0.5 },
];

/** Placeholder panels of plan 3a, by `themePackId` (OQ-17 order: ruins → ice → volcano → heaven). */
export const THEMES: Record<string, ThemePanel> = {
  ruins: { themePackId: 'ruins', color: '#5f7a52', path: S_PATH },
  ice: { themePackId: 'ice', color: '#8fb3cf', path: S_PATH },
  volcano: { themePackId: 'volcano', color: '#7a4a3a', path: S_PATH },
  heaven: { themePackId: 'heaven', color: '#d8c98f', path: S_PATH },
};

/** A theme pack the scene does not know yet still gets a panel. */
export function themeOf(themePackId: string): ThemePanel {
  return THEMES[themePackId] ?? { themePackId, color: '#808a94', path: S_PATH };
}
