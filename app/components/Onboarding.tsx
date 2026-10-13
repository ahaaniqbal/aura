import React, { useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Mark from "./Mark";
import MicButton from "./MicButton";
import { Button, Divider, EASE_OUT, IconButton, Press } from "./ui";
import { c, f, inputReset, r, sp, t } from "../theme";
import { addNote, agent, getFeed, Personality, saveSettings } from "../lib/api";
import { AuraLook, DEFAULT_LOOK } from "../lib/auras";
import Personalize from "./Personalize";
import { PERSONALITIES } from "../lib/personality";

// First run. You pick Aura's look, then tell it your name, how it should talk and
// what's on your plate. It closes on vermilion with Aura showing back what it already knows.
export default function Onboarding({ onDone, initialName, onLook }: { onDone: () => void; initialName?: string; onLook?: (l: AuraLook) => void }) {
  const [step, setStep] = useState(0);
  const [look, setLook] = useState<AuraLook>(DEFAULT_LOOK);
  const [name, setName] = useState(initialName || "");
  const [personality, setPersonality] = useState<Personality>("witty");
  const [seed, setSeed] = useState("");
  const [known, setKnown] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [step]);

  const go = (n: number) => { Haptics.selectionAsync().catch(() => {}); setStep(n); };
  const saveLook = (l: AuraLook) => { setLook(l); onLook?.(l); saveSettings({ look: l }).catch(() => {}); go(initialName ? 2 : 1); };
  const saveName = () => { const n = name.trim(); if (n) addNote(`my name is ${n}`).catch(() => {}); go(2); };
  const savePersonality = () => { saveSettings({ personality }).catch(() => {}); go(3); };
  const captureSeed = async () => {
    const text = seed.trim();
    if (!text) { go(5); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStep(4); setFailed(false);
    try {
      await agent(text, "onboarding");
      const fd = await getFeed();
      setKnown((fd.memories || []).filter((m) => m.kind !== "task" && !/^my name is/i.test(m.text)).map((m) => m.text).slice(0, 5));
    } catch (e) { setFailed(true); } finally { setStep(5); }
  };
  const finish = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onDone(); };
  const firstName = name.trim().split(" ")[0];
  const brand = step === 5;
  const qSteps = initialName ? [0, 2, 3] : [0, 1, 2, 3];
  const qIndex = qSteps.indexOf(step);

  return (
    <SafeAreaView style={[s.root, brand && { backgroundColor: c.accent }]}>
      <StatusBar style={brand ? "light" : "dark"} />
      {qIndex > 0 ? (
        <View style={s.nav}>
          <IconButton icon="chevron-left" size={36} variant="plain" onPress={() => go(qIndex === 0 ? 0 : qSteps[qIndex - 1])} label="Back" />
          <Text style={t.caption}>{qIndex + 1} of {qSteps.length}</Text>
          <View style={{ width: 36 }} />
        </View>
      ) : null}
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[s.fill, { opacity: fade }]}>

          {step === 0 && (
            <View style={s.fill}>
              <View style={s.lookHead}>
                <Text style={t.caption}>1 of {qSteps.length}</Text>
                <Text style={[t.title1, { marginTop: sp.s }]}>Pick Aura's look</Text>
                <Text style={[t.callout, { marginTop: sp.xs }]}>This is how Aura shows up for you. You can change it anytime.</Text>
              </View>
              <Personalize inline initial={look} onSave={saveLook} saveLabel="Continue" />
            </View>
          )}

          {step === 1 && (
            <View style={s.page}>
              <View style={{ flex: 1, paddingTop: sp.xl }}>
                <Text style={t.title1}>What should Aura call you?</Text>
                <TextInput style={[s.nameInput, inputReset]} value={name} onChangeText={setName} placeholder="First name" placeholderTextColor={c.faint}
                  autoCapitalize="words" autoFocus returnKeyType="next" onSubmitEditing={saveName} selectionColor={c.accent} accessibilityLabel="Your first name" />
              </View>
              <Button label="Continue" onPress={saveName} disabled={!name.trim()} />
            </View>
          )}

          {step === 2 && (
            <ScrollView contentContainerStyle={s.scrollPage}>
              <View style={{ flex: 1, paddingTop: sp.xl }}>
                <Text style={t.title1}>{firstName ? `How should Aura talk to you, ${firstName}?` : "How should Aura talk to you?"}</Text>
                <Text style={[t.callout, { marginTop: sp.s }]}>Same help, different voice. You can change it anytime.</Text>
                <View style={s.options}>
                  {PERSONALITIES.map((p, i) => {
                    const on = personality === p.key;
                    return (
                      <View key={p.key}>
                        {i > 0 ? <Divider /> : null}
                        <Press onPress={() => setPersonality(p.key)} style={s.option} scaleTo={0.99} accessibilityRole="radio" accessibilityLabel={`${p.label}. ${p.line}`}>
                          <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                          <View style={{ flex: 1 }}>
                            <Text style={t.label}>{p.label}</Text>
                            <Text style={[t.footnote, { marginTop: 2 }]}>{p.line}</Text>
                            {on ? <View style={s.sample}><Text style={t.callout}>{p.sample}</Text></View> : null}
                          </View>
                        </Press>
                      </View>
                    );
                  })}
                </View>
              </View>
              <Button label="Continue" onPress={savePersonality} style={{ marginTop: sp.xl }} />
            </ScrollView>
          )}

          {step === 3 && (
            <ScrollView contentContainerStyle={s.scrollPage} keyboardShouldPersistTaps="handled">
              <View style={{ flex: 1, paddingTop: sp.xl }}>
                <Text style={t.title1}>What's on your plate?</Text>
                <Text style={[t.callout, { marginTop: sp.s }]}>Your work, your week, the people around you, what you're trying to get done. Anything Aura should know.</Text>
                <View style={s.letter}>
                  <TextInput style={[s.letterInput, inputReset]} value={seed} onChangeText={setSeed} multiline textAlignVertical="top" autoFocus selectionColor={c.accent}
                    placeholder="I run product at a 20 person startup. Launch is on the 28th. Training for a half marathon. My sister Priya's birthday is in March." placeholderTextColor={c.faint} accessibilityLabel="What's on your plate" />
                  <View style={s.letterFoot}>
                    <Text style={[t.footnote, { flex: 1 }]}>Or dictate it</Text>
                    <MicButton onResult={(x) => setSeed((d) => (d ? d + " " + x : x))} size={36} />
                  </View>
                </View>
              </View>
              <Button label="Continue" onPress={captureSeed} disabled={!seed.trim()} style={{ marginTop: sp.xl }} />
              <Button label="Skip for now" variant="ghost" onPress={() => go(5)} style={{ marginTop: sp.xs }} />
            </ScrollView>
          )}

          {step === 4 && (
            <View style={[s.page, { justifyContent: "center" }]}>
              <Mark size={72} state="thinking" />
              <Text style={[t.title1, { marginTop: sp.l }]}>Getting to know you</Text>
              <Text style={[t.callout, { marginTop: 6 }]}>Picking out what's worth remembering.</Text>
            </View>
          )}

          {step === 5 && (
            <ScrollView contentContainerStyle={s.scrollPage}>
              <View style={{ flex: 1, justifyContent: "center", paddingVertical: sp.h }}>
                <Text style={[t.display, { color: c.onAccent }]}>{firstName ? `Aura's ready, ${firstName}.` : "Aura's ready."}</Text>
                {known.length ? (
                  <>
                    <Text style={[t.caption, { color: c.onAccent, marginTop: sp.xl }]}>What it knows so far</Text>
                    <View style={s.known}>
                      {known.map((k, i) => <Text key={i} style={[t.body, { color: c.onAccent }, s.knownItem, i > 0 && s.knownSep]}>{k}</Text>)}
                    </View>
                  </>
                ) : (
                  <Text style={[t.callout, { color: c.onAccent, marginTop: sp.m }]}>{failed
                    ? "That didn't save. Tell Aura about yourself in the chat whenever you're ready."
                    : "Talk to it about anything. The more it knows, the less you have to explain."}</Text>
                )}
              </View>
              <Button label="Start talking" onPress={finish} />
            </ScrollView>
          )}

        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.canvas },
  fill: { flex: 1 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 6 },
  page: { flex: 1, paddingHorizontal: 24, paddingBottom: 20 },
  scrollPage: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 20 },
  nameInput: { fontFamily: f.medium, fontSize: 32, letterSpacing: -1, color: c.ink, marginTop: sp.h, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.ink },
  options: { marginTop: sp.xl, borderTopWidth: 1, borderTopColor: c.ink },
  option: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.control, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioOn: { borderColor: c.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink },
  sample: { marginTop: sp.m, backgroundColor: c.sunken, borderRadius: r.md, paddingHorizontal: 14, paddingVertical: 10 },
  letter: { backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.control, padding: sp.l, marginTop: sp.xxl },
  letterInput: { fontFamily: f.regular, fontSize: 17, lineHeight: 25, color: c.ink, minHeight: 150, padding: 0 },
  letterFoot: { flexDirection: "row", alignItems: "center", marginTop: sp.m, paddingTop: sp.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  lookHead: { paddingHorizontal: 24, paddingTop: sp.l },
  known: { marginTop: sp.s, borderTopWidth: 1, borderTopColor: c.onAccent },
  knownItem: { paddingVertical: 11 },
  knownSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.45)" },
});
