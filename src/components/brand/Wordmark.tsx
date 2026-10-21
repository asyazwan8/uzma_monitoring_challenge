/** G[EO]SPATIAL AI wordmark, set in type (no logo asset in the PoC). */
export function Wordmark({ size = 26, subline = true }: { size?: number; subline?: boolean }) {
  return (
    <div className="inline-flex flex-col leading-none" aria-label="Geospatial AI, an Uzma Company">
      <span className="font-extrabold tracking-[0.06em] text-white" style={{ fontSize: size }}>
        G<span className="text-geo-orange">[EO]</span>SPATIAL
        <sup className="ml-[0.12em] align-super text-[0.5em] font-extrabold tracking-normal">AI</sup>
      </span>
      {subline && (
        <span className="mt-[0.35em] font-normal italic tracking-[0.04em] text-geo-muted" style={{ fontSize: size * 0.42 }}>
          An Uzma Company
        </span>
      )}
    </div>
  );
}
