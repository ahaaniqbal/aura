import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { c, f } from "../theme";

export type MarkState = "idle" | "thinking";

// Aura's mark is typographic: a lowercase Diatype "a" on a cobalt square, the same as the app
// icon. It holds still unless Aura is working, when it dims and returns on a steady beat.
export default function Mark({ size = 32, state = "idle", inverse, style }: { size?: number; state?: MarkState; inverse?: boolean; style?: any }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state !== "thinking") { a.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.45, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state]);
  return (
    <Animated.View accessibilityLabel="Aura" style={[{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: inverse ? c.onAccent : c.accent, alignItems: "center", justifyContent: "center", opacity: a }, style]}>
      <Text style={{ fontFamily: f.bold, fontSize: size * 0.66, lineHeight: size * 0.8, letterSpacing: -size * 0.02, color: inverse ? c.accent : c.onAccent, marginTop: -size * 0.06 }}>a</Text>
    </Animated.View>
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
