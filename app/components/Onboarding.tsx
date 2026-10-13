import React, { useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Mark, { Wordmark } from "./Mark";
import MicButton from "./MicButton";
import Avatar from "./Avatar";
import { Button, EASE_OUT, IconButton } from "./ui";
import { c, f, inputReset, r, sp, t } from "../theme";
import { addNote, agent, getGraph } from "../lib/api";

// First run. It opens and closes on cobalt, Aura's own color; the two questions in between are
// plain and quiet so the typing is the focus. The payoff is your circle, named back to you.
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [step]);

  const go = (n: number) => { Haptics.selectionAsync().catch(() => {}); setStep(n); };
  const saveName = () => { const n = name.trim(); if (n) addNote(`my name is ${n}`).catch(() => {}); go(2); };
  const captureSeed = async () => {
    const text = seed.trim();
    if (!text) { go(4); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStep(3); setFailed(false);
    try { await agent(text, "onboarding"); const g = await getGraph(); setPeople((g.people || []).map((p) => p.person).filter(Boolean)); }
    catch (e) { setFailed(true); } finally { setStep(4); }
  };
  const finish = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onDone(); };
  const firstName = name.trim().split(" ")[0];
  const brand = step === 0 || step === 4;

  return (
    <SafeAreaView style={[s.root, brand && { backgroundColor: c.accent }]}>
      <StatusBar style={brand ? "light" : "dark"} />
      {step === 1 || step === 2 ? (
        <View style={s.nav}>
          <IconButton icon="chevron-left" size={36} variant="plain" onPress={() => go(step - 1)} label="Back" />
          <Text style={t.caption}>{step} of 2</Text>
          <View style={{ width: 36 }} />
        </View>
      ) : null}
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[s.fill, { opacity: fade }]}>

          {step === 0 && (
            <View style={s.page}>
              <View style={{ paddingTop: sp.l }}><Wordmark color={c.onAccent} /></View>
              <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: sp.h }}>
                <Preview />
                <Text style={[t.display, s.onBrand, { marginTop: sp.h }]}>Remember the people who matter.</Text>
                <Text style={[t.callout, { color: c.onAccentMuted, marginTop: sp.m }]}>Birthdays, promises, what they're going through. Aura keeps it and tells you when it counts.</Text>
              </View>
              <Button label="Get started" variant="inverse" onPress={() => go(1)} />
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
              <Button label="Skip" variant="ghost" onPress={() => go(2)} style={{ marginTop: sp.xs }} />
            </View>
          )}

          {step === 2 && (
            <ScrollView contentContainerStyle={s.scrollPage} keyboardShouldPersistTaps="handled">
              <View style={{ flex: 1, paddingTop: sp.xl }}>
                <Text style={t.title1}>{firstName ? `Who matters most to you, ${firstName}?` : "Who matters most to you?"}</Text>
                <Text style={[t.callout, { marginTop: sp.s }]}>Write it the way you'd tell a friend: how you know them, birthdays, anything you owe them.</Text>
                <View style={s.letter}>
                  <TextInput style={[s.letterInput, inputReset]} value={seed} onChangeText={setSeed} multiline textAlignVertical="top" autoFocus selectionColor={c.accent}
                    placeholder="My sister Priya, birthday in March. I owe her a book. Mike from work, he's into film." placeholderTextColor={c.faint} accessibilityLabel="People who matter to you" />
                  <View style={s.letterFoot}>
                    <Text style={[t.footnote, { flex: 1 }]}>Or dictate it</Text>
                    <MicButton onResult={(x) => setSeed((d) => (d ? d + " " + x : x))} size={36} />
                  </View>
                </View>
              </View>
              <Button label="Add them" onPress={captureSeed} disabled={!seed.trim()} style={{ marginTop: sp.xl }} />
              <Button label="Do this later" variant="ghost" onPress={() => go(4)} style={{ marginTop: sp.xs }} />
            </ScrollView>
          )}

          {step === 3 && (
            <View style={[s.page, { justifyContent: "center" }]}>
              <Mark size={40} state="thinking" />
              <Text style={[t.title1, { marginTop: sp.xl }]}>Reading about your people</Text>
              <Text style={[t.callout, { marginTop: 6 }]}>Names, birthdays and promises, filed one by one.</Text>
            </View>
          )}

          {step === 4 && (
            <ScrollView contentContainerStyle={s.scrollPage}>
              <View style={{ flex: 1, justifyContent: "center", paddingVertical: sp.h }}>
                {people.length ? (
                  <>
                    <Text style={[t.caption, { color: c.onAccentMuted }]}>Your circle</Text>
                    <View style={{ marginTop: sp.m }}>
                      {people.slice(0, 7).map((p) => <Text key={p} style={[t.display, s.onBrand]}>{p}</Text>)}
                      {people.length > 7 ? <Text style={[t.title2, { color: c.onAccentMuted, marginTop: sp.s }]}>and {people.length - 7} more</Text> : null}
                    </View>
                    <Text style={[t.callout, { color: c.onAccentMuted, marginTop: sp.xxl }]}>Aura will tell you before their birthdays and when you owe them something.</Text>
                  </>
                ) : (
                  <>
                    <Text style={[t.display, s.onBrand]}>{failed ? "Let's finish this inside." : "You're set."}</Text>
                    <Text style={[t.callout, { color: c.onAccentMuted, marginTop: sp.m }]}>{failed
                      ? "That didn't save. Tell Aura about your people from the Ask tab whenever you're ready."
                      : "Tell Aura about someone whenever they come to mind. It will remember for you."}</Text>
                  </>
                )}
              </View>
              <Button label="Open Aura" variant="inverse" onPress={finish} />
            </ScrollView>
          )}

        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// A real slice of the product on the welcome screen: the reminders Aura actually surfaces.
function Preview() {
  const rows = [
    { name: "Priya Shah", text: "Priya's birthday", meta: "Thursday" },
    { name: "Mike Chen", text: "Lend Mike The Power Broker", meta: "Overdue", signal: true },
    { name: "Sam Ortiz", text: "Reconnect with Sam", meta: "5 weeks" },
  ];
  return (
    <View style={s.preview}>
      {rows.map((x, i) => (
        <View key={x.name} style={[s.previewRow, i > 0 && s.previewSep]}>
          <Avatar name={x.name} size={32} signal={x.signal} />
          <Text style={[t.label, { flex: 1 }]} numberOfLines={1}>{x.text}</Text>
          <Text style={[t.caption, x.signal && { color: c.signalText }]}>{x.meta}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.canvas },
  fill: { flex: 1 },
  onBrand: { color: c.onAccent },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 6 },
  page: { flex: 1, paddingHorizontal: 24, paddingBottom: 20 },
  scrollPage: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 20 },
  nameInput: { fontFamily: f.medium, fontSize: 32, letterSpacing: -1, color: c.ink, marginTop: sp.h, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.ink },
  letter: { backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.lineStrong, padding: sp.l, marginTop: sp.xxl },
  letterInput: { fontFamily: f.regular, fontSize: 17, lineHeight: 25, color: c.ink, minHeight: 150, padding: 0 },
  letterFoot: { flexDirection: "row", alignItems: "center", marginTop: sp.m, paddingTop: sp.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  preview: { backgroundColor: c.surface, borderRadius: r.md },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  previewSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
});
