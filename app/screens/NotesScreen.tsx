import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import MicButton from "../components/MicButton";
import { Divider, Empty, FadeIn, IconButton, Press, Section } from "../components/ui";
import { c, f, inputReset, layout, r, sp, t } from "../theme";
import { capitalize } from "../lib/dates";
import type { CaptureResult, PlaceReminder, Remembered, Reminder } from "../lib/api";

const BUCKETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
];

// Not a notes app: a brain-dump that files itself and comes back. Write a thought, Aura says
// what it filed and when it will return it, and below is your future self on a timeline.
export default function NotesScreen({ onCapture, data, onDone, onLoad }: { onCapture: (t: string) => Promise<CaptureResult>; data: { scheduled: Reminder[]; places: PlaceReminder[]; remembered: Remembered[] }; onDone: (id: string, text: string) => void; onLoad: () => void }) {
  const [d, setD] = useState("");
  const [caught, setCaught] = useState<CaptureResult | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { onLoad(); }, []);
  const submit = async () => {
    const text = d.trim(); if (!text || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSending(true); setFailed(false);
    try { const res = await onCapture(text); setCaught(res); setD(""); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    catch (e) { setFailed(true); } finally { setSending(false); }
  };
  const scheduled = data.scheduled || [], places = data.places || [], remembered = data.remembered || [];
  const hasAny = scheduled.length > 0 || places.length > 0 || remembered.length > 0;

  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      <ScrollView style={s.fill} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={t.display} accessibilityRole="header">Notes</Text>

        <View style={s.field}>
          <TextInput style={[s.input, inputReset]} value={d} onChangeText={setD} placeholder="Call the landlord Thursday. Ask Jordan about the launch." placeholderTextColor={c.faint}
            multiline textAlignVertical="top" selectionColor={c.accent} accessibilityLabel="New note" />
          <View style={s.foot}>
            <Text style={[t.footnote, { flex: 1 }]} numberOfLines={1}>Aura files it and brings it back on time</Text>
            <MicButton onResult={(x) => setD((p) => (p ? p + " " + x : x))} disabled={sending} size={34} variant="inline" />
            <Press onPress={submit} disabled={!d.trim() || sending} style={[s.send, (!d.trim() || sending) && s.sendOff]} accessibilityLabel="Save note" scaleTo={0.92}>
              {sending ? <ActivityIndicator color={c.onInk} size="small" /> : <Feather name="arrow-up" size={18} color={d.trim() ? c.onInk : c.muted} />}
            </Press>
          </View>
        </View>
        {failed ? <Text style={s.err}>That didn't save. Check your connection and try again.</Text> : null}

        {caught ? (
          <FadeIn style={s.caught}>
            <View style={s.caughtHead}>
              <Feather name="check" size={14} color={c.accent} />
              <Text style={[t.caption, { color: c.accent, flex: 1 }]}>Filed</Text>
              <IconButton icon="x" variant="plain" size={28} color={c.muted} onPress={() => setCaught(null)} label="Dismiss" />
            </View>
            <Text style={[t.body, { marginTop: 2 }]}>{caught.summary}</Text>
            {caught.chips.length ? <Text style={[t.subhead, { marginTop: sp.s }]}>{caught.chips.map((cp) => capitalize(cp.label)).join("  ·  ")}</Text> : null}
          </FadeIn>
        ) : null}

        {scheduled.length ? (
          <Section title="Coming back to you" meta={String(scheduled.length)}>
            {BUCKETS.map((b) => {
              const items = scheduled.filter((x) => x.bucket === b.key);
              if (!items.length) return null;
              return (
                <View key={b.key}>
                  <Text style={s.group}>{b.label}</Text>
                  {items.map((x, i) => (
                    <View key={x.id}>
                      {i > 0 ? <Divider /> : null}
                      <Item when={capitalize(x.label)} text={x.text} onDone={() => onDone(x.id, x.text)} />
                    </View>
                  ))}
                </View>
              );
            })}
          </Section>
        ) : null}

        {places.length ? (
          <Section title="When you're there" meta={String(places.length)}>
            {places.map((x, i) => (
              <View key={x.id}>
                {i > 0 ? <Divider /> : null}
                <Item when={x.place} text={x.text} onDone={() => onDone(x.id, x.text)} />
              </View>
            ))}
          </Section>
        ) : null}

        {remembered.length ? (
          <Section title="Remembered" meta={String(remembered.length)}>
            {remembered.map((m, i) => (
              <View key={m.id}>
                {i > 0 ? <Divider /> : null}
                <Text style={[t.body, { paddingVertical: 13 }]}>{m.text}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {!hasAny && !caught ? (
          <Empty style={{ marginTop: sp.xl }} title="Write the first one" body="Errands, ideas, someone you met. Add a time or a place and Aura will remind you then; anything else it simply remembers." />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Item({ when, text, onDone }: { when: string; text: string; onDone: () => void }) {
  return (
    <View style={s.item}>
      <Text style={s.when} numberOfLines={2}>{when}</Text>
      <Text style={[t.body, { flex: 1 }]}>{text}</Text>
      <Press onPress={onDone} hitSlop={8} scaleTo={0.9} style={s.check} accessibilityLabel={`Mark done: ${text}`} accessibilityRole="checkbox" />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.xl, paddingBottom: 56 },
  field: { marginTop: sp.xl, backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.lineStrong },
  input: { fontFamily: f.regular, fontSize: 17, lineHeight: 25, color: c.ink, minHeight: 100, paddingHorizontal: sp.l, paddingTop: 14, paddingBottom: 6 },
  foot: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: sp.l, paddingRight: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  send: { width: 34, height: 34, borderRadius: r.sm, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" },
  sendOff: { backgroundColor: c.sunken },
  err: { fontFamily: f.medium, fontSize: 13.5, color: c.signalText, marginTop: sp.s },
  caught: { marginTop: sp.l },
  caughtHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  group: { fontFamily: f.medium, fontSize: 12.5, color: c.muted, marginTop: sp.l, marginBottom: 2 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 13 },
  when: { width: 76, fontFamily: f.medium, fontSize: 14, lineHeight: 23, color: c.ink2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.lineStrong, marginTop: 0 },
});
