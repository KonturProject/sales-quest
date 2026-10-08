/** Camera requests from the HUD (GFX-3): «Весь трек» and «К лидеру». */
export type CameraCommand = 'overview' | 'leader';

const listeners = new Set<(command: CameraCommand) => void>();

export function requestCamera(command: CameraCommand): void {
  for (const listener of listeners) listener(command);
}

export function onCameraRequest(listener: (command: CameraCommand) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
