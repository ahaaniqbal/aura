import React, { useEffect, useRef, useState } from "react";
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import Mark from "./Mark";
import { Button, IconButton, Press } from "./ui";
import { c, f, sp, t } from "../theme";
import { transcribe, capture } from "../lib/api";

type Phase = "idle" | "rec" | "proc" | "done" | "err";
type Fail = "perm" | "upload" | "silent";
const BARS = 36;

// Record a conversation and Aura keeps the people, the promises and what mattered. The level
// meter is the real microphone input; if processing fails, the recording is kept for a retry.
export default function CaptureMoment({ visible, onClose, onCaptured }: { visible: boolean; onClose: () => void; onCaptured: () => void }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const rs = useAudioRecorderState(recorder, 90);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fail, setFail] = useState<Fail>("upload");
  const [secs, setSecs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [result, setResult] = useState<{ summary: string; people: number; promises: number; care: number } | null>(null);
  const timer = useRef<any>(null);
  const lastUri = useRef<string | null>(null);

  useEffect(() => { if (!visible) reset(); return () => { if (timer.current) clearInterval(timer.current); }; }, [visible]);
  // metering arrives in dBFS (about -60 quiet to 0 loud); keep a rolling window for the meter
  useEffect(() => {
    if (phase !== "rec") return;
    const db = typeof rs.metering === "number" ? rs.metering : -60;
    const v = Math.max(0, Math.min(1, (db + 55) / 50));
    setLevels((l) => [...l.slice(1), v]);
  }, [rs.metering, rs.durationMillis]);

  const reset = () => { setPhase("idle"); setSecs(0); setResult(null); setLevels(Array(BARS).fill(0)); lastUri.current = null; if (timer.current) clearInterval(timer.current); };

  const start = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setFail("perm"); setPhase("err"); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setPhase("rec"); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch (e) { setFail("perm"); setPhase("err"); }
  };

  const process = async (uri: string) => {
    setPhase("proc");
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
      const text = await transcribe(b64, "audio/m4a");
      if (!text) { setFail("silent"); setPhase("err"); return; }
      const res: any = await capture(text);
      setResult({ summary: res?.summary || "Got it. I've updated your memory.", people: res?.people || 0, promises: res?.promises || 0, care: res?.care || 0 });
      setPhase("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onCaptured();
    } catch (e) { setFail("upload"); setPhase("err"); }
  };

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await recorder.stop();
      lastUri.current = recorder.uri;
      if (!recorder.uri) { setFail("upload"); setPhase("err"); return; }
      await process(recorder.uri);
    } catch (e) { setFail("upload"); setPhase("err"); }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={s.fill}>
        <StatusBar style="dark" />
        <View style={s.top}>
          <Text style={t.label}>Record a conversation</Text>
          <IconButton icon="x" size={36} onPress={onClose} label="Close" />
        </View>

        {phase === "idle" && (
          <View style={s.body}>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={t.display}>Aura will take the notes.</Text>
              <Text style={[t.callout, { marginTop: sp.m }]}>Who was there, what's new with them, and anything you promised, filed into their records when you stop.</Text>
              <Text style={[t.footnote, { marginTop: sp.xl }]}>Let people know before you start recording.</Text>
            </View>
            <View style={s.recWrap}>
              <Press onPress={start} style={s.recBtn} scaleTo={0.94} accessibilityLabel="Start recording"><View style={s.recDot} /></Press>
              <Text style={[t.footnote, { marginTop: sp.m }]}>Start recording</Text>
            </View>
          </View>
        )}

        {phase === "rec" && (
          <View style={s.body}>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <View style={s.live}><View style={s.liveDot} /><Text style={s.liveTxt}>Recording</Text></View>
              <Text style={s.timer}>{fmt(secs)}</Text>
              <View style={s.wave} accessibilityElementsHidden>
                {levels.map((v, i) => <View key={i} style={[s.waveBar, { height: 3 + v * 69 }]} />)}
              </View>
            </View>
            <Button label="Stop and file it" icon="square" onPress={stop} />
          </View>
        )}

        {phase === "proc" && (
          <View style={[s.body, { justifyContent: "center" }]}>
            <Mark size={40} state="thinking" />
            <Text style={[t.title1, { marginTop: sp.xl }]}>Listening back</Text>
            <Text style={[t.callout, { marginTop: 6 }]}>Finding the people and promises in what was said.</Text>
          </View>
        )}

        {phase === "done" && result && (
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={t.caption}>Filed</Text>
            <Text style={[t.title2, { marginTop: 6 }]}>{result.summary}</Text>
            <Text style={[t.callout, { marginTop: sp.l }]}>
              Updated {plural(result.people, "person", "people")} and {plural(result.promises, "promise", "promises")}{result.care ? `. ${plural(result.care, "person is", "people are")} going through something.` : "."}
            </Text>
            <View style={{ flex: 1 }} />
            <Button label="Done" onPress={onClose} style={{ marginTop: sp.h }} />
            <Button label="Record another" variant="ghost" onPress={reset} style={{ marginTop: sp.xs }} />
          </ScrollView>
        )}

        {phase === "err" && (
          <View style={s.body}>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={t.title1}>{fail === "perm" ? "Aura can't hear you." : fail === "silent" ? "Nothing came through." : "That didn't upload."}</Text>
              <Text style={[t.callout, { marginTop: sp.s }]}>
                {fail === "perm" ? "Allow microphone access for Aura in Settings, then try again."
                  : fail === "silent" ? "The recording was too quiet to transcribe. Move closer and record again."
                  : "Your recording is still here. Check your connection and send it again."}
              </Text>
            </View>
            {fail === "upload" && lastUri.current ? (
              <>
                <Button label="Send again" onPress={() => process(lastUri.current as string)} />
                <Button label="Record again" variant="ghost" onPress={reset} style={{ marginTop: sp.xs }} />
              </>
            ) : <Button label="Try again" onPress={reset} />}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.canvas },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  body: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 },
  recWrap: { alignItems: "center", paddingBottom: sp.l },
  recBtn: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: c.ink, alignItems: "center", justifyContent: "center" },
  recDot: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.accent },
  live: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  liveTxt: { fontFamily: f.medium, fontSize: 14, color: c.accentText },
  timer: { fontFamily: f.medium, fontSize: 76, letterSpacing: -3, color: c.ink, marginTop: sp.s, fontVariant: ["tabular-nums"] },
  wave: { flexDirection: "row", alignItems: "center", gap: 3, height: 72, marginTop: sp.xxl },
  waveBar: { flex: 1, borderRadius: 1, backgroundColor: c.ink },
});
