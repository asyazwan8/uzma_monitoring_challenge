export const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatScore(n: number): string {
  return n.toLocaleString("en-GB");
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function tileDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}
