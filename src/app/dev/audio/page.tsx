import type { Metadata } from "next";
import { AudioLab } from "./AudioLab";

export const metadata: Metadata = {
  title: "Audio lab · The Monitoring Challenge",
};

export default function Page() {
  return <AudioLab />;
}
