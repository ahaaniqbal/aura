import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Orb from "./Orb";
import { c, font, grad, shadow } from "../theme";
import { transcribe, capture } from "../lib/api";

type Phase = "idle" | "rec" | "proc" | "done" | "err";

// Ambient capture in your hand: record a conversation, Aura remembers the people, the
// promises, and the emotional weight of what was said. The moat-neutralizer, made real.
export default function CaptureMoment({ visible, onClose, onCaptured }: { visible: boolean; onClose: () => void; onCaptured: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [result, setResult] = useState<{ summary: string; people: number; promises: number; care: number } | null>(null);
  const timer = useRef<any>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => { if (!visible) { reset(); } return () => { if (timer.current) clearInterval(timer.current); loop.current?.stop(); }; }, [visible]);
  const reset = () => { setPhase("idle"); setSecs(0); setResult(null); if (timer.current) clearInterval(timer.current); loop.current?.stop(); pulse.setValue(1); };

  const start = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setPhase("err"); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setPhase("rec"); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
      loop.current = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 640, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 640, useNativeDriver: true }),
      ]));
      loop.current.start();
    } catch (e) { setPhase("err"); }
  };

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    loop.current?.stop(); pulse.setValue(1);
    setPhase("proc");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("no audio");
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
      const text = await transcribe(b64, "audio/m4a");
      if (!text) throw new Error("nothing heard");
      const r: any = await capture(text);
      setResult({ summary: r?.summary || "got it, i've updated your memory.", people: r?.people || 0, promises: r?.promises || 0, care: r?.care || 0 });
      setPhase("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onCaptured();
    } catch (e) { setPhase("err"); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={m.fill}>
        <LinearGradient colors={grad.cons as any} style={m.abs} />
        <StatusBar style="light" />
        <SafeAreaView style={m.fill}>
          <View style={m.top}>
            <Text style={m.kicker}>capture a moment</Text>
            <Pressable onPress={onClose} hitSlop={10} style={m.close}><Feather name="x" size={20} color="#fff" /></Pressable>
          </View>

          {phase === "idle" && (
            <View style={m.center}>
              <Orb size={110} state="idle" />
              <Text style={m.h}>i'll remember it for you.</Text>
              <Text style={m.p}>record a conversation, a call, a catch up. i'll capture the people, the promises, and what matters, so you never have to take notes again.</Text>
              <Pressable onPress={start} style={({ pressed }) => [m.recBtn, pressed && { transform: [{ scale: 0.97 }] }]}>
                <Feather name="mic" size={26} color="#fff" />
              </Pressable>
              <Text style={m.hint}>tap to start</Text>
            </View>
          )}

          {phase === "rec" && (
            <View style={m.center}>
              <Animated.View style={{ transform: [{ scale: pulse }] }}><Orb size={120} state="warm" /></Animated.View>
              <Text style={m.timer}>{fmt(secs)}</Text>
              <Text style={m.p}>listening… talk naturally, i'm following along.</Text>
              <Pressable onPress={stop} style={({ pressed }) => [m.stopBtn, pressed && { transform: [{ scale: 0.97 }] }]}>
                <Feather name="square" size={22} color={c.accent} />
                <Text style={m.stopTxt}>stop and save</Text>
              </Pressable>
            </View>
          )}

          {phase === "proc" && (
            <View style={m.center}>
              <Orb size={110} state="thinking" />
              <Text style={m.h}>remembering…</Text>
              <ActivityIndicator color="#fff" style={{ marginTop: 14 }} />
            </View>
          )}

          {phase === "done" && result && (
            <ScrollView contentContainerStyle={m.scroll} keyboardShouldPersistTaps="handled">
              <Orb size={84} state="warm" />
              <Text style={m.h}>here's what i caught.</Text>
              <View style={m.card}><Text style={m.summary}>{result.summary}</Text></View>
              <View style={m.chips}>
                <Stat n={result.people} label={result.people === 1 ? "person" : "people"} />
                <Stat n={result.promises} label={result.promises === 1 ? "promise" : "promises"} />
                {result.care > 0 ? <Stat n={result.care} label="to hold gently" pink /> : null}
              </View>
              <Pressable onPress={onClose} style={({ pressed }) => [m.doneBtn, pressed && { opacity: 0.92 }]}><Text style={m.doneTxt}>done</Text></Pressable>
              <Pressable onPress={reset} hitSlop={10} style={{ marginTop: 14, alignSelf: "center" }}><Text style={m.again}>capture another</Text></Pressable>
            </ScrollView>
          )}

          {phase === "err" && (
            <View style={m.center}>
              <Orb size={96} state="idle" />
              <Text style={m.h}>i didn't quite catch that.</Text>
              <Text style={m.p}>make sure i can hear you, then try again.</Text>
              <Pressable onPress={reset} style={m.doneBtn}><Text style={m.doneTxt}>try again</Text></Pressable>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Stat({ n, label, pink }: { n: number; label: string; pink?: boolean }) {
  return (
    <View style={[m.stat, pink && { backgroundColor: "rgba(255,92,168,0.95)", borderColor: "rgba(255,255,255,0.7)" }]}>
      <Text style={[m.statN, pink && { color: "#fff" }]}>{n}</Text>
      <Text style={[m.statL, pink && { color: "rgba(255,255,255,0.92)" }]}>{label}</Text>
    </View>
  );
}

const m: any = {
  fill: { flex: 1 },
  abs: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 6 },
  kicker: { fontFamily: font.display, fontSize: 15, color: "#fff", letterSpacing: -0.3 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 36 },
  h: { fontFamily: font.display, fontSize: 27, color: "#fff", letterSpacing: -0.8, textAlign: "center", marginTop: 22 },
  p: { fontFamily: font.medium, fontSize: 16, lineHeight: 24, color: "rgba(255,255,255,0.9)", textAlign: "center", letterSpacing: -0.2, marginTop: 12 },
  recBtn: { width: 92, height: 92, borderRadius: 46, backgroundColor: c.pink, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "rgba(255,255,255,0.6)", marginTop: 34, ...shadow.puff },
  hint: { fontFamily: font.semibold, fontSize: 14, color: "rgba(255,255,255,0.8)", letterSpacing: -0.2, marginTop: 16 },
  timer: { fontFamily: font.display, fontSize: 40, color: "#fff", letterSpacing: -1, marginTop: 24, fontVariant: ["tabular-nums"] },
  stopBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", height: 54, paddingHorizontal: 26, borderRadius: 999, marginTop: 34, borderWidth: 3, borderColor: "rgba(255,255,255,0.6)", ...shadow.puff },
  stopTxt: { fontFamily: font.bold, fontSize: 16, color: c.accent, letterSpacing: -0.3 },
  card: { alignSelf: "stretch", backgroundColor: "#fff", borderRadius: 22, padding: 18, marginTop: 18, ...shadow.card },
  summary: { fontFamily: font.medium, fontSize: 16, lineHeight: 25, color: c.ink, letterSpacing: -0.2 },
  chips: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 },
  stat: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 16, borderWidth: 2.5, borderColor: "#fff", paddingVertical: 9, paddingHorizontal: 14, alignItems: "center", minWidth: 78, ...shadow.soft },
  statN: { fontFamily: font.display, fontSize: 20, color: c.ink, letterSpacing: -0.5 },
  statL: { fontFamily: font.semibold, fontSize: 10.5, color: c.muted, letterSpacing: -0.2, marginTop: 1 },
  doneBtn: { alignSelf: "stretch", height: 56, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginTop: 26, borderWidth: 3, borderColor: "rgba(255,255,255,0.6)", ...shadow.puff },
  doneTxt: { fontFamily: font.bold, fontSize: 17, color: c.accent, letterSpacing: -0.3 },
  again: { fontFamily: font.semibold, fontSize: 15, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2 },
};

// note: `pink` stat uses a solid statN/statL that need white; override via inline when pink is set.
