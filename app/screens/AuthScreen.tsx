import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Mark from "../components/Mark";
import { Button, IconButton, LinkButton } from "../components/ui";
import { c, f, inputReset, r, sp, t } from "../theme";
import { login, signup } from "../lib/api";
import { ACCESSORIES, AuraLook, EXPRESSIONS, SWATCHES, TEXTURES } from "../lib/faces";

// The front door: a crowd of Auras, each dressed differently, because yours will be too.
export default function AuthScreen({ onAuthed }: { onAuthed: (isNew: boolean, name?: string) => void }) {
  const [mode, setMode] = useState<"welcome" | "login" | "signup">("welcome");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState<string | null>(null);

  if (mode === "welcome") return <Welcome onStart={() => setMode("signup")} onLogin={() => setMode("login")} />;

  const submit = async () => {
    if (!email.trim() || !pw) { setErr("Enter your email and password."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("That email address doesn't look right."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true); setErr("");
    const res = mode === "login" ? await login(email, pw) : await signup(email, pw, name);
    setBusy(false);
    if (res.ok) onAuthed(mode === "signup", name.trim() || undefined);
    else setErr(friendly(res.error || "", mode as "login" | "signup"));
  };

  const field = (key: string, props: React.ComponentProps<typeof TextInput>, label: string, trailing?: React.ReactNode) => (
    <View style={{ marginTop: sp.m }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.input, focus === key && s.inputFocus]}>
        <TextInput {...props} accessibilityLabel={label} style={[s.inputText, inputReset]} placeholderTextColor={c.faint} selectionColor={c.ink}
          onFocus={() => setFocus(key)} onBlur={() => setFocus((x) => (x === key ? null : x))} />
        {trailing}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <View style={s.nav}>
            <IconButton icon="chevron-left" size={40} onPress={() => { setErr(""); setMode("welcome"); }} label="Back" />
          </View>
          <Mark size={56} style={{ marginTop: sp.xl }} />
          <Text style={[t.title1, { marginTop: sp.l }]} accessibilityRole="header">{mode === "signup" ? "Create your account" : "Welcome back"}</Text>
          <Text style={[t.callout, { marginTop: sp.xs }]}>{mode === "signup" ? "Aura starts learning about you right away." : "Aura kept everything right where you left it."}</Text>

          {mode === "signup" ? field("name", { value: name, onChangeText: setName, autoCapitalize: "words", textContentType: "givenName", autoComplete: "name-given" }, "First name") : null}
          {field("email", { value: email, onChangeText: setEmail, autoCapitalize: "none", keyboardType: "email-address", autoCorrect: false, textContentType: "emailAddress", autoComplete: "email" }, "Email")}
          {field("pw", { value: pw, onChangeText: setPw, secureTextEntry: !showPw, textContentType: mode === "signup" ? "newPassword" : "password", returnKeyType: "go", onSubmitEditing: submit }, "Password",
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={showPw ? "Hide password" : "Show password"} style={{ paddingHorizontal: 14 }}>
              <Feather name={showPw ? "eye-off" : "eye"} size={18} color={c.ink2} />
            </Pressable>)}

          {err ? (
            <View style={s.err} accessibilityLiveRegion="polite"><Feather name="alert-circle" size={15} color={c.accentText} /><Text style={s.errTxt}>{err}</Text></View>
          ) : null}
          <Button label={mode === "login" ? "Log in" : "Create account"} onPress={submit} loading={busy} style={{ marginTop: sp.xl }} />
          <LinkButton label={mode === "login" ? "New here? Create an account" : "Already have an account? Log in"} color={c.ink2} onPress={() => { setErr(""); setMode(mode === "login" ? "signup" : "login"); }} style={{ alignSelf: "center", marginTop: sp.m }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------- welcome: a crowd of Auras ----------
const ROWS = 7, PER_ROW = 7;
function crowd(): AuraLook[][] {
  const colors = SWATCHES.filter((x) => x.key !== "ink").map((x) => x.key);
  const acc = ACCESSORIES.map((x) => x.key);
  return Array.from({ length: ROWS }, (_, r) => Array.from({ length: PER_ROW }, (_, i) => {
    const n = r * PER_ROW + i;
    return {
      color: colors[(n * 3 + r) % colors.length], texture: TEXTURES[(n + r) % TEXTURES.length].key,
      expression: EXPRESSIONS[(n * 2) % EXPRESSIONS.length].key, accessory: n % 3 === 0 ? acc[1 + ((n / 3) % (acc.length - 1))] : "none", backdrop: "none",
    } as AuraLook;
  }));
}
function Welcome({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const rows = useRef(crowd()).current;
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loop.start();
    }).catch(() => {});
    return () => loop?.stop();
  }, []);
  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="dark" />
      <View style={s.crowd} importantForAccessibility="no-hide-descendants" accessible={false}>
        {rows.map((row, r) => (
          <Animated.View key={r} style={[s.crowdRow, { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: r % 2 ? [-28 - 10, -28 + 10] : [6 + 10, 6 - 10] }) }] }]}>
            {row.map((look, i) => <Mark key={i} size={62} look={look} />)}
          </Animated.View>
        ))}
        <LinearGradient colors={["rgba(251,251,252,0)", c.canvas]} style={s.fade} pointerEvents="none" />
      </View>
      <View style={s.welcomeFoot}>
        <Text style={[t.hero, { textAlign: "center" }]} accessibilityRole="header">Hi, I'm Aura</Text>
        <Text style={[t.callout, { textAlign: "center", marginTop: sp.s }]}>Your personal AI for work and life.</Text>
        <Button label="Get started" variant="accent" onPress={onStart} style={{ marginTop: sp.xl, borderRadius: 26 }} />
        <LinkButton label="I already have an account" color={c.ink} onPress={onLogin} style={{ alignSelf: "center", marginTop: sp.s }} />
      </View>
    </SafeAreaView>
  );
}

// Turn server and network errors into a sentence a person can act on.
function friendly(raw: string, mode: "login" | "signup"): string {
  const e = raw.toLowerCase();
  if (e.includes("network")) return "Can't reach Aura. Check your connection and try again.";
  if (mode === "login" && (e.includes("invalid") || e.includes("credential") || e.includes("password") || e.includes("sign in"))) return "That email and password don't match.";
  if (mode === "signup" && (e.includes("exist") || e.includes("taken") || e.includes("already"))) return "There's already an account with that email. Log in instead.";
  if (mode === "signup" && e.includes("password")) return raw ? raw[0].toUpperCase() + raw.slice(1) : "Choose a longer password.";
  return mode === "login" ? "Couldn't log you in. Try again in a moment." : "Couldn't create your account. Try again in a moment.";
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.canvas },
  page: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },
  nav: { paddingTop: sp.s },
  label: { fontFamily: f.medium, fontSize: 13, color: c.ink2, marginBottom: 6 },
  input: { height: 52, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: r.sm, borderWidth: 1, borderColor: c.control },
  inputFocus: { borderColor: c.ink, borderWidth: 1.5 },
  inputText: { flex: 1, height: 48, paddingHorizontal: 14, fontFamily: f.regular, fontSize: 16, color: c.ink },
  err: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: sp.m },
  errTxt: { fontFamily: f.medium, fontSize: 14, color: c.accentText, flex: 1 },
  crowd: { flex: 1, overflow: "hidden", paddingTop: sp.xl, gap: 14 },
  crowdRow: { flexDirection: "row", gap: 6 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 220 },
  welcomeFoot: { paddingHorizontal: 24, paddingBottom: 20 },
});
