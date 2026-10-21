import { tierInfo, type Tier } from "@/game/levels";

export function TierBadge({ tier, active = true, size = "md" }: { tier: Tier; active?: boolean; size?: "sm" | "md" | "lg" }) {
  const info = tierInfo(tier);
  const pad = size === "lg" ? "px-5 py-2 text-xl" : size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-sm font-extrabold uppercase tracking-[0.12em] ${pad} ${
        active ? "bg-geo-orange text-white" : "border border-white/25 text-white/60"
      }`}
    >
      <span className="tabular opacity-70">0{info.index + 1}</span>
      {info.label}
    </span>
  );
}
