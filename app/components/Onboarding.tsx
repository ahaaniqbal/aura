import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Orb from "./Orb";
import MicButton from "./MicButton";
import { c, font, layout, r, sp, type as ty } from "../theme";
import { addNote, agent, getGraph } from "../lib/api";

// The first run. A consumer's whole opinion of the app is formed here, so it stays
// short, warm, and pays back immediately: seed a few people, then show their circle.
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 480, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
  }, [step]);

  const go = (n: number) => { Haptics.selectionAsync().catch(() => {}); setStep(n); };

  const saveName = async () => {
    const n = name.trim();
    if (n) addNote(`my name is ${n}`).catch(() => {});
    go(2);
  };

  const captureSeed = async () => {
    const t = seed.trim();
    if (!t) { go(3); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy(true); setStep(3);
    try {
      await agent(t, "onboarding");
      const g = await getGraph();
      setPeople((g.people || []).map((p) => p.person).filter(Boolean));
    } catch (e) {}
    finally { setBusy(false); setStep(4); }
  };

  const finish = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onDone(); };

  return (
    <SafeAreaView style={[fill, { backgroundColor: c.bg }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>

          {step === 0 && (
            <View style={center}>
              <Orb size={104} state="idle" />
              <Text style={hero}>aura remembers the people{"\n"}and promises in your life.</Text>
              <Text style={lede}>so you never drop the ones that matter. let's set up your circle, it takes a minute.</Text>
              <Cta label="get started" onPress={() => go(1)} />
            </View>
          )}

          {step === 1 && (
            <View style={center}>
              <Orb size={72} state="idle" />
              <Text style={q}>what should i call you?</Text>
              <TextInput
                style={input}
                value={name}
                onChangeText={setName}
                placeholder="your name"
                placeholderTextColor={c.muted}
                autoCapitalize="words"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={saveName}
              />
              <Cta label="continue" onPress={saveName} />
              <Skip label="skip" onPress={() => go(2)} />
            </View>
          )}

          {step === 2 && (
            <ScrollView contentContainerStyle={scrollC} keyboardShouldPersistTaps="handled">
              <Orb size={72} state="idle" />
              <Text style={q}>{name ? `who matters to you, ${name.split(" ")[0].toLowerCase()}?` : "who do you never want to lose touch with?"}</Text>
              <Text style={lede}>tell me about a few people. how you know them, birthdays, anything you owe them. i'll keep track.</Text>
              <View style={seedShell}>
                <TextInput
                  style={seedInput}
                  value={seed}
                  onChangeText={setSeed}
                  placeholder="e.g. my sister priya, birthday in march, i owe her a book. mike from work, into film."
                  placeholderTextColor={c.muted}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />
                <View style={seedFooter}>
                  <MicButton onResult={(t) => setSeed((d) => (d ? d + " " + t : t))} size={layout.controlSm} />
                </View>
              </View>
              <Cta label="add them" onPress={captureSeed} />
              <Skip label="i'll do this later" onPress={() => go(4)} />
            </ScrollView>
          )}

          {step === 3 && (
            <View style={center}>
              <Orb size={104} state="thinking" />
              <Text style={q}>getting to know your people…</Text>
              <ActivityIndicator color={c.accent} style={{ marginTop: sp.m }} />
            </View>
          )}

          {step === 4 && (
            <ScrollView contentContainerStyle={scrollC} keyboardShouldPersistTaps="handled">
              <Orb size={88} state="warm" />
              <Text style={hero}>{people.length ? "here's your circle." : "you're all set."}</Text>
              {people.length ? (
                <>
                  <View style={chips}>
                    {people.slice(0, 12).map((p) => (
                      <View key={p} style={chip}><Text style={chipTxt}>{p}</Text></View>
                    ))}
                  </View>
                  <Text style={lede}>i'm keeping track of {people.length === 1 ? "them" : "them all"}. i'll nudge you before birthdays, and when you owe someone. that's the whole idea.</Text>
                </>
              ) : (
                <Text style={lede}>tell me about the people in your life anytime, just talk to me. i'll remember, and quietly help you show up for them.</Text>
              )}
              <Cta label="enter aura" onPress={finish} />
            </ScrollView>
          )}

        </Animated.View>
      </KeyboardAvoidingView>

      {step < 3 ? (
        <View style={dots}>
          {[0, 1, 2].map((i) => <View key={i} style={[dot, step === i && dotOn]} />)}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Cta({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cta, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}>
      <Text style={ctaTxt}>{label}</Text>
      <Feather name="arrow-right" size={18} color={c.bg} />
    </Pressable>
  );
}
function Skip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ marginTop: sp.m, alignSelf: "center" }}>
      <Text style={{ fontFamily: font.medium, fontSize: ty.subhead, color: c.muted }}>{label}</Text>
    </Pressable>
  );
}

const fill: any = { flex: 1 };
const center: any = { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 };
const scrollC: any = { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, paddingVertical: 40 };
const hero: any = { fontFamily: font.display, fontSize: 27, lineHeight: 34, color: c.text, letterSpacing: -0.6, textAlign: "center", marginTop: sp.xl };
const lede: any = { fontFamily: font.body, fontSize: 16, lineHeight: 24, color: c.muted, textAlign: "center", marginTop: sp.m, marginBottom: sp.xl };
const q: any = { fontFamily: font.display, fontSize: 23, lineHeight: 30, color: c.text, letterSpacing: -0.4, textAlign: "center", marginTop: sp.l, marginBottom: sp.s };
const input: any = { alignSelf: "stretch", backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderRadius: 14, paddingHorizontal: 16, height: 54, fontFamily: font.body, fontSize: 17, color: c.text, marginTop: sp.l, textAlign: "center" };
const seedShell: any = { alignSelf: "stretch", backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderRadius: 18, padding: sp.m + 2, marginTop: sp.l, marginBottom: sp.l, minHeight: 150 };
const seedInput: any = { fontFamily: font.body, fontSize: 16, lineHeight: 23, color: c.text, minHeight: 96, padding: 0 };
const seedFooter: any = { flexDirection: "row", justifyContent: "flex-end", marginTop: sp.s, paddingTop: sp.s, borderTopWidth: 1, borderTopColor: c.hairline };
const cta: any = { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp.s, alignSelf: "stretch", height: 56, borderRadius: 16, backgroundColor: c.accent, marginTop: sp.s };
const ctaTxt: any = { fontFamily: font.semibold, fontSize: 17, color: c.bg };
const chips: any = { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: sp.l };
const chip: any = { backgroundColor: c.accentSoft, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 };
const chipTxt: any = { fontFamily: font.semibold, fontSize: 15, color: c.accent };
const dots: any = { flexDirection: "row", justifyContent: "center", gap: 7, paddingBottom: sp.l };
const dot: any = { width: 7, height: 7, borderRadius: 4, backgroundColor: c.hairline };
const dotOn: any = { backgroundColor: c.accent, width: 20 };
