/**
 * Whether the map's figures walk now (D-56): the scene and the 2D scheme say so, the moments of the HUD
 * wait for the end of the walk — repainting the HUD during moves costs their frames (QA-4, as the mini-map
 * of D-48 waits). Before a map has said anything (the scheme is a chunk of its own and mounts after the
 * HUD) it counts as walking; a map that unmounts says «still».
 */
let moving: boolean | null = null;

export function publishMoving(next: boolean): void {
  moving = next;
}

export function isMoving(): boolean {
  return moving !== false;
}
