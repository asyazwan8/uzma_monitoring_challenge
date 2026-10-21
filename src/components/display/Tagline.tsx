/** Brand device: "See" stays white, the phrase after it turns orange. */
export function Tagline({ size = 20 }: { size?: number }) {
  const parts = ["better.", "the bigger picture.", "the unseen."];
  return (
    <p className="font-extrabold tracking-[0.01em]" style={{ fontSize: size }}>
      {parts.map((p, i) => (
        <span key={p}>
          See <span className="text-geo-orange">{p}</span>
          {i < parts.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
