export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const JP_WD = ["日", "月", "火", "水", "木", "金", "土"];

export function weekday(d: Date): string {
  return JP_WD[d.getDay()]!;
}

/** HH:MM from an ISO string, in the browser's local zone. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "今日" / "明日" / "M/D(曜)" label for a date relative to now. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d0.getTime() - n0.getTime()) / 86400_000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  return `${d.getMonth() + 1}/${d.getDate()}(${weekday(d)})`;
}

export function relAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}分前`;
  return `${Math.round(m / 60)}時間前`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}
