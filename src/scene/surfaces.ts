import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { random } from './ambient.ts';

/**
 * A painted-looking surface made in a canvas once (D-43): the table's wooden planks, tileable.
 * No download; the author may later replace it with painted art.
 */

/** World units one tile of the wood covers (four planks). */
export const WOOD_TILE = 24;

function tileable(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Four planks along x: warm browns, wavy grain that tiles, dark seams and a few knots. */
export function woodTexture(size = 512): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const next = random(7);
  const planks = 4;
  const h = size / planks;
  const browns = ['#8a5a32', '#94623a', '#7d5130', '#8f6038'];
  for (let p = 0; p < planks; p++) {
    const y0 = p * h;
    ctx.fillStyle = browns[p % browns.length] as string;
    ctx.fillRect(0, y0, size, h);
    // Grain: whole waves across the tile, so its left and right edges meet.
    for (let g = 0; g < 26; g++) {
      const base = y0 + 4 + next() * (h - 8);
      const k = 1 + Math.floor(next() * 3);
      const amp = 1 + next() * 4;
      const phase = next() * Math.PI * 2;
      const dark = next() < 0.75;
      ctx.strokeStyle = dark
        ? `rgba(55, 30, 12, ${0.12 + next() * 0.2})`
        : `rgba(255, 215, 160, ${0.06 + next() * 0.08})`;
      ctx.lineWidth = 0.8 + next() * 1.6;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 4) {
        const y = base + Math.sin((x / size) * Math.PI * 2 * k + phase) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // A knot now and then.
    if (next() < 0.6) {
      const kx = 30 + next() * (size - 60);
      const ky = y0 + h * (0.3 + next() * 0.4);
      ctx.fillStyle = 'rgba(60, 32, 14, 0.55)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, 9 + next() * 8, 4 + next() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The seam to the next plank, and one butt joint along it.
    ctx.fillStyle = 'rgba(35, 18, 8, 0.85)';
    ctx.fillRect(0, y0, size, 3);
    ctx.fillRect(Math.floor(next() * (size - 4)), y0, 3, h);
  }
  return tileable(canvas);
}
