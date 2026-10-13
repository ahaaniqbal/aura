import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Wordmark } from "../components/Mark";
import { Button, Tabs } from "../components/ui";
import { c, f, inputReset, r, sp, t } from "../theme";
import { login, signup } from "../lib/api";

// The front door is Aura's own color, edge to edge: the one screen allowed to be loud.
export default function AuthScreen({ onAuthed }: { onAuthed: (isNew: boolean) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!email.trim() || !pw) { setErr("Enter your email and password."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("That email address doesn't look right."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true); setErr("");
    const res = mode === "login" ? await login(email, pw) : await signup(email, pw, name);
    setBusy(false);
    if (res.ok) onAuthed(mode === "signup");
    else setErr(friendly(res.error || "", mode));
  };

  const field = (props: React.ComponentProps<typeof TextInput>, label: string) => (
    <View style={{ marginTop: sp.m }}>
      <Text style={s.label}>{label}</Text>
      <TextInput {...props} accessibilityLabel={label} style={[s.input, inputReset]} placeholderTextColor={c.faint} selectionColor={c.accent} />
    </View>
  );

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <View style={{ paddingTop: sp.l }}><Wordmark color={c.onAccent} /></View>
          <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: sp.xh }}>
            <Text style={s.hero} accessibilityRole="header">{"The people\nyou love,\nremembered."}</Text>

            <Tabs onDark style={{ marginTop: sp.h }} value={mode} onChange={(m) => { setErr(""); setMode(m); }}
              options={[{ key: "login", label: "Log in" }, { key: "signup", label: "Create account" }]} />

            {mode === "signup" ? field({ value: name, onChangeText: setName, autoCapitalize: "words", textContentType: "givenName", autoComplete: "name-given" }, "First name") : null}
            {field({ value: email, onChangeText: setEmail, autoCapitalize: "none", keyboardType: "email-address", autoCorrect: false, textContentType: "emailAddress", autoComplete: "email" }, "Email")}
            {field({ value: pw, onChangeText: setPw, secureTextEntry: true, textContentType: mode === "signup" ? "newPassword" : "password", returnKeyType: "go", onSubmitEditing: submit }, "Password")}

            {err ? (
              <View style={s.err} accessibilityLiveRegion="polite"><Feather name="alert-circle" size={15} color={c.onAccent} /><Text style={s.errTxt}>{err}</Text></View>
            ) : null}
            <Button label={mode === "login" ? "Log in" : "Create account"} onPress={submit} loading={busy} style={{ marginTop: sp.xl }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  fill: { flex: 1, backgroundColor: c.accent },
  page: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },
  hero: { fontFamily: f.medium, fontSize: 48, lineHeight: 49, letterSpacing: -2.2, color: c.onAccent },
  label: { fontFamily: f.medium, fontSize: 13, color: c.onAccentMuted, marginBottom: 6 },
  input: { height: 52, backgroundColor: c.surface, borderRadius: r.sm, paddingHorizontal: 16, fontFamily: f.regular, fontSize: 16, color: c.ink },
  err: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: sp.m },
  errTxt: { fontFamily: f.medium, fontSize: 14, color: c.onAccent, flex: 1 },
});
