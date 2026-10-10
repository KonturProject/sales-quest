import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Text drawn once into a texture (GFX-4): name plates and «+N» are sprites, not DOM elements
 * updated every frame. Textures are cached by text and style and shared between sprites.
 * The plates match the HUD (D-46): a dark plate in a bronze rim for names, parchment for moves.
 */

export type Label = { texture: CanvasTexture; aspect: number };

const SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
const EDGE = '#0b0704';
const STYLES = {
  name: { ink: '#f2dfae', top: '#3a2a1d', bottom: '#150e09', rim: '#a9874f', px: 40, weight: 600 },
  gain: { ink: '#2d5a17', top: '#f1e5c4', bottom: '#d6bf8e', rim: '#6d5230', px: 56, weight: 700 },
  loss: { ink: '#8a2414', top: '#f1e5c4', bottom: '#d6bf8e', rim: '#6d5230', px: 56, weight: 700 },
} as const;
export type LabelStyle = keyof typeof STYLES;

const cache = new Map<string, Label>();

export function labelTexture(text: string, style: LabelStyle): Label {
  const key = `${style}|${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const s = STYLES[style];
  const font = `${s.weight} ${s.px}px ${SERIF}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D is not available');
  ctx.font = font;
  const padX = s.px * 0.8; // room for a rhombus at each end
  const width = Math.ceil(ctx.measureText(text).width + padX * 2);
  const height = Math.ceil(s.px * 1.5);
  canvas.width = width;
  canvas.height = height;

  // A plate with cut corners: the dark edge, the fill, then the rim inside.
  const edge = Math.max(2, s.px * 0.08);
  plate(ctx, 0, width, height, height * 0.26);
  ctx.fillStyle = EDGE;
  ctx.fill();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, s.top);
  fill.addColorStop(1, s.bottom);
  plate(ctx, edge, width, height, height * 0.26);
  ctx.fillStyle = fill;
  ctx.fill();
  plate(ctx, edge * 2, width, height, height * 0.26);
  ctx.strokeStyle = s.rim;
  ctx.lineWidth = Math.max(1.5, s.px * 0.05);
  ctx.stroke();
  for (const x of [padX * 0.45, width - padX * 0.45]) {
    const r = s.px * 0.14;
    ctx.beginPath();
    ctx.moveTo(x, height / 2 - r);
    ctx.lineTo(x + r, height / 2);
    ctx.lineTo(x, height / 2 + r);
    ctx.lineTo(x - r, height / 2);
    ctx.closePath();
    ctx.fillStyle = s.rim;
    ctx.fill();
  }

  ctx.font = font; // resizing the canvas resets its state
  ctx.fillStyle = s.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + s.px * 0.04);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const label = { texture, aspect: width / height };
  cache.set(key, label);
  return label;
}

/** The outline of a plate inset by `inset`, its corners cut by `cut`. */
function plate(
  ctx: CanvasRenderingContext2D,
  inset: number,
  width: number,
  height: number,
  cut: number,
) {
  const l = inset;
  const t = inset;
  const r = width - inset;
  const b = height - inset;
  const c = Math.max(0, cut - inset * 0.4);
  ctx.beginPath();
  ctx.moveTo(l + c, t);
  ctx.lineTo(r - c, t);
  ctx.lineTo(r, t + c);
  ctx.lineTo(r, b - c);
  ctx.lineTo(r - c, b);
  ctx.lineTo(l + c, b);
  ctx.lineTo(l, b - c);
  ctx.lineTo(l, t + c);
  ctx.closePath();
}
