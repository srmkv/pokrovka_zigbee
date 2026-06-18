// src/components/Weather/WeatherIcon.tsx
import React from "react";
import { iconByWmo } from "./WeatherIconMap";

type Props = {
  code?: number | null;      // WMO
  iconName?: string;         // например "LightCloud.png"
  size?: number;             // если задан — width=height=size
  width?: number;
  height?: number;
  alt?: string;
  className?: string;
};

export default function WeatherIcon({
  code,
  iconName,
  size,
  width,
  height,
  alt = "weather icon",
  className,
}: Props) {
  const file = iconName || iconByWmo(code) || "LightCloud.png";
  const src = `/images/${file}`;
  const w = size ?? width ?? 64;
  const h = size ?? height ?? w;

  const [imgSrc, setImgSrc] = React.useState(src);

  return (
    <img
      src={imgSrc}
      width={w}
      height={h}
      alt={alt}
      title={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setImgSrc("/images/LightCloud.png")}
      style={{ display: "inline-block" }}
    />
  );
}
