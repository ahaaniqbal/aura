import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { c, f, r, sp, t } from "../theme";
import type { Pulse } from "../lib/api";

// Aura's read on you: a week of one-tap check-ins drawn as plain bars, and a line reflecting it
// back. The bars are ink; their height carries the mood, so nothing depends on color.
const MOODS = [
  { v: -2, key: "rough", label: "Rough" },
  { v: -1, key: "low", label: "Low" },
  { v: 0, key: "ok", label: "Okay" },
  { v: 1, key: "good", label: "Good" },
  { v: 2, key: "great", label: "Great" },
];
const vheight = (v: number) => 10 + (Math.max(-2, Math.min(2, v)) + 2) * 12;
function stateWord(avg: number | null): string | null {
  if (avg === null) return null;
  if (avg <= -1) return "A heavy stretch";
  if (avg < -0.2) return "A bit low";
  if (avg < 0.5) return "Steady";
  if (avg < 1.3) return "A good week";
  return "A great week";
}

export default function PulseCard({ pulse, onPulse }: { pulse: Pulse | null; onPulse: (valence: number, mood: string) => void }) {
  const days = (pulse?.days || []).slice(-7);
  const hasHistory = days.some((d) => d.valence !== null);
  const word = stateWord(pulse?.avg7 ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const logged = !!pulse?.todayLogged || !!picked;
  const tap = (v: number, key: string, label: string) => { Haptics.selectionAsync().catch(() => {}); setPicked(label); onPulse(v, key); };

  return (
    <View>
      {word ? <Text style={[t.title2, { marginTop: sp.m }]}>{word}</Text> : null}
      {pulse?.reflection ? <Text style={[t.callout, { marginTop: 6 }]}>{pulse.reflection}</Text> : null}
      {hasHistory ? (
        <View style={s.chart} accessibilityLabel={`Mood over the last ${days.length} days`}>
          {days.map((d, i) => {
            const last = i === days.length - 1;
            const mood = d.valence === null ? null : MOODS[Math.round(d.valence) + 2];
            return (
              <View key={i} style={s.col} accessibilityLabel={`${d.day}: ${mood ? mood.label : "no check-in"}`}>
                <View style={s.barWrap}>
                  {d.valence === null ? <View style={s.none} /> : <View style={[s.bar, { height: vheight(d.valence) }]} />}
                </View>
                <Text style={[s.day, last && { color: c.ink }]}>{(d.day || "").slice(0, 3)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={[t.subhead, { marginTop: sp.xl, marginBottom: sp.s }]}>
        {logged ? (picked ? `Checked in today: ${picked.toLowerCase()}.` : "You've checked in today.") : hasHistory ? "How's today?" : "How are you today?"}
      </Text>
      {!logged ? (
        <View style={s.picker} accessibilityRole="radiogroup">
          {MOODS.map((m, i) => (
            <Pressable key={m.v} onPress={() => tap(m.v, m.key, m.label)} accessibilityRole="radio" accessibilityLabel={m.label}
              style={({ pressed }) => [s.option, i > 0 && s.optionSep, pressed && { backgroundColor: c.sunken }]}>
              <Text style={s.optionTxt}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  chart: { flexDirection: "row", alignItems: "flex-end", marginTop: sp.xl, gap: 6 },
  col: { flex: 1, alignItems: "stretch" },
  barWrap: { height: 60, justifyContent: "flex-end" },
  bar: { backgroundColor: c.ink, borderRadius: 2 },
  none: { height: 2, backgroundColor: c.lineStrong },
  day: { fontFamily: f.regular, fontSize: 12, color: c.muted, marginTop: 8 },
  picker: { flexDirection: "row", borderWidth: 1, borderColor: c.lineStrong, borderRadius: r.sm, overflow: "hidden" },
  option: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  optionSep: { borderLeftWidth: 1, borderLeftColor: c.lineStrong },
  optionTxt: { fontFamily: f.medium, fontSize: 14, color: c.ink },
});
