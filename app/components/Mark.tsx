import React, { useEffect, useId, useMemo, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { c, f } from "../theme";
import { AuraLook, avatarSvg } from "../lib/auras";
import { useLook } from "./look";

export type MarkState = "idle" | "thinking";

// Aura's mark: the gradient avatar the person picked for it. It holds still at rest and breathes
// while Aura is working. `look` overrides the saved one (the picker's previews).
export default function Mark({ size = 28, state = "idle", look, style }: { size?: number; state?: MarkState; look?: AuraLook; style?: any }) {
  const saved = useLook();
  const key = (look || saved).avatar;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const xml = useMemo(() => avatarSvg(key, uid), [key, uid]);
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
  return (
    <View accessibilityLabel={state === "thinking" ? "Aura is working" : "Aura"} style={[{ width: size, height: size }, style]}>
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden",
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) }] }}>
        <SvgXml xml={xml} width={size} height={size} />
      </Animated.View>
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
