import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Orb from "./Orb";
import MicButton from "./MicButton";
import { c, font, grad, shadow, sp } from "../theme";
import { addNote, agent, getGraph } from "../lib/api";

// The first run. Immersive dream-gradient canvas, glossy inputs, puffy CTA — cohesive with
// the hero screens. Short and warm: seed a few people, then show their circle back.
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 460, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
  }, [step]);

  const go = (n: number) => { Haptics.selectionAsync().catch(() => {}); setStep(n); };
  const saveName = () => { const n = name.trim(); if (n) addNote(`my name is ${n}`).catch(() => {}); go(2); };
  const captureSeed = async () => {
    const t = seed.trim();
    if (!t) { go(4); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy(true); setStep(3); setFailed(false);
    try { await agent(t, "onboarding"); const g = await getGraph(); setPeople((g.people || []).map((p) => p.person).filter(Boolean)); }
    catch (e) { setFailed(true); } finally { setBusy(false); setStep(4); }
  };
  const finish = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onDone(); };

  return (
    <View style={st.fill}>
      <LinearGradient colors={grad.cons as any} style={st.abs} />
      <StatusBar style="light" />
      <SafeAreaView style={st.fill}>
        <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View style={[st.fill, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>

            {step === 0 && (
              <View style={st.center}>
                <Orb size={104} state="idle" />
                <Text style={st.hero}>aura remembers the people{"\n"}and promises in your life.</Text>
                <Text style={st.lede}>so you never drop the ones that matter. let's set up your circle, it takes a minute.</Text>
                <Cta label="get started" onPress={() => go(1)} />
              </View>
            )}

            {step === 1 && (
              <View style={st.center}>
                <Orb size={72} state="idle" />
                <Text style={st.q}>what should i call you?</Text>
                <TextInput style={st.input} value={name} onChangeText={setName} placeholder="your name" placeholderTextColor="#a99fd6" autoCapitalize="words" autoFocus returnKeyType="next" onSubmitEditing={saveName} />
                <Cta label="continue" onPress={saveName} />
                <Skip label="skip" onPress={() => go(2)} />
              </View>
            )}

            {step === 2 && (
              <ScrollView contentContainerStyle={st.scrollC} keyboardShouldPersistTaps="handled">
                <Orb size={72} state="idle" />
                <Text style={st.q}>{name ? `who matters to you, ${name.split(" ")[0].toLowerCase()}?` : "who do you never want to lose touch with?"}</Text>
                <Text style={st.lede}>tell me about a few people. how you know them, birthdays, anything you owe them. i'll keep track.</Text>
                <View style={st.seedShell}>
                  <TextInput style={st.seedInput} value={seed} onChangeText={setSeed} placeholder="e.g. my sister priya, birthday in march, i owe her a book. mike from work, into film." placeholderTextColor="#a99fd6" multiline textAlignVertical="top" autoFocus />
                  <View style={st.seedFooter}><MicButton onResult={(t) => setSeed((d) => (d ? d + " " + t : t))} size={38} /></View>
                </View>
                <Cta label="add them" onPress={captureSeed} />
                <Skip label="i'll do this later" onPress={() => go(4)} />
              </ScrollView>
            )}

            {step === 3 && (
              <View style={st.center}>
                <Orb size={104} state="thinking" />
                <Text style={st.q}>getting to know your people…</Text>
                <ActivityIndicator color="#fff" style={{ marginTop: sp.m }} />
              </View>
            )}

            {step === 4 && (
              <ScrollView contentContainerStyle={st.scrollC} keyboardShouldPersistTaps="handled">
                <Orb size={88} state="warm" />
                <Text style={st.hero}>{people.length ? "here's your circle." : failed ? "we'll pick this up inside." : "you're all set."}</Text>
                {people.length ? (
                  <>
                    <View style={st.chips}>{people.slice(0, 12).map((p) => (<View key={p} style={st.chip}><Text style={st.chipTxt}>{p}</Text></View>))}</View>
                    <Text style={st.lede}>i'm keeping track of {people.length === 1 ? "them" : "them all"}. i'll nudge you before birthdays, and when you owe someone. that's the whole idea.</Text>
                  </>
                ) : (
                  <Text style={st.lede}>{failed ? "i had a little trouble saving that just now. no worries, tell me about your people anytime, just talk to me and i'll remember." : "tell me about the people in your life anytime, just talk to me. i'll remember, and quietly help you show up for them."}</Text>
                )}
                <Cta label="enter aura" onPress={finish} />
              </ScrollView>
            )}

          </Animated.View>
        </KeyboardAvoidingView>
        {step < 3 ? (<View style={st.dots}>{[0, 1, 2].map((i) => <View key={i} style={[st.dot, step === i && st.dotOn]} />)}</View>) : null}
      </SafeAreaView>
    </View>
  );
}

function Cta({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.cta, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}>
      <Text style={st.ctaTxt}>{label}</Text>
      <Feather name="arrow-right" size={18} color={c.accent} />
    </Pressable>
  );
}
function Skip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ marginTop: sp.m, alignSelf: "center" }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: "rgba(255,255,255,0.8)", letterSpacing: -0.2 }}>{label}</Text>
    </Pressable>
  );
}

const st: any = {
  fill: { flex: 1 },
  abs: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  scrollC: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, paddingVertical: 36 },
  hero: { fontFamily: font.display, fontSize: 27, lineHeight: 33, color: "#fff", letterSpacing: -0.8, textAlign: "center", marginTop: sp.xl },
  lede: { fontFamily: font.medium, fontSize: 16, lineHeight: 24, color: "rgba(255,255,255,0.9)", textAlign: "center", letterSpacing: -0.2, marginTop: sp.m, marginBottom: sp.xl },
  q: { fontFamily: font.display, fontSize: 23, lineHeight: 29, color: "#fff", letterSpacing: -0.6, textAlign: "center", marginTop: sp.l, marginBottom: sp.s },
  input: { alignSelf: "stretch", backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 18, height: 56, fontFamily: font.semibold, fontSize: 17, color: c.ink, letterSpacing: -0.2, marginTop: sp.l, textAlign: "center", ...shadow.card },
  seedShell: { alignSelf: "stretch", backgroundColor: "#fff", borderRadius: 20, padding: sp.m + 2, marginTop: sp.l, marginBottom: sp.l, minHeight: 150, ...shadow.card },
  seedInput: { fontFamily: font.medium, fontSize: 16, lineHeight: 23, color: c.ink, letterSpacing: -0.2, minHeight: 96, padding: 0 },
  seedFooter: { flexDirection: "row", justifyContent: "flex-end", marginTop: sp.s, paddingTop: sp.s, borderTopWidth: 1, borderTopColor: "#eee" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp.s, alignSelf: "stretch", height: 56, borderRadius: 18, backgroundColor: "#fff", borderWidth: 3, borderColor: "rgba(255,255,255,0.6)", marginTop: sp.s, ...shadow.puff },
  ctaTxt: { fontFamily: font.bold, fontSize: 17, color: c.accent, letterSpacing: -0.3 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: sp.l },
  chip: { backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", ...shadow.soft },
  chipTxt: { fontFamily: font.bold, fontSize: 15, color: c.accent, letterSpacing: -0.2 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, paddingBottom: sp.l },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.35)" },
  dotOn: { backgroundColor: "#fff", width: 20 },
};
