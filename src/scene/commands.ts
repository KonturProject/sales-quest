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
