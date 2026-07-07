import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { c, font, shadow } from "../theme";
import type { Pulse } from "../lib/api";

// Emotional pulse, Aura's read on YOU. A week of one-tap check-ins becomes a small living
// chart of how you've been, and Aura reflects it back gently. The one surface that's about
// the user, not the people around them.

const MOODS = [
  { v: -2, label: "rough", color: c.coral },
  { v: -1, label: "low", color: "#FF9F45" },
  { v: 0, label: "ok", color: "#9AA0C9" },
  { v: 1, label: "good", color: c.mint },
  { v: 2, label: "great", color: c.accent },
];
const vcolor = (v: number) => (v <= -2 ? c.coral : v === -1 ? "#FF9F45" : v === 0 ? "#9AA0C9" : v === 1 ? c.mint : c.accent);
const vheight = (v: number) => (v <= -2 ? 15 : v === -1 ? 23 : v === 0 ? 31 : v === 1 ? 41 : 50);
function stateWord(avg: number | null): string {
  if (avg === null) return "";
  if (avg <= -1) return "a heavy stretch";
  if (avg < -0.2) return "a bit low";
  if (avg < 0.5) return "steady";
  if (avg < 1.3) return "a good week";
  return "a great week";
}

export default function PulseCard({ pulse, onPulse }: { pulse: Pulse | null; onPulse: (valence: number, mood: string) => void }) {
  const days = pulse?.days || [];
  const hasHistory = days.some((d) => d.valence !== null);
  const todayLogged = !!pulse?.todayLogged;
  const reflection = pulse?.reflection || "";
  const word = stateWord(pulse?.avg7 ?? null);

  // the week grows in, bar by bar
  const bars = useRef([0, 1, 2, 3, 4, 5, 6].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!hasHistory) return;
    bars.forEach((a) => a.setValue(0));
    Animated.stagger(55, bars.map((a) => Animated.timing(a, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }))).start();
  }, [hasHistory]);

  // optimistic: flip to "checked in" the instant they tap, before the network returns
  const [justLogged, setJustLogged] = useState(false);
  const tap = (v: number, label: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setJustLogged(true); onPulse(v, label); };
  const logged = todayLogged || justLogged;

  return (
    <View style={st.card}>
      <View style={st.head}>
        <View style={st.headL}><Feather name="activity" size={14} color={c.accent} /><Text style={st.title}>your pulse</Text></View>
        {word ? <Text style={st.word}>{word}</Text> : null}
      </View>

      {hasHistory ? (
        <View style={st.chart}>
          {days.map((d, i) => (
            <View key={i} style={st.col}>
              <View style={st.barWrap}>
                <Animated.View style={{ opacity: bars[i], transform: [{ translateY: bars[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                  {d.valence === null
                    ? <View style={st.empty} />
                    : <View style={[st.bar, { height: vheight(d.valence), backgroundColor: vcolor(d.valence) }]} />}
                </Animated.View>
              </View>
              <Text style={st.day}>{d.day[0]}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {reflection ? <Text style={st.reflect}>{reflection}</Text> : null}

      {!logged ? (
        <>
          <Text style={st.ask}>{hasHistory ? "how's today?" : "how are you today?"}</Text>
          <View style={st.moods}>
            {MOODS.map((m) => (
              <Pressable key={m.v} onPress={() => tap(m.v, m.label)} style={({ pressed }) => [st.mood, pressed && { transform: [{ scale: 0.92 }] }]}>
                <View style={[st.dot, { backgroundColor: m.color }]} />
                <Text style={st.moodTxt}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={st.done}><Feather name="check" size={13} color={c.mint} /><Text style={st.doneTxt}>checked in today</Text></View>
      )}
    </View>
  );
}

const st: any = {
  card: { backgroundColor: "#fff", borderRadius: 22, padding: 15, marginBottom: 16, ...shadow.card },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  headL: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: font.display, fontSize: 15.5, color: c.ink, letterSpacing: -0.4 },
  word: { fontFamily: font.bold, fontSize: 12.5, color: c.accent, letterSpacing: -0.2 },
  chart: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 60, marginBottom: 6, paddingHorizontal: 2 },
  col: { alignItems: "center", flex: 1 },
  barWrap: { height: 52, justifyContent: "flex-end", alignItems: "center" },
  bar: { width: 10, borderRadius: 6 },
  empty: { width: 10, height: 8, borderRadius: 5, backgroundColor: "rgba(23,19,52,0.08)" },
  day: { fontFamily: font.semibold, fontSize: 10, color: c.muted, letterSpacing: -0.2, marginTop: 5, textTransform: "lowercase" },
  reflect: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: c.ink, letterSpacing: -0.2, marginTop: 6, marginBottom: 4 },
  ask: { fontFamily: font.semibold, fontSize: 13.5, color: c.muted, letterSpacing: -0.2, marginTop: 8, marginBottom: 9 },
  moods: { flexDirection: "row", justifyContent: "space-between" },
  mood: { alignItems: "center", flex: 1, gap: 5 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: "#fff", ...shadow.soft },
  moodTxt: { fontFamily: font.semibold, fontSize: 11, color: c.ink, letterSpacing: -0.2 },
  done: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  doneTxt: { fontFamily: font.semibold, fontSize: 13, color: c.muted, letterSpacing: -0.2 },
};
