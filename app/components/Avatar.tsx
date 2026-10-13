import React, { useId, useMemo } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { c } from "../theme";
import { personSvg } from "../lib/faces";

// People are soft gradient spheres with small faces, picked from their name so the same person
// always looks the same. A party hat shows when their birthday is close; the vermilion dot still
// means one thing only: this person needs you now.
export default function Avatar({ name, size = 44, signal, party, onDark }: { name: string; size?: number; signal?: boolean; party?: boolean; onDark?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const xml = useMemo(() => personSvg(name, uid, { party }), [name, uid, party]);
  const d = Math.max(10, Math.round(size * 0.24));
  const hat = party ? Math.round(size * 0.26) : 0;
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessible={false}>
      <View style={{ position: "absolute", left: 0, top: -hat, width: size, height: size + hat }}>
        <SvgXml xml={xml} width={size} height={size + hat} />
      </View>
      {signal ? (
        <View style={{ position: "absolute", right: -1, bottom: -1, width: d, height: d, borderRadius: d / 2, backgroundColor: c.accent, borderWidth: 2, borderColor: onDark ? c.accent : c.canvas }} />
      ) : null}
    </View>
  );
}
