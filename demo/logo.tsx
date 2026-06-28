// The kino mark: a vertical stem + a right-pointing play triangle that together
// read as a lowercase "k" and a play button — the player and the brand in one
// glyph. Colored with `currentColor` so it inherits text color wherever it sits.
export function KinoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="3.2"
        y="3.6"
        width="4.2"
        height="16.8"
        rx="2.1"
        fill="currentColor"
      />
      <path
        d="M9.4 5 L20.4 12 L9.4 19 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Mark + wordmark lockup. Amber film-leader chip with a dark glyph, paired with
// a Fraunces wordmark so the brand reads editorial/cinematic.
export function KinoLogo({ className }: { className?: string }) {
  return (
    <span
      className={["inline-flex items-center gap-2.5", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="grid size-8 place-items-center rounded-[9px] bg-leader text-ink">
        <KinoMark className="size-5" />
      </span>
      <span className="font-display text-[1.375rem] leading-none font-semibold tracking-tight text-paper">
        kino
      </span>
    </span>
  )
}
