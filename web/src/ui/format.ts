// Number formatting for panels. Tabular numerals are applied by the `.tabular` class.

export const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-GB')

export const fmtKm = (m: number, digits = 2): string => (m / 1000).toFixed(digits)

export const fmtM = (m: number): string => `${Math.round(m).toLocaleString('en-GB')} m`

export const fmtS = (s: number): string => {
  if (s < 60) return `${s.toFixed(0)} s`
  const mm = Math.floor(s / 60)
  const ss = Math.round(s - mm * 60)
  return `${mm}:${String(ss).padStart(2, '0')} min`
}

export const fmtH = (s: number): string => `${(s / 3600).toFixed(1)} h`

/** Signed percentage, e.g. "+3.2%" / "−4.0%" (true minus sign). */
export const fmtPct = (x: number, digits = 1): string => {
  const v = x * 100
  const abs = Math.abs(v).toFixed(digits)
  if (Number(abs) === 0) return `${(0).toFixed(digits)}%`
  return `${v > 0 ? '+' : '−'}${abs}%`
}

/** Relative change a vs ref: (a - ref) / ref. Negative = fewer metres = better. */
export const rel = (a: number, ref: number): number => (ref > 0 ? (a - ref) / ref : 0)

/** Gain = share of walking removed vs ref (positive is good). */
export const gain = (a: number, ref: number): number => (ref > 0 ? (ref - a) / ref : 0)

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2011-11-16T10:12:00" -> "Wed 16 Nov 2011 · 10:12" (no timezone shifts). */
export function fmtTs(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ts)
  if (!m) return ts
  const [, y, mo, d, hh, mm] = m
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()
  return `${DAYS[day]} ${Number(d)} ${MONTHS[Number(mo) - 1]} ${y} · ${hh}:${mm}`
}

export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
