import { SHIELD } from './shield.ts';

/** A heraldic shield in the team's colour (D-46): the team's mark on its card and in the rating. */
export function Crest({
  color,
  size = 26,
  className,
}: {
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 30 35"
      width={size}
      height={Math.round((size * 35) / 30)}
      className={className}
      style={{ color }}
      aria-hidden="true"
    >
      <path d={SHIELD} fill="currentColor" stroke="#0b0704" strokeWidth={3.4} />
      <path d={SHIELD} fill="currentColor" stroke="#c9a462" strokeWidth={1.4} />
      {/* The left half lit: a shield «party per pale». */}
      <path d="M5 5.4H15V30.2C10 27.2 5 22.6 5 15Z" fill="#fff" opacity={0.16} />
      <path d="M15 5.4V30.2" stroke="#0b0704" strokeOpacity={0.35} strokeWidth={0.8} />
    </svg>
  );
}
