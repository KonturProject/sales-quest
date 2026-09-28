import type { CameraAngles } from './cameraRig.ts';

/** Until the season config exists (stage 1): the SPEC default `ui.camera` (GFX-1, §14). */
export const DEFAULT_CAMERA: CameraAngles = { pitchDeg: 45, yawDeg: 45 };
