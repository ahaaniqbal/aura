import React, { useEffect, useId, useMemo, useRef } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { c, f } from "../theme";
import { AuraLook, glowSvg } from "../lib/auras";
import { useLook } from "./look";

const GRAIN = require("../assets/grain-disc.png"); // grain that fades out with the glow
export type MarkState = "idle" | "thinking";

// Aura's mark: the vermilion dot inside its own aura, in the palette the person picked. The dot
// holds still; the glow breathes while Aura is working. `look` overrides the saved one (pickers).
export default function Mark({ size = 28, state = "idle", look, dot: showDot = true, style }: { size?: number; state?: MarkState; look?: AuraLook; dot?: boolean; style?: any }) {
  const saved = useLook();
  const key = (look || saved).palette;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const xml = useMemo(() => glowSvg(key, uid), [key, uid]);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== "thinking") { a.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state]);
  const dot = Math.round(size * 0.3);
  return (
    <View accessibilityLabel={state === "thinking" ? "Aura is working" : "Aura"} style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Animated.View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, overflow: "hidden",
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
        <SvgXml xml={xml} width={size} height={size} />
        {size >= 40 ? <Image source={GRAIN} resizeMode="stretch" style={{ position: "absolute", top: 0, left: 0, width: size, height: size, opacity: 0.6 }} /> : null}
      </Animated.View>
      {showDot ? <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c.accent }} /> : null}
    </View>
  );
}

export function Wordmark({ size = 24, color = c.ink }: { size?: number; color?: string }) {
  return <Text accessibilityRole="header" style={{ fontFamily: f.bold, fontSize: size, letterSpacing: -size * 0.045, color }}>aura</Text>;
}

// Three dots that step in sequence: the one place Aura shows it's composing a reply.
export function Typing({ color = c.muted }: { color?: string }) {
  const v = useRef([0, 1, 2].map(() => new Animated.Value(0.25))).current;
  useEffect(() => {
    const loops = v.map((x, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(x, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0.25, duration: 260, useNativeDriver: true }),
      Animated.delay((2 - i) * 160),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {v.map((x, i) => <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: x }} />)}
    </View>
  );
}
