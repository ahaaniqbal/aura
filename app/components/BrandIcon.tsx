import React from "react";
import Svg, { Path } from "react-native-svg";
import { BRANDS } from "../brands";

export default function BrandIcon({ brand, size = 22 }: { brand: string; size?: number }) {
  const b = BRANDS[brand];
  if (!b) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={b.d} fill={b.color} />
    </Svg>
  );
}
