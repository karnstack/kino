// UI icons for the docs site. Brand glyphs (GitHub, npm) are drawn from their
// official marks; the rest are Heroicons (24px outline, stroke `currentColor`).
// Feature/section markers use mono "frame numbers" instead of icons — closer to
// the film-strip theme — so this set stays small and standard.

type IconProps = { className?: string }

function Outline({ className, d }: IconProps & { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {paths.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  )
}

export const CheckIcon = (p: IconProps) => (
  <Outline {...p} d="M4.5 12.75l6 6 9-13.5" />
)
export const ArrowUpRightIcon = (p: IconProps) => (
  <Outline {...p} d="M6 18 18 6m0 0H9m9 0v9" />
)
export const ArrowRightIcon = (p: IconProps) => (
  <Outline {...p} d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
)
export const ChevronRightIcon = (p: IconProps) => (
  <Outline {...p} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
)
export const MenuIcon = (p: IconProps) => (
  <Outline {...p} d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
)
export const CloseIcon = (p: IconProps) => (
  <Outline {...p} d="M6 18 18 6M6 6l12 12" />
)
export const ExternalLinkIcon = (p: IconProps) => (
  <Outline
    {...p}
    d={[
      "M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5",
      "M15.75 3H21m0 0v5.25M21 3l-9 9",
    ]}
  />
)

export function CopyIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function GitHubIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.85.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.34 9.34 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348c.777.427.777 1.544 0 1.97l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653Z" />
    </svg>
  )
}
