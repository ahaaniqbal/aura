import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Button, Divider, IconName, Press, Sheet, Toggle } from "./ui";
import { Money, TripBlock } from "./Results";
import { c, f, inputReset, r, sp, t } from "../theme";
import { capitalize } from "../lib/dates";
import type { Card, MoneySummary, Routine, Trip } from "../lib/api";

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
  quote: { marginTop: sp.l, backgroundColor: c.sunken, borderRadius: r.md, padding: 14 },
  fieldLabel: { fontFamily: f.medium, fontSize: 13, color: c.ink2, marginBottom: 6 },
  field: { height: 48, borderRadius: r.sm, borderWidth: 1, borderColor: c.control, backgroundColor: c.surface, paddingHorizontal: 14, fontFamily: f.regular, fontSize: 16, color: c.ink },
  code: { fontFamily: f.bold, fontSize: 40, letterSpacing: 0.5, color: c.ink, marginTop: sp.xl, marginBottom: sp.l },
});

// ---------- routines ----------
const CADENCE_LABEL: Record<string, string> = { daily: "Every day", weekdays: "Weekdays", weekly: "Every week", monthly: "First of the month", before_meetings: "Before meetings with other people" };
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function routineSchedule(r: Routine): string {
  if (r.cadence === "before_meetings") return `${CADENCE_LABEL.before_meetings}, ${parseInt(r.at.split(":")[1] || "30", 10) + 60 * parseInt(r.at.split(":")[0] || "0", 10)} minutes ahead`;
  const [h, m] = r.at.split(":").map((x) => parseInt(x, 10));
  const time = `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  return r.cadence === "weekly" ? `${DAYS_LONG[r.weekday ?? 1]}s at ${time}` : `${CADENCE_LABEL[r.cadence] || r.cadence} at ${time}`;
}
export function RoutineSheet({ routine, onClose, onToggle, onRun, onEdit, onDelete, running }: {
  routine: Routine | null; onClose: () => void; onToggle: (r: Routine, on: boolean) => void; onRun: (r: Routine) => void; onEdit: (r: Routine) => void; onDelete: (r: Routine) => void; running?: boolean;
}) {
  const r = routine;
  return (
    <Sheet visible={!!r} onClose={onClose}>
      {r ? (
        <View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: sp.l }}>
            <View style={{ flex: 1 }}>
              <Text style={t.title2}>{r.title}</Text>
              <Text style={[t.callout, { marginTop: 4 }]}>{routineSchedule(r)}</Text>
            </View>
            <Toggle value={r.active} onChange={(v) => onToggle(r, v)} label={`${r.title} on`} />
          </View>
          <View style={s.quote}>
            <Text style={t.caption}>What Aura does</Text>
            <Text style={[t.body, { marginTop: 4 }]}>{r.prompt}</Text>
          </View>
          {r.last_result ? (
            <View style={{ marginTop: sp.l }}>
              <Text style={t.caption}>Last time</Text>
              <Text style={[t.callout, { marginTop: 4 }]} numberOfLines={4}>{r.last_result}</Text>
            </View>
          ) : null}
          <View style={s.editActions}>
            <Button label="Run it now" onPress={() => onRun(r)} loading={running} style={{ flex: 1 }} disabled={r.cadence === "before_meetings"} />
            <Button label="Change it" variant="secondary" onPress={() => onEdit(r)} />
          </View>
          {r.kind === "custom" ? <Button label="Delete routine" variant="ghost" onPress={() => onDelete(r)} style={{ marginTop: sp.xs }} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

// ---------- trip and money, full size ----------
export function TripSheet({ trip, onClose, onAsk }: { trip: Trip | null; onClose: () => void; onAsk: (text: string) => void }) {
  return (
    <Sheet visible={!!trip} onClose={onClose}>
      {trip ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TripBlock trip={trip} />
          <View style={s.editActions}>
            <Button label="Ask Aura about this trip" variant="secondary" onPress={() => onAsk(`About my ${trip.title} trip: `)} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      ) : null}
    </Sheet>
  );
}
export function MoneySheet({ money, onClose, onAsk }: { money: MoneySummary | null; onClose: () => void; onAsk: (text: string) => void }) {
  return (
    <Sheet visible={!!money} onClose={onClose}>
      {money ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Money m={money} />
          <View style={s.editActions}>
            <Button label="Find receipts in Gmail" onPress={() => onAsk("Scan my receipts and tell me what's new")} style={{ flex: 1 }} />
            <Button label="Set a budget" variant="secondary" onPress={() => onAsk("Set a monthly budget for ")} />
          </View>
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

// ---------- connect an app over MCP ----------
export function McpSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (url: string, token: string) => Promise<string | null> }) {
  const [url, setUrl] = useState(""), [token, setToken] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { if (visible) { setUrl(""); setToken(""); setErr(""); } }, [visible]);
  const add = async () => { setBusy(true); setErr(""); const e = await onAdd(url.trim(), token.trim()); setBusy(false); if (e) setErr(e); };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={t.title2}>Connect an MCP server</Text>
        <Text style={[t.callout, { marginTop: 4 }]}>Any app or agent with a remote MCP server: Linear, GitHub, Zapier, your company's tools. Aura reads freely and asks before it changes anything.</Text>
        <Text style={[s.fieldLabel, { marginTop: sp.l }]}>Server address</Text>
        <TextInput style={[s.field, inputReset]} value={url} onChangeText={setUrl} placeholder="https://mcp.example.com/mcp" placeholderTextColor={c.faint} autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="Server address" />
        <Text style={[s.fieldLabel, { marginTop: sp.m }]}>Access token, if it needs one</Text>
        <TextInput style={[s.field, inputReset]} value={token} onChangeText={setToken} placeholder="Optional" placeholderTextColor={c.faint} autoCapitalize="none" autoCorrect={false} secureTextEntry accessibilityLabel="Access token" />
        {err ? <Text style={[t.callout, { color: c.accentText, marginTop: sp.m }]} accessibilityLiveRegion="polite">{err}</Text> : null}
        <View style={s.editActions}>
          <Button label="Connect" onPress={add} loading={busy} disabled={!/^https:\/\/\S+/.test(url.trim())} style={{ flex: 1 }} />
          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

// ---------- pair another agent (Kaeva A2A) ----------
export function AgentSheet({ pairing, onClose }: { pairing: { code: string; endpoint: string } | null; onClose: () => void }) {
  return (
    <Sheet visible={!!pairing} onClose={onClose}>
      {pairing ? (
        <View>
          <Text style={t.title2}>Pair an agent</Text>
          <Text style={[t.callout, { marginTop: 4 }]}>Give this code to the agent you want to work with Aura. It works once, for 10 minutes. The agent can message you and ask to read your memory or act; you approve each of those here.</Text>
          <Text style={s.code} selectable accessibilityLabel={`Pairing code ${pairing.code.split("").join(" ")}`}>{pairing.code}</Text>
          <Text style={t.caption}>Endpoint</Text>
          <Text style={[t.footnote, { marginTop: 2, color: c.ink2 }]} selectable>{pairing.endpoint}</Text>
          <Button label="Done" onPress={onClose} style={{ marginTop: sp.xl }} />
        </View>
      ) : null}
    </Sheet>
  );
}

// ---------- reply to a paired agent ----------
export function ReplySheet({ to, onClose, onSend }: { to: { kid: string; from: string; question: string } | null; onClose: () => void; onSend: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { if (to) setBody(""); }, [to?.kid, to?.question]);
  return (
    <Sheet visible={!!to} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={t.caption}>Reply to {to?.from}</Text>
        <Text style={[t.callout, { marginTop: 4, color: c.ink }]} numberOfLines={3}>{to?.question}</Text>
        <TextInput style={[s.editor, inputReset, { minHeight: 120 }]} value={body} onChangeText={setBody} multiline textAlignVertical="top" autoFocus selectionColor={c.accent} accessibilityLabel={`Reply to ${to?.from || "agent"}`} />
        <View style={s.editActions}>
          <Button label="Send" onPress={async () => { setBusy(true); const ok = await onSend(body.trim()); setBusy(false); if (ok) onClose(); }} loading={busy} disabled={!body.trim()} style={{ flex: 1 }} />
          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  );
}
