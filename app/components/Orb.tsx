import React, { useEffect, useRef } from "react";
import { Animated, View, Easing, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { orb } from "../theme";

type State = "idle" | "thinking" | "warm";

export default function Orb({ size = 140, state = "idle", style }: { size?: number; state?: State; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  const warmOp = useRef(new Animated.Value(0)).current;
  const thinkOp = useRef(new Animated.Value(0)).current;
  const glowOp = useRef(new Animated.Value(0.14)).current;

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
    Animated.timing(glowOp, { toValue: state === "thinking" ? 0.22 : state === "warm" ? 0.2 : 0.14, duration: 500, useNativeDriver: true }).start();
  }, [state]);

  const mid = state === "warm" ? orb.warm[1] : state === "thinking" ? orb.thinking[1] : orb.idle[1];
  const radius = size / 2;

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Animated.View
        style={{
          position: "absolute",
          width: size * 1.5,
          height: size * 1.5,
          borderRadius: size * 0.75,
          backgroundColor: mid,
          opacity: glowOp,
        }}
      />
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          transform: [{ scale }],
          shadowColor: mid,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 24,
          shadowOpacity: 0.45,
          elevation: 12,
        }}
      >
        <LinearGradient colors={orb.idle} start={{ x: 0.1, y: 0 }} end={{ x: 0.95, y: 1 }} style={[styles.fill, { borderRadius: radius }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: thinkOp }]}>
          <LinearGradient colors={orb.thinking} start={{ x: 0.1, y: 0 }} end={{ x: 0.95, y: 1 }} style={[styles.fill, { borderRadius: radius }]} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: warmOp }]}>
          <LinearGradient colors={orb.warm} start={{ x: 0.1, y: 0 }} end={{ x: 0.95, y: 1 }} style={[styles.fill, { borderRadius: radius }]} />
        </Animated.View>
        <View
          style={{
            position: "absolute",
            top: size * 0.14,
            left: size * 0.22,
            width: size * 0.26,
            height: size * 0.26,
            borderRadius: size * 0.13,
            backgroundColor: "#FFFFFF",
            opacity: 0.45,
          }}
        />
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: "rgba(0, 0, 0, 0.06)",
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { width: "100%", height: "100%" } });
