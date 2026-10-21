"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size }: { value: string; size: number }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#091926", light: "#FFFFFF" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={`QR code for ${value}`}
      data-qr-value={value}
      style={{ width: size, height: size }}
      className="[&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
