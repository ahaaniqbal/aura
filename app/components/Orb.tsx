import React, { useEffect, useRef } from "react";
import { Animated, View, Easing, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { orb } from "../theme";

type State = "idle" | "thinking" | "warm";

export default function Orb({ size = 140, state = "idle", style }: { size?: number; state?: State; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  const warmOp = useRef(new Animated.Value(0)).current;
  const thinkOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const peak = state === "thinking" ? 1.1 : state === "warm" ? 1.08 : 1.06;
    const dur = state === "thinking" ? 750 : 2600;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: peak, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state]);

  useEffect(() => {
    Animated.timing(warmOp, { toValue: state === "warm" ? 1 : 0, duration: 600, useNativeDriver: true }).start();
    Animated.timing(thinkOp, { toValue: state === "thinking" ? 1 : 0, duration: 500, useNativeDriver: true }).start();
  }, [state]);

  const mid = state === "warm" ? orb.warm[1] : state === "thinking" ? orb.thinking[1] : orb.idle[1];
  const radius = size / 2;

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ position: "absolute", width: size * 1.45, height: size * 1.45, borderRadius: size * 0.73, backgroundColor: mid, opacity: 0.16 }} />
      <Animated.View
        style={{
          width: size, height: size, borderRadius: radius, transform: [{ scale }],
          shadowColor: mid, shadowOffset: { width: 0, height: 8 }, shadowRadius: 22, shadowOpacity: 0.5, elevation: 12,
        }}
      >
        <LinearGradient colors={orb.idle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, { borderRadius: radius }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: thinkOp }]}>
          <LinearGradient colors={orb.thinking} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, { borderRadius: radius }]} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: warmOp }]}>
          <LinearGradient colors={orb.warm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, { borderRadius: radius }]} />
        </Animated.View>
        <View style={{ position: "absolute", top: size * 0.15, left: size * 0.2, width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14, backgroundColor: "#FFFFFF", opacity: 0.4 }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { width: "100%", height: "100%" } });
