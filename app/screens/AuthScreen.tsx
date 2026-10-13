import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Wordmark } from "../components/Mark";
import { Button, Tabs } from "../components/ui";
import { c, f, inputReset, r, sp, t } from "../theme";
import { login, signup } from "../lib/api";

// The front door is Aura's own color, edge to edge: the one screen allowed to be loud.
export default function AuthScreen({ onAuthed }: { onAuthed: (isNew: boolean, name?: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !pw) { setErr("Enter your email and password."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("That email address doesn't look right."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true); setErr("");
    const res = mode === "login" ? await login(email, pw) : await signup(email, pw, name);
    setBusy(false);
    if (res.ok) onAuthed(mode === "signup", name.trim() || undefined);
    else setErr(friendly(res.error || "", mode));
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
          <View style={{ paddingTop: sp.l }}><Wordmark /></View>
          <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: sp.xh }}>
            <Text style={t.hero} accessibilityRole="header">{"A personal AI\nthat actually\nknows you."}</Text>

            <Tabs onDark style={{ marginTop: sp.h }} value={mode} onChange={(m) => { setErr(""); setMode(m); }}
              options={[{ key: "login", label: "Log in" }, { key: "signup", label: "Create account" }]} />

            {mode === "signup" ? field("name", { value: name, onChangeText: setName, autoCapitalize: "words", textContentType: "givenName", autoComplete: "name-given" }, "First name") : null}
            {field("email", { value: email, onChangeText: setEmail, autoCapitalize: "none", keyboardType: "email-address", autoCorrect: false, textContentType: "emailAddress", autoComplete: "email" }, "Email")}
            {field("pw", { value: pw, onChangeText: setPw, secureTextEntry: !showPw, textContentType: mode === "signup" ? "newPassword" : "password", returnKeyType: "go", onSubmitEditing: submit }, "Password",
              <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={showPw ? "Hide password" : "Show password"} style={{ paddingHorizontal: 14 }}>
                <Feather name={showPw ? "eye-off" : "eye"} size={18} color={c.ink2} />
              </Pressable>)}

            {err ? (
              <View style={s.err} accessibilityLiveRegion="polite"><Feather name="alert-circle" size={15} color={c.ink} /><Text style={s.errTxt}>{err}</Text></View>
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
  label: { fontFamily: f.medium, fontSize: 13, color: c.onAccentMuted, marginBottom: 6 },
  input: { height: 52, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: r.sm, borderWidth: 2, borderColor: c.surface },
  inputFocus: { borderColor: c.ink },
  inputText: { flex: 1, height: 48, paddingHorizontal: 14, fontFamily: f.regular, fontSize: 16, color: c.ink },
  err: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: sp.m },
  errTxt: { fontFamily: f.medium, fontSize: 14, color: c.ink, flex: 1 },
});
