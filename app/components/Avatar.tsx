import React, { useId, useMemo } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { c } from "../theme";
import { personSvg } from "../lib/auras";

// A person gets one of the gradient avatars, picked from their name so they always look the same.
// The vermilion dot still means one thing only: this person needs you now.
export default function Avatar({ name, size = 44, signal, onDark }: { name: string; size?: number; signal?: boolean; onDark?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const xml = useMemo(() => personSvg(name, uid), [name, uid]);
  const d = Math.max(10, Math.round(size * 0.24));
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessible={false}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
        <SvgXml xml={xml} width={size} height={size} />
      </View>
      {signal ? (
        <View style={{ position: "absolute", right: -1, bottom: -1, width: d, height: d, borderRadius: d / 2, backgroundColor: c.accent, borderWidth: 2, borderColor: onDark ? c.accent : c.canvas }} />
      ) : null}
    </View>
  );
}
