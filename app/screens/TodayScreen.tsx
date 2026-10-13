import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Avatar from "../components/Avatar";
import PulseCard from "../components/PulseCard";
import ActionCard from "../components/ActionCard";
import { Button, Divider, Empty, IconButton, Press, Section, Status } from "../components/ui";
import { c, f, layout, r, sp, t, Tone, toneColor } from "../theme";
import { contactStats, isDrifting, warmth } from "../lib/weight";
import { capitalize, daysUntilBirthday, dueMeta, inDays, todayLabel } from "../lib/dates";
import type { Card as ActionItem, GraphPerson, PromiseItem, Pulse } from "../lib/api";

type Nudge = { key: string; person: string | null; title: string; label: string; tone: Tone; body: string; rank: number; promise?: string };

function firstName(n: string) { return String(n || "").split(" ")[0]; }
function namesSentence(names: string[]): string {
  if (!names.length) return "Nothing needs you today.";
  if (names.length === 1) return `${names[0]} needs you today.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} need you today.`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} need you today.`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others need you today.`;
}

export default function TodayScreen({ promises, people, pulse, onPulse, approvals, onAct, onEdit, busy, onAsk, onDone, onBrief, onRecord, onOpenPerson, status, statusTone }: {
  promises: PromiseItem[]; people: GraphPerson[]; pulse: Pulse | null; onPulse: (v: number, mood: string) => void;
  approvals: ActionItem[]; onAct: (c: ActionItem, d: "approve" | "decline") => void; onEdit: (c: ActionItem) => void; busy: boolean;
  onAsk: () => void; onDone: (text: string) => void; onBrief: () => void; onRecord: () => void; onOpenPerson: (name: string) => void;
  status: string; statusTone: Tone;
}) {
  const pN: Nudge[] = promises.map((p) => {
    const meta = dueMeta(p.due);
    const who = p.person || null;
    return {
      key: "p:" + p.text + (p.person || ""), person: who, title: capitalize(p.text), promise: p.text,
      label: meta ? meta.label : "Open", tone: meta?.tone === "over" ? "signal" : meta?.tone === "soon" ? "neutral" : "muted",
      body: p.direction === "owed_to_me" ? `${who || "Someone"} owes you` : `Promised to ${who || "someone"}`,
      rank: meta ? meta.rank : 9999,
    };
  });
  const bN: Nudge[] = people.map((p) => ({ p, d: daysUntilBirthday(p.birthday) })).filter((x) => x.d !== null && (x.d as number) <= 21).map(({ p, d }) => {
    const days = d as number;
    const wants = (p.wants || []).filter(Boolean);
    return { key: "b:" + p.person, person: p.person, title: `${firstName(p.person)}'s birthday`, label: inDays(days), tone: days <= 3 ? "signal" : "neutral",
      body: wants.length ? `Would love ${wants.slice(0, 2).join(" or ")}` : (p.relation ? `Your ${p.relation}` : ""), rank: days };
  });
  const cN: Nudge[] = people.filter((p) => p.care && p.care_at && (Date.now() - Number(p.care_at) < 30 * 86400000)).slice(0, 3).map((p) => ({
    key: "c:" + p.person, person: p.person, title: `Check in on ${firstName(p.person)}`, label: "On their mind", tone: "signal", body: String(p.care || ""), rank: -12,
  }));
  // gently resurface people you've drifted from, so no one important goes quiet
  const surfaced = new Set([...cN, ...pN, ...bN].map((n) => String(n.person || "").toLowerCase()));
  const rN: Nudge[] = people.filter((p) => !surfaced.has(String(p.person).toLowerCase()) && isDrifting(p))
    .sort((a, b) => warmth(a) - warmth(b)).slice(0, 2).map((p) => {
      const st = contactStats(p);
      const body = st.cadenceLabel ? `You usually talk ${st.cadenceLabel}. Last was ${st.lastLabel}.` : st.overdueWeeks ? `${st.overdueWeeks} weeks since you caught up` : "You've gone quiet";
      return { key: "r:" + p.person, person: p.person, title: `Reconnect with ${firstName(p.person)}`, label: "Drifting", tone: "muted", body, rank: 6 };
    });
  const nudges = [...cN, ...rN, ...pN, ...bN].sort((a, b) => a.rank - b.rank).slice(0, 6);
  const names = Array.from(new Set(nudges.map((n) => n.person).filter(Boolean).map((n) => firstName(n as string))));
  const headline = names.length ? namesSentence(names) : approvals.length ? `${approvals.length} ${approvals.length === 1 ? "reply is" : "replies are"} waiting for you.` : namesSentence([]);

  return (
    <ScrollView style={s.fill} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.top}>
        <Text style={t.caption}>{todayLabel()}</Text>
        <Status label={status} tone={statusTone} dot />
      </View>
      <Text style={[t.display, { marginTop: sp.l }]} accessibilityRole="header">{headline}</Text>
      {names.length && approvals.length ? (
        <Text style={[t.callout, { marginTop: sp.s }]}>{approvals.length} {approvals.length === 1 ? "reply is" : "replies are"} waiting for your OK.</Text>
      ) : null}

      <View style={s.askRow}>
        <Press onPress={onAsk} style={s.ask} scaleTo={0.99} accessibilityLabel="Tell Aura something">
          <Text style={s.askTxt}>Tell Aura something</Text>
          <Feather name="arrow-up-right" size={17} color={c.muted} />
        </Press>
        <IconButton icon="mic" size={50} onPress={onRecord} label="Record a conversation" style={{ borderRadius: r.md }} />
      </View>

      {approvals.length ? (
        <Section title="Waiting for your OK" meta={String(approvals.length)}>
          {approvals.map((cd) => <ActionCard key={cd.id} card={cd} onAct={onAct} onEdit={onEdit} busy={busy} />)}
        </Section>
      ) : null}

      <Section title="Who needs you" action="Daily brief" onAction={onBrief}>
        {nudges.length ? nudges.map((n, i) => (
          <View key={n.key}>
            {i > 0 ? <Divider inset={56} /> : null}
            <Press onPress={() => n.person && onOpenPerson(n.person)} disabled={!n.person} style={s.row} scaleTo={0.99} accessibilityLabel={`${n.title}. ${n.label}`}>
              <Avatar name={n.person || "?"} size={40} signal={n.tone === "signal"} />
              <View style={{ flex: 1 }}>
                <Text style={t.label}>{n.title}</Text>
                <Text style={[t.subhead, { marginTop: 3 }]} numberOfLines={2}>
                  <Text style={{ fontFamily: f.medium, color: toneColor[n.tone] }}>{n.label}</Text>
                  {n.body ? `  ${n.body}` : ""}
                </Text>
              </View>
              {n.promise ? <Button label="Done" size="sm" variant="secondary" onPress={() => onDone(n.promise as string)} /> : <Feather name="chevron-right" size={18} color={c.faint} />}
            </Press>
          </View>
        )) : (
          <Empty title="This is where people show up" body="A birthday a few days out, a promise coming due, a friend gone quiet. Aura puts them here the day they need you." />
        )}
      </Section>

      <Section title="Your week">
        <PulseCard pulse={pulse} onPulse={onPulse} />
      </Section>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.m, paddingBottom: 56 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp.m },
  askRow: { flexDirection: "row", gap: sp.s, marginTop: sp.xxl },
  ask: { flex: 1, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderRadius: r.md, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  askTxt: { fontFamily: f.regular, fontSize: 16, color: c.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
});
