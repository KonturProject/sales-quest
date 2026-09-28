import { useFrame } from '@react-three/fiber';

declare global {
  interface Window {
    /** Frames drawn since page load; e2e tests check it stays flat while nothing changes. */
    __sqFrames?: number;
  }
}

function countFrame() {
  window.__sqFrames = (window.__sqFrames ?? 0) + 1;
}

/** With `frameloop="demand"` useFrame runs only for frames that are actually drawn. */
export function FrameCounter() {
  useFrame(countFrame);
  return null;
}
