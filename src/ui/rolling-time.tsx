const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function RollingDigit({ value }: { value: number }) {
  return (
    <span className="kino-roll-digit">
      <span
        className="kino-roll-col"
        style={{ transform: `translateY(${-value * 10}%)` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="kino-roll-cell">
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

// Time string with each digit on its own rolling column, so changing a digit
// slides the new one up/down (macOS-clock style) instead of swapping instantly.
export function RollingTime({ value }: { value: string }) {
  return (
    <span className="kino-roll" aria-label={value}>
      {value.split("").map((ch, i) =>
        ch >= "0" && ch <= "9" ? (
          <RollingDigit key={i} value={Number(ch)} />
        ) : (
          <span key={i} className="kino-roll-sep" aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  )
}
