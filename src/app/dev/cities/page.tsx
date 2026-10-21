import { Suspense } from "react";
import { CityGallery } from "./CityGallery";

export default function Page() {
  return (
    <Suspense>
      <CityGallery />
    </Suspense>
  );
}
