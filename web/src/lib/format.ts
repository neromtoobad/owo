const ngInt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const ng2 = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₦1,234,567 — kobo only shown below ₦1,000. */
export function naira(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "₦—";
  const neg = n < 0;
  const a = Math.abs(n);
  const s = a < 1000 ? ng2.format(a) : ngInt.format(Math.floor(a));
  return `${neg ? "−" : ""}₦${s}`;
}

/** Exchange rate with kobo: ₦1,372.40 */
export function rate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "₦—";
  return `₦${ng2.format(n)}`;
}

/** 1,234.56 */
export function musd(v: string | number | null | undefined, digits = 2): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function btc(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function usd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function short(addr?: string | null, a = 6, b = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, a)}…${addr.slice(-b)}`;
}

/** Accepts ms or unix seconds. */
export function toMs(t: number | string | null | undefined): number | null {
  if (t == null) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

export function when(t: number | null | undefined): string {
  const ms = toMs(t);
  if (!ms) return "";
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function duration(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

/** Keep only a sane decimal string with up to 2 dp. */
export function cleanAmount(raw: string): string {
  let s = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "").slice(0, 2);
  if (s.startsWith(".")) s = "0" + s;
  s = s.replace(/^0+(?=\d)/, "");
  return s.slice(0, 12);
}
