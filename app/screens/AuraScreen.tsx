import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Mark, { MarkState, Typing } from "../components/Mark";
import MicButton from "../components/MicButton";
import ActionCard from "../components/ActionCard";
import { Button, Divider, FadeIn, IconButton, Press } from "../components/ui";
import { c, f, inputReset, layout, r, sp, t } from "../theme";
import type { Card, Feed, Message } from "../lib/api";

const INPUT_LINE_H = 22;
const INPUT_MAX_H = 120;
const STARTERS: { group: string; text: string }[] = [
  { group: "Work", text: "What's on my calendar tomorrow?" },
  { group: "Work", text: "Anything in my inbox I should deal with today?" },
  { group: "Life", text: "Remind me to call my mom on Sunday at 6" },
  { group: "Life", text: "Give me your honest take on quitting my job to build something" },
];

// The home of the app: one conversation with Aura that never resets its memory.
export default function AuraScreen({ feed, pending, thinking, notice, busy, draft, setDraft, onSend, onAct, onEdit, hidden, onClear, onDemo, markState, subtitle, focusKey }: {
  feed: Feed | null; pending: { id: string; content: string }[]; thinking: boolean; notice: string | null; busy: boolean;
  draft: string; setDraft: (v: string | ((p: string) => string)) => void; onSend: () => void; onAct: (c: Card, d: "approve" | "decline") => void;
  onEdit: (c: Card) => void; hidden: Set<string>; onClear: () => void; onDemo: () => void; markState: MarkState; subtitle: string; focusKey: number;
}) {
  const scroller = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const [inputH, setInputH] = useState(INPUT_LINE_H);
  const [focused, setFocused] = useState(false);
  const messages = feed?.messages || [];
  const cards = feed?.cards || [];
  const cardById = (id: string | null) => (id ? cards.find((x) => x.id === id) : undefined);
  const hasChat = messages.length > 0 || pending.length > 0;
  const shownPending = pending.filter((p) => !messages.some((m) => m.role === "user" && m.content === p.content));

  useEffect(() => { setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 120); }, [messages.length, pending.length, thinking]);
  useEffect(() => { if (!draft) setInputH(INPUT_LINE_H); }, [draft]);
  useEffect(() => { if (focusKey) setTimeout(() => input.current?.focus(), 250); }, [focusKey]);

  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      <View style={s.header}>
        {/* long-press the mark to open the demo scenarios */}
        <Pressable onLongPress={onDemo} delayLongPress={600} accessibilityLabel="Aura" accessibilityHint="Long press for demo scenarios">
          <Mark size={30} state={markState} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: sp.s }}>
          <Text style={t.headline}>Aura</Text>
          <Text style={[t.footnote, { marginTop: 1 }]} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp.s }}>
          {hasChat ? <IconButton icon="trash-2" size={32} variant="plain" color={c.ink2} onPress={onClear} label="Clear conversation" /> : null}
          {__DEV__ ? <Button label="Demo" size="sm" variant="secondary" onPress={onDemo} /> : null}
        </View>
      </View>

      <ScrollView ref={scroller} style={s.fill} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {!hasChat ? <Empty onSuggest={(x) => { setDraft(x); input.current?.focus(); }} /> : null}
        {messages.map((m) => {
          const card = m.card_id ? cardById(m.card_id) : undefined;
          return (
            <View key={m.id}>
              <Bubble m={m} />
              {card && !hidden.has(card.id) ? <ActionCard card={card} onAct={onAct} onEdit={onEdit} busy={busy} swipe /> : null}
            </View>
          );
        })}
        {shownPending.map((p) => <FadeIn key={p.id}><Bubble m={{ id: p.id, role: "user", content: p.content, kind: "chat", card_id: null, created_at: "" }} /></FadeIn>)}
        {thinking ? <View style={s.thinking}><Typing /></View> : null}
        {notice ? <Bubble m={{ id: "notice", role: "aura", content: notice, kind: "system", card_id: null, created_at: "" }} /> : null}
      </ScrollView>

      <View style={s.composer}>
        <View style={[s.shell, focused && s.shellFocus, inputH > INPUT_LINE_H && { alignItems: "flex-end" }]}>
          <TextInput
            ref={input}
            style={[s.input, inputReset, { height: Math.max(INPUT_LINE_H, inputH) }]}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Message Aura"
            placeholderTextColor={c.faint}
            selectionColor={c.accent}
            multiline
            accessibilityLabel="Message Aura"
            scrollEnabled={inputH >= INPUT_MAX_H}
            onContentSizeChange={(e) => setInputH(Math.min(INPUT_MAX_H, Math.max(INPUT_LINE_H, e.nativeEvent.contentSize.height)))}
          />
          <MicButton variant="inline" onResult={(x) => setDraft((d) => (d ? d + " " + x : x))} disabled={busy} size={34} />
          <Press onPress={onSend} style={[s.send, !draft.trim() && s.sendOff]} disabled={!draft.trim() || busy} accessibilityLabel="Send" scaleTo={0.92}>
            {busy ? <ActivityIndicator color={c.onInk} size="small" /> : <Feather name="arrow-up" size={18} color={draft.trim() ? c.onInk : c.muted} />}
          </Press>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m }: { m: Message }) {
  if (m.role === "user") {
    return <View style={s.userRow}><View style={s.userBubble}><Text style={t.body}>{m.content}</Text></View></View>;
  }
  return (
    <View style={s.auraRow}>
      {m.kind === "reminder" ? <Text style={s.kind}>Reminder</Text> : m.kind === "brief" ? <Text style={[s.kind, { color: c.muted }]}>Your brief</Text> : null}
      <Text style={[t.body, m.kind === "system" && { color: c.muted }]}>{m.content}</Text>
    </View>
  );
}

