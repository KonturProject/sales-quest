import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Text drawn once into a texture (GFX-4): name plates and «+N» are sprites, not DOM elements
 * updated every frame. Textures are cached by text and colours and shared between sprites.
 */

export type Label = { texture: CanvasTexture; aspect: number };

const cache = new Map<string, Label>();

export function labelTexture(
  text: string,
  opts: { color: string; background: string; fontPx?: number; bold?: boolean },
): Label {
  const key = `${text}|${opts.color}|${opts.background}|${opts.fontPx ?? 40}|${opts.bold ?? false}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const fontPx = opts.fontPx ?? 40;
  const font = `${opts.bold ? 700 : 600} ${fontPx}px system-ui, "Segoe UI", sans-serif`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D is not available');
  ctx.font = font;
  const padX = fontPx * 0.5;
  const width = Math.ceil(ctx.measureText(text).width + padX * 2);
  const height = Math.ceil(fontPx * 1.5);
  canvas.width = width;
  canvas.height = height;

  ctx.font = font; // resizing the canvas resets its state
  ctx.fillStyle = opts.background;
  const r = height / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, r);
  ctx.fill();
  ctx.fillStyle = opts.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + fontPx * 0.04);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const label = { texture, aspect: width / height };
  cache.set(key, label);
  return label;
}
