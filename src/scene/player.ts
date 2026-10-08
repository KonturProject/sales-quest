import { lerpPose, type CameraPose } from './cameraRig.ts';
import { figureSpots, type Layout } from './layout.ts';
import {
  EMPTY_PLAN,
  planMoves,
  popupsAt,
  poseAt,
  shotAt,
  type Plan,
  type Pose,
  type TeamPosition,
} from './choreography.ts';

/** A camera flight asked for by a button («Весь трек», «К лидеру»). */
type Flight = { from: CameraPose; to: CameraPose; elapsed: number; duration: number };

export const FLIGHT_MS = 1000;

/**
 * Plays the choreography back (FR-MOVE): holds the plan, its clock and button flights. The clock
 * advances only by the ticker's frames, so a hidden tab pauses the moves instead of skipping them.
 * No three.js here — the scene reads poses from it every frame.
 */
export class ScenePlayer {
  plan: Plan = EMPTY_PLAN;
  clock = 0;
  /** The viewer took the camera during the plan: shots stop steering it. */
  userCamera = false;
  private rest = new Map<string, number>();
  private last: TeamPosition[] | null = null;
  private trackKey = '';
  private flight: Flight | null = null;

  /**
   * New positions: a plan from the previous ones (none on the first load or on another track,
   * whose cells mean other positions — FR-MOVE-4).
   */
  load(after: TeamPosition[], trackKey: string): Plan {
    const before = trackKey === this.trackKey ? this.last : null;
    this.plan = planMoves(before, after);
    this.clock = 0;
    this.last = after;
    this.trackKey = trackKey;
    this.rest = new Map(after.map((t) => [t.teamId, t.position]));
    this.userCamera = false;
    return this.plan;
  }

  /** Moves the clocks on; true while something still animates. */
  advance(dtMs: number): boolean {
    this.clock = Math.min(this.clock + dtMs, this.plan.duration);
    if (this.flight) {
      this.flight.elapsed += dtMs;
      if (this.flight.elapsed >= this.flight.duration) this.flight = null;
    }
    return this.animating();
  }

  animating(): boolean {
    return this.clock < this.plan.duration || this.flight !== null;
  }

  pose(teamId: string): Pose {
    return poseAt(this.plan, teamId, this.clock, this.rest.get(teamId) ?? 0);
  }

  shot() {
    return this.userCamera ? null : shotAt(this.plan, this.clock);
  }

  popups() {
    return popupsAt(this.plan, this.clock);
  }

  flyTo(from: CameraPose, to: CameraPose, duration = FLIGHT_MS): void {
    this.flight = { from, to, elapsed: 0, duration };
    this.userCamera = true; // a button outranks the plan's shots
  }

  /** The camera pose of a button flight under way, or null. */
  flightPose(): CameraPose | null {
    if (!this.flight) return null;
    return lerpPose(this.flight.from, this.flight.to, this.flight.elapsed / this.flight.duration);
  }

  /** The viewer grabbed the camera: shots and flights let go of it. */
  release(): void {
    this.userCamera = true;
    this.flight = null;
  }
}

/** Where every figure stands at the player's current time — for the camera to follow one. */
export function figurePositions(layout: Layout, player: ScenePlayer, teamIds: string[]) {
  const poses = teamIds.map((teamId) => ({ teamId, pose: player.pose(teamId) }));
  const standing = figureSpots(
    layout,
    poses
      .filter(({ pose }) => pose.f === 0 && pose.a === pose.b)
      .map(({ teamId, pose }) => ({ teamId, position: pose.a })),
  );
  return (teamId: string): { x: number; z: number } | null => {
    const still = standing.get(teamId);
    if (still) return still;
    const pose = poses.find((p) => p.teamId === teamId)?.pose;
    const a = pose && layout.spots[pose.a];
    const b = pose && layout.spots[pose.b];
    if (!pose || !a || !b) return null;
    return { x: a.x + (b.x - a.x) * pose.f, z: a.z + (b.z - a.z) * pose.f };
  };
}
