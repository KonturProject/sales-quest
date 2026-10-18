import type { BurstKind } from './choreography.ts';

/** Camera requests from the HUD (GFX-3, GFX-5): «Весь трек», «К лидеру», a team on the mini-map. */
export type CameraCommand = 'overview' | 'leader' | { team: string };

const listeners = new Set<(command: CameraCommand) => void>();

export function requestCamera(command: CameraCommand): void {
  for (const listener of listeners) listener(command);
}

export function onCameraRequest(listener: (command: CameraCommand) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fireworks over teams on request (D-59): the finale's ceremony asks, the scene and the scheme draw. */
export type Celebration = { teamIds: string[]; kind: BurstKind };

const parties = new Set<(celebration: Celebration) => void>();

export function requestCelebration(teamIds: string[], kind: BurstKind): void {
  for (const listener of parties) listener({ teamIds, kind });
}

export function onCelebrationRequest(listener: (celebration: Celebration) => void): () => void {
  parties.add(listener);
  return () => parties.delete(listener);
}
