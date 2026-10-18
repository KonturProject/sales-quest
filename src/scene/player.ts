import { lerpPose, type CameraPose } from './cameraRig.ts';
import { figureSpots, type Layout } from './layout.ts';
import {
  EMPTY_PLAN,
  TIMING,
  BURST_MS,
  burstsAt,
  celebrationBursts,
  jumpAt,
  planMoves,
  popupsAt,
  poseAt,
  shotAt,
  type Burst,
  type BurstKind,
  type Plan,
  type Pose,
  type TeamPosition,
} from './choreography.ts';

/** A camera flight asked for by a button («Весь трек», «К лидеру»). */
type Flight = {
  from: CameraPose;
  to: CameraPose;
  elapsed: number;
  duration: number;
  /** A button's flight; else the scene's own (the rest view, D-42). */
  byViewer: boolean;
};

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
  /** The plan's last shot has been applied at its exact end (or no longer matters). */
  private settled = true;
  /** Fireworks on request (D-59) on their own clock: they are not a walk, the plan does not know them. */
  private party: Burst[] = [];
  private partyClock = 0;

  /**
   * New positions: a plan from the previous ones. The first load walks from `from` — the cells this
   * browser showed last (D-56, FR-MOVE-4 changed) — or plays nothing; another track plays nothing (its
   * cells mean other positions). The same positions again (a recompute at midnight, a re-publish) keep the
   * plan under way (review 3a).
   */
  load(
    after: TeamPosition[],
    trackKey: string,
    gates: readonly number[] = [],
    from: TeamPosition[] | null = null,
    finish?: number,
  ): Plan {
    if (trackKey === this.trackKey && this.last && samePositions(this.last, after))
      return this.plan;
    const before = trackKey === this.trackKey ? this.last : this.last === null ? from : null;
    this.plan = planMoves(before, after, TIMING, gates, finish);
    this.clock = 0;
    this.last = after;
    this.trackKey = trackKey;
    this.rest = new Map(after.map((t) => [t.teamId, t.position]));
    this.userCamera = false;
    this.settled = this.plan.shots.length === 0;
    // The rest view's own flight gives way to the moves: their first shot flies from here (review 3b-2).
    if (this.plan.shots.length > 0 && this.flight && !this.flight.byViewer) this.flight = null;
    return this.plan;
  }

  /** Moves the clocks on; true while something still animates. */
  advance(dtMs: number): boolean {
    this.clock = Math.min(this.clock + dtMs, this.plan.duration);
    if (this.partying()) this.partyClock += dtMs;
    if (this.flight)
      this.flight.elapsed = Math.min(this.flight.elapsed + dtMs, this.flight.duration);
    return this.animating();
  }

  /** True until the last frame of the plan and of a flight has been drawn at their exact ends. */
  animating(): boolean {
    return (
      this.clock < this.plan.duration || this.flight !== null || !this.settled || this.partying()
    );
  }

  /** Fireworks over `teamIds` now, one after another (the finale, D-59); a walk goes on under them. */
  celebrate(teamIds: string[], kind: BurstKind): void {
    this.party = [
      ...this.party.filter((b) => this.partyClock < b.start + BURST_MS[b.kind]),
      ...celebrationBursts(teamIds, kind, this.partyClock),
    ];
  }

  private partying(): boolean {
    return this.party.some((b) => this.partyClock < b.start + BURST_MS[b.kind]);
  }

  /** True while figures move (frames drawn then say how fast the computer is, PERF-8). */
  moving(): boolean {
    return this.clock < this.plan.duration;
  }

  pose(teamId: string): Pose {
    return poseAt(this.plan, teamId, this.clock, this.rest.get(teamId) ?? 0);
  }

  /** The shot under way; after the plan, once, its last shot at its exact end. */
  shot() {
    if (this.userCamera) return null;
    const current = shotAt(this.plan, this.clock);
    if (current) return current;
    if (!this.settled && this.clock >= this.plan.duration) {
      this.settled = true;
      const last = this.plan.shots[this.plan.shots.length - 1];
      return last ? { shot: last, progress: 1 } : null;
    }
    return null;
  }

  /** The popups at the player's time; `still` (reduced motion) — a counter shows its result. */
  popups(still = false) {
    return popupsAt(this.plan, this.clock, still);
  }

  /** The figure's jump at the player's time: 0…1 of its arc (D-57). */
  jump(teamId: string): number {
    return jumpAt(this.plan, teamId, this.clock);
  }

  /** The bursts alive at the player's time (D-57). */
  bursts() {
    const party = this.party
      .filter((b) => this.partyClock >= b.start && this.partyClock < b.start + BURST_MS[b.kind])
      .map((b) => ({ ...b, age: this.partyClock - b.start }));
    return [...burstsAt(this.plan, this.clock), ...party];
  }

  /** A flight; `byViewer` (a button) takes the camera from the plan's shots, the rest view does not. */
  flyTo(from: CameraPose, to: CameraPose, duration = FLIGHT_MS, byViewer = true): void {
    this.flight = { from, to, elapsed: 0, duration, byViewer };
    if (byViewer) this.userCamera = true; // a button outranks the plan's shots
    this.settled = true;
  }

  /** True while the scene's own flight to the rest view is under way. */
  restFlight(): boolean {
    return this.flight !== null && !this.flight.byViewer;
  }

  /** The rest view changed under its flight (a resize): the flight ends there instead. */
  retarget(to: CameraPose): void {
    if (this.flight && !this.flight.byViewer) this.flight.to = to;
  }

  /** The viewer has left the camera alone long enough: the scene steers it again (D-42). */
  resume(): void {
    this.userCamera = false;
  }

  /** The camera pose of a button flight under way; its exact end once, then null. */
  flightPose(): CameraPose | null {
    if (!this.flight) return null;
    const t = this.flight.elapsed / this.flight.duration;
    const pose = lerpPose(this.flight.from, this.flight.to, t);
    if (t >= 1) this.flight = null;
    return pose;
  }

  /** The viewer grabbed the camera: shots and flights let go of it. */
  release(): void {
    this.userCamera = true;
    this.flight = null;
    this.settled = true;
  }
}

function samePositions(a: TeamPosition[], b: TeamPosition[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (t, i) =>
        t.teamId === b[i]?.teamId && t.position === b[i]?.position && t.points === b[i]?.points,
    )
  );
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
