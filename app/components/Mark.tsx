import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { c, f } from "../theme";

export type MarkState = "idle" | "thinking";

// Aura's mark is a single vermilion dot: the light that's on when Aura is with you. It holds
// still at rest and pulses only while Aura is working. The app icon is the same dot on ink.
export default function Mark({ size = 28, state = "idle", ink, style }: { size?: number; state?: MarkState; ink?: boolean; style?: any }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state !== "thinking") { a.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.4, duration: 560, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state]);
  return (
    <View accessibilityLabel={state === "thinking" ? "Aura is working" : "Aura"} style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Animated.View style={{ width: size * 0.62, height: size * 0.62, borderRadius: size, backgroundColor: ink ? c.ink : c.accent, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0.4, 1], outputRange: [0.86, 1] }) }] }} />
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