function Empty({ onSuggest }: { onSuggest: (t: string) => void }) {
  return (
    <View style={{ paddingTop: sp.xxl }}>
      <Text style={t.title1}>What's on your mind?</Text>
      <Text style={[t.callout, { marginTop: sp.s }]}>Work, life, anything. Aura remembers what you tell it and gets things done in the apps you connect.</Text>
      <View style={s.starters}>
        {STARTERS.map((x, i) => (
          <View key={x.text}>
            {i > 0 ? <Divider /> : null}
            <Press onPress={() => onSuggest(x.text)} style={s.starter} scaleTo={0.99} accessibilityLabel={x.text}>
              <Text style={s.group}>{x.group}</Text>
              <Text style={[t.body, { flex: 1 }]}>{x.text}</Text>
            </Press>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.page, paddingTop: sp.s, paddingBottom: sp.m, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.lineStrong },
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.l, paddingBottom: sp.xxl },
  userRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: sp.l },
  userBubble: { maxWidth: "84%", backgroundColor: c.sunken, borderRadius: r.md, paddingHorizontal: 14, paddingVertical: 10 },
  auraRow: { marginBottom: sp.l, maxWidth: "94%" },
  kind: { fontFamily: f.medium, fontSize: 13, color: c.accentText, marginBottom: 4 },
  thinking: { paddingVertical: 8, marginBottom: sp.l },
  starters: { marginTop: sp.xxl, borderTopWidth: 1, borderTopColor: c.ink },
  starter: { flexDirection: "row", alignItems: "baseline", gap: sp.l, paddingVertical: 15 },
  group: { width: 40, fontFamily: f.medium, fontSize: 13, color: c.muted },
  composer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  shell: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.control, paddingLeft: 14, paddingRight: 6, paddingVertical: 6 },
  shellFocus: { borderColor: c.ink },
  input: { flex: 1, fontFamily: f.regular, fontSize: 16, lineHeight: INPUT_LINE_H, color: c.ink, paddingTop: 0, paddingBottom: 0, paddingRight: 6, marginVertical: 6, textAlignVertical: "center" },
  send: { width: 34, height: 34, borderRadius: r.sm, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" },
  sendOff: { backgroundColor: c.sunken },
});
