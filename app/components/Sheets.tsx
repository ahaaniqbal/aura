import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Button, Divider, IconName, Press, Sheet } from "./ui";
import { c, f, inputReset, r, sp, t } from "../theme";
import { capitalize } from "../lib/dates";
import type { Card } from "../lib/api";

export type ScenarioKey = "inbox" | "near_bakery" | "incoming_email" | "urgent" | "meeting_end";
export const SCENARIOS: { key: ScenarioKey; icon: IconName; label: string; sub: string }[] = [
  { key: "inbox", icon: "inbox", label: "Check my inbox", sub: "Live: reads your Gmail and drafts a reply" },
  { key: "near_bakery", icon: "map-pin", label: "Walk past a bakery", sub: "Simulated location" },
  { key: "incoming_email", icon: "mail", label: "Email arrives during a meeting", sub: "Simulated" },
  { key: "urgent", icon: "zap", label: "Urgent email arrives", sub: "Simulated, sends a notification" },
  { key: "meeting_end", icon: "check-circle", label: "Meeting ends", sub: "Simulated" },
];

export function ScenarioSheet({ visible, onClose, onRun }: { visible: boolean; onClose: () => void; onRun: (k: ScenarioKey) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={t.title2}>Demo</Text>
      <Text style={[t.callout, { marginTop: 4, marginBottom: sp.l }]}>Trigger a moment and watch Aura respond in the conversation.</Text>
      <View style={{ borderTopWidth: 1, borderTopColor: c.ink }}>
        {SCENARIOS.map((x, i) => (
          <View key={x.key}>
            {i > 0 ? <Divider /> : null}
            <Press onPress={() => onRun(x.key)} style={s.row} scaleTo={0.99} accessibilityLabel={x.label}>
              <Feather name={x.icon} size={17} color={c.ink2} />
              <View style={{ flex: 1 }}>
                <Text style={t.label}>{x.label}</Text>
                <Text style={[t.footnote, { marginTop: 2 }]}>{x.sub}</Text>
              </View>
              <Feather name="arrow-right" size={16} color={c.muted} />
            </Press>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

// Edit what Aura drafted before it goes out. Sends exactly what's in the field.
export function EditDraftSheet({ card, onClose, onSend }: { card: Card | null; onClose: () => void; onSend: (card: Card, body: string) => void }) {
  const [body, setBody] = useState("");
  useEffect(() => { if (card) setBody(card.body || ""); }, [card?.id]);
  return (
    <Sheet visible={!!card} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={t.caption}>Edit before sending</Text>
        <Text style={[t.title2, { marginTop: 4 }]}>{card ? capitalize(card.title) : ""}</Text>
        <TextInput style={[s.editor, inputReset]} value={body} onChangeText={setBody} multiline textAlignVertical="top" autoFocus selectionColor={c.accent} accessibilityLabel="Reply" />
        <View style={s.editActions}>
          <Button label="Send reply" onPress={() => card && onSend(card, body.trim())} disabled={!body.trim()} style={{ flex: 1 }} />
          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

// A plain confirmation for anything that can't be undone. Replaces Alert so it works everywhere.
export function ConfirmSheet({ visible, title, body, confirm, onConfirm, onClose }: { visible: boolean; title: string; body: string; confirm: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={t.title2}>{title}</Text>
      <Text style={[t.callout, { marginTop: sp.s }]}>{body}</Text>
      <View style={s.editActions}>
        <Button label={confirm} onPress={onConfirm} style={{ flex: 1 }} />
        <Button label="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}

// Unfiltered mode is for adults. The confirmation is recorded on the server with a timestamp.
export function AdultSheet({ visible, onConfirm, onClose, busy }: { visible: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={t.caption}>Unfiltered mode</Text>
      <Text style={[t.title1, { marginTop: 4 }]}>Are you 18 or older?</Text>
      <Text style={[t.callout, { marginTop: sp.m }]}>Unfiltered Aura answers mature, explicit and controversial questions directly, without disclaimers. It still won't sexualize minors or help anyone cause mass harm.</Text>
      <View style={s.editActions}>
        <Button label="I'm 18 or older" onPress={onConfirm} loading={busy} style={{ flex: 1 }} />
        <Button label="Not now" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}

export function ProSheet({ visible, onClose, onSubscribe, busy, error }: { visible: boolean; onClose: () => void; onSubscribe: () => void; busy: boolean; error: string }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={t.caption}>Aura Pro</Text>
      <View style={s.priceRow}>
        <Text style={s.price}>$12</Text>
        <Text style={s.per}>a month after a 7-day free trial</Text>
      </View>
      <View style={s.list}>
        {[
          ["Unlimited memory", "Everything you tell Aura, kept and used, with no cap."],
          ["The daily brief", "Your day across work and life, in one message."],
          ["Priority AI model", ""],
        ].map(([k, v]) => (
          <View key={k} style={s.item}>
            <Text style={t.label}>{k}</Text>
            {v ? <Text style={[t.callout, { marginTop: 2 }]}>{v}</Text> : null}
          </View>
        ))}
      </View>
      {error ? <Text style={s.err}>{error}</Text> : null}
      <Button label="Start free trial" onPress={onSubscribe} loading={busy} style={{ marginTop: sp.xl }} />
      <Text style={[t.footnote, { textAlign: "center", marginTop: sp.m }]}>Cancel anytime before day 7 and you won't be charged.</Text>
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  editor: { marginTop: sp.l, minHeight: 180, maxHeight: 320, backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.lineStrong, padding: sp.l, fontFamily: f.regular, fontSize: 16, lineHeight: 23, color: c.ink },
  editActions: { flexDirection: "row", gap: sp.s, marginTop: sp.l },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: sp.s },
  price: { fontFamily: f.medium, fontSize: 56, lineHeight: 58, letterSpacing: -2.4, color: c.ink },
  per: { flex: 1, fontFamily: f.regular, fontSize: 14, lineHeight: 19, color: c.ink2, paddingBottom: 6 },
  list: { marginTop: sp.xl, borderTopWidth: 1, borderTopColor: c.ink },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  err: { fontFamily: f.medium, fontSize: 13.5, color: c.accentText, marginTop: sp.l },
});
