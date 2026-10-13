import React, { useId, useMemo } from "react";
import { Image, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { c } from "../theme";
import { personSvg } from "../lib/auras";

const GRAIN = require("../assets/grain.png");

// A person is their aura: a soft gradient picked from their name, with a little grain so it reads
// as made, not generated. The vermilion dot still means one thing only: this person needs you now.
export default function Avatar({ name, size = 44, signal, onDark }: { name: string; size?: number; signal?: boolean; onDark?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const xml = useMemo(() => personSvg(name, uid), [name, uid]);
  const d = Math.max(10, Math.round(size * 0.24));
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessible={false}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
        <SvgXml xml={xml} width={size} height={size} />
        <Image source={GRAIN} resizeMode="repeat" style={{ position: "absolute", top: 0, left: 0, width: size, height: size, opacity: 0.35 }} />
      </View>
      {signal ? (
        <View style={{ position: "absolute", right: -1, bottom: -1, width: d, height: d, borderRadius: d / 2, backgroundColor: c.accent, borderWidth: 2, borderColor: onDark ? c.accent : c.canvas }} />
      ) : null}
    </View>
  );
}
