import React, { useEffect, useId, useMemo, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { c, f } from "../theme";
import { AuraLook, auraSvg } from "../lib/faces";
import { useLook } from "./look";

export type MarkState = "idle" | "thinking";

// Aura's mark is Aura itself: a small sun with a face, dressed however you chose. It holds still
// at rest and bobs while Aura is working. `look` overrides the saved look (previews, pickers).
export default function Mark({ size = 28, state = "idle", look, backdrop, style }: { size?: number; state?: MarkState; look?: Partial<AuraLook>; backdrop?: boolean; style?: any }) {
  const saved = useLook();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const l = look || saved;
  const xml = useMemo(() => auraSvg(l, uid, { backdrop }), [JSON.stringify(l), uid, backdrop]);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== "thinking") { a.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state]);
  const lift = a.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.08] });
  const squash = a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  return (
    <View accessibilityLabel={state === "thinking" ? "Aura is working" : "Aura"} style={[{ width: size, height: size }, style]}>
      <Animated.View style={{ width: size, height: size, transform: [{ translateY: lift }, { scaleY: squash }] }}>
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
