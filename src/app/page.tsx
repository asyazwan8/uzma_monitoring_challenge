import { DisplayEntry } from "@/components/display/DisplayEntry";

/**
 * The big-screen display. Query options:
 *   ?debug=1        show the true count and expose state on window.__MC__
 *   ?speed=0.2      run every timer 5x faster (testing)
 *   ?transport=broadcast  pair with a phone window in the same browser
 *   ?sound=0        no music or sound effects
 */
export default async function DisplayPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const speed = Number(params.speed);
  const timeScale = Number.isFinite(speed) && speed > 0 && speed <= 1 ? speed : 1;
  return <DisplayEntry debug={params.debug === "1"} timeScale={timeScale} sound={params.sound !== "0"} />;
}
