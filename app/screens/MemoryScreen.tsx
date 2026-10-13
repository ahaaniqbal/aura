import React, { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Avatar from "../components/Avatar";
import MicButton from "../components/MicButton";
import { Divider, Empty, FadeIn, IconButton, LinkButton, Press, Tabs } from "../components/ui";
import { c, f, inputReset, layout, r, sp, t, toneColor } from "../theme";
import { contactStats, closeness, isDrifting } from "../lib/weight";
import { capitalize, daysUntilBirthday, inDays, reminderWhen } from "../lib/dates";
import type { ProfileGroup, CaptureResult, GraphPerson, Memory, PlaceReminder, Reminder } from "../lib/api";

type Seg = "you" | "people" | "reminders";
const BUCKETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" }, { key: "tomorrow", label: "Tomorrow" }, { key: "week", label: "This week" }, { key: "later", label: "Later" },
];

// Everything Aura knows, in the open. Teach it something, see what it kept, and forget anything.
export default function MemoryScreen({ loaded, memories, profile, people, scheduled, places, onTeach, onForget, onForgetFact, onForgetAll, onOpenPerson, onReminderDone }: {
  loaded: boolean; memories: Memory[]; profile: ProfileGroup[]; people: GraphPerson[]; scheduled: Reminder[]; places: PlaceReminder[];
  onTeach: (t: string) => Promise<CaptureResult>; onForget: (m: Memory) => void; onForgetFact: (id: string, text: string) => void; onForgetAll: () => void;
  onOpenPerson: (name: string) => void; onReminderDone: (id: string) => void;
}) {
  const [seg, setSeg] = useState<Seg>("you");
  const [d, setD] = useState("");
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [caught, setCaught] = useState<CaptureResult | null>(null);
  const [q, setQ] = useState("");

  const facts = memories.filter((m) => m.kind !== "task");
  const tasks = memories.filter((m) => m.kind === "task");
  const reminderCount = scheduled.length + places.length + tasks.length;
  const groups = profile.filter((g) => g.key !== "people" && g.items.length);
  const known = groups.reduce((a, g) => a + g.items.length, 0);

  const submit = async () => {
    const text = d.trim(); if (!text || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSending(true); setFailed(false);
    try { const res = await onTeach(text); setCaught(res); setD(""); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    catch (e) { setFailed(true); } finally { setSending(false); }
  };

  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      <ScrollView style={s.fill} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={t.display} accessibilityRole="header">Memory</Text>
        <Text style={[t.callout, { marginTop: sp.s }]}>What Aura knows about you, so you never have to say it twice.</Text>

        <View style={[s.field, focused && { borderColor: c.ink }]}>
          <TextInput style={[s.input, inputReset]} value={d} onChangeText={setD} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholder="I'm vegetarian. Standup is at 9:30. Remind me to renew my passport in May." placeholderTextColor={c.faint}
            multiline textAlignVertical="top" selectionColor={c.accent} accessibilityLabel="Teach Aura something" />
          <View style={s.foot}>
            <Text style={[t.footnote, { flex: 1 }]} numberOfLines={1}>Facts are kept. Times become reminders.</Text>
            <MicButton onResult={(x) => setD((p) => (p ? p + " " + x : x))} disabled={sending} size={34} variant="inline" />
            <Press onPress={submit} disabled={!d.trim() || sending} style={[s.send, (!d.trim() || sending) && s.sendOff]} accessibilityLabel="Save to memory" scaleTo={0.92}>
              {sending ? <ActivityIndicator color={c.onInk} size="small" /> : <Feather name="arrow-up" size={18} color={d.trim() ? c.onInk : c.muted} />}
            </Press>
          </View>
        </View>
        {failed ? <Text style={s.err}>That didn't save. Check your connection and try again.</Text> : null}
        {caught ? (
          <FadeIn style={{ marginTop: sp.l }}>
            <View style={s.caughtHead}>
              <Feather name="check" size={14} color={c.accentText} />
              <Text style={[t.caption, { color: c.accentText, flex: 1 }]}>Saved</Text>
              <IconButton icon="x" variant="plain" size={28} color={c.muted} onPress={() => setCaught(null)} label="Dismiss" />
            </View>
            <Text style={t.body}>{caught.summary}</Text>
            {caught.chips.length ? <Text style={[t.callout, { marginTop: sp.s }]}>{caught.chips.map((cp) => capitalize(cp.label)).join("  ·  ")}</Text> : null}
          </FadeIn>
        ) : null}

        <Tabs style={{ marginTop: sp.h }} value={seg} onChange={setSeg} options={[
          { key: "you", label: "About you", count: facts.length + known },
          { key: "people", label: "People", count: people.length },
          { key: "reminders", label: "Reminders", count: reminderCount },
        ]} />

        {!loaded ? <Text style={[t.callout, { paddingVertical: sp.xl }]}>Loading what Aura knows…</Text> : null}

        {loaded && seg === "you" ? (
          facts.length || known ? (
            <>
              {groups.map((g) => (
                <View key={g.key}>
                  <Text style={s.group}>{g.label}</Text>
                  {g.items.map((it, i) => (
                    <View key={it.id}>
                      {i > 0 ? <Divider /> : null}
                      <View style={s.fact}>
                        <View style={{ flex: 1 }}>
                          <Text style={t.body}>{it.target || it.text}</Text>
                          {factCaption(it) ? <Text style={[t.footnote, { marginTop: 2 }]}>{factCaption(it)}</Text> : null}
                        </View>
                        <IconButton icon="x" variant="plain" size={30} color={c.muted} onPress={() => onForgetFact(it.id, it.text)} label={`Forget: ${it.text}`} />
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              {facts.length ? <Text style={s.group}>{groups.length ? "Notes" : "What you've told Aura"}</Text> : null}
              {facts.map((m, i) => (
                <View key={m.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={s.fact}>
                    <Text style={[t.body, { flex: 1 }]}>{m.text}</Text>
                    <IconButton icon="x" variant="plain" size={30} color={c.muted} onPress={() => onForget(m)} label={`Forget: ${m.text}`} />
                  </View>
                </View>
              ))}
              <LinkButton label="Forget everything" icon="trash-2" color={c.ink2} onPress={onForgetAll} style={{ marginTop: sp.l }} />
            </>
          ) : <Empty title="Nothing yet" body="Tell Aura about your work, your routines, what you like and don't. Everything it keeps shows up here, and you can remove any of it." />
        ) : null}

        {loaded && seg === "people" ? <PeopleList people={people} q={q} setQ={setQ} onOpen={onOpenPerson} /> : null}

        {loaded && seg === "reminders" ? (
          reminderCount ? (
            <>
              {BUCKETS.map((b) => {
                const items = scheduled.filter((x) => x.bucket === b.key);
                if (!items.length) return null;
                return (
                  <View key={b.key}>
                    <Text style={s.group}>{b.label}</Text>
                    {items.map((x, i) => (
                      <View key={x.id}>
                        {i > 0 ? <Divider /> : null}
                        <Item when={reminderWhen(x, true)} text={x.text} onDone={() => onReminderDone(x.id)} />
                      </View>
                    ))}
                  </View>
                );
              })}
              {places.length ? (
                <View>
                  <Text style={s.group}>When you're there</Text>
                  {places.map((x, i) => (
                    <View key={x.id}>
                      {i > 0 ? <Divider /> : null}
                      <Item when={x.place} text={x.text} onDone={() => onReminderDone(x.id)} />
                    </View>
                  ))}
                </View>
              ) : null}
              {tasks.length ? (
                <View>
                  <Text style={s.group}>To do</Text>
                  {tasks.map((x, i) => (
                    <View key={x.id}>
                      {i > 0 ? <Divider /> : null}
                      <View style={s.fact}>
                        <Text style={[t.body, { flex: 1 }]}>{x.text}</Text>
                        <IconButton icon="x" variant="plain" size={30} color={c.muted} onPress={() => onForget(x)} label={`Remove: ${x.text}`} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : <Empty title="No reminders" body="Say when or where, like 'Thursday at 3' or 'when I'm at Trader Joe's', and Aura brings it back then." />
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

// What a learned fact is, in a word or two, under its subject: "Lumen" / "Work, head of product".
const REL_CAPTION: Record<string, string> = { WORKS_FOR: "Work", WORKS_ON: "Project", LIVES_IN: "Home", BORN_ON: "Your birthday", PURSUES: "Goal", FOLLOWS: "Habit", VISITED: "Been there", PLANS_TO_VISIT: "Wants to go", KNOWS: "Knows" };
function factCaption(it: ProfileGroup["items"][number]): string {
  const base = it.relation && REL_CAPTION[it.relation] ? REL_CAPTION[it.relation] : "";
  return capitalize([base, it.detail, it.context].filter(Boolean).join(", "));
}

function PeopleList({ people, q, setQ, onOpen }: { people: GraphPerson[]; q: string; setQ: (v: string) => void; onOpen: (name: string) => void }) {
  const rows = useMemo(() => people.map((p) => {
    const b = daysUntilBirthday(p.birthday);
    const care = !!(p.care && p.care_at && Date.now() - Number(p.care_at) < 30 * 86400000);
    const st = contactStats(p);
    const label = care ? "On their mind" : b !== null && b <= 14 ? `Birthday ${inDays(b).toLowerCase()}` : p.open_promises?.length ? "You owe them" : isDrifting(p) ? "It's been a while" : null;
    const signal = care || (b !== null && b <= 3);
    const line = capitalize([p.relation, p.org, st.lastLabel ? `last spoke ${st.lastLabel}` : null].filter(Boolean).join(" · ")) || "Someone you know";
    return { p, label, signal, line, party: b !== null && b <= 14, cl: closeness(p) };
  }).sort((a, b) => Number(!!b.label) - Number(!!a.label) || b.cl - a.cl), [people]);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((x) => !query || [x.p.person, x.p.relation, x.p.org].some((v) => (v || "").toLowerCase().includes(query)));
  if (!people.length) return <Empty title="No one yet" body="Mention someone in a conversation, with how you know them or their birthday, and they'll appear here." />;
  return (
    <View>
      {people.length > 6 ? (
        <View style={s.search}>
          <Feather name="search" size={16} color={c.muted} />
          <TextInput style={[s.searchInput, inputReset]} value={q} onChangeText={setQ} placeholder="Search people" placeholderTextColor={c.faint} selectionColor={c.accent} autoCorrect={false} accessibilityLabel="Search people" />
        </View>
      ) : null}
      {shown.map((x, i) => (
        <View key={x.p.person}>
          {i > 0 ? <Divider inset={60} /> : null}
          <Press onPress={() => onOpen(x.p.person)} style={s.person} scaleTo={0.99} accessibilityLabel={`${x.p.person}${x.label ? `, ${x.label}` : ""}`}>
            <Avatar name={x.p.person} size={44} signal={x.signal} party={x.party} />
            <View style={{ flex: 1 }}>
              <Text style={t.headline} numberOfLines={1}>{x.p.person}</Text>
              <Text style={[t.footnote, { marginTop: 2 }]} numberOfLines={1}>{x.line}</Text>
            </View>
            {x.label ? <Text style={[s.reason, { color: x.signal ? toneColor.accent : toneColor.neutral }]} numberOfLines={1}>{x.label}</Text> : null}
          </Press>
        </View>
      ))}
      {!shown.length ? <Empty title={`No one matches "${q.trim()}"`} body="Try a first name, a relation like 'sister', or a company." /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.xl, paddingBottom: 56 },
  field: { marginTop: sp.xl, backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.control },
  input: { fontFamily: f.regular, fontSize: 17, lineHeight: 25, color: c.ink, minHeight: 92, paddingHorizontal: sp.l, paddingTop: 14, paddingBottom: 6 },
  foot: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: sp.l, paddingRight: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  send: { width: 34, height: 34, borderRadius: r.sm, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" },
  sendOff: { backgroundColor: c.sunken },
  err: { fontFamily: f.medium, fontSize: 13, color: c.accentText, marginTop: sp.s },
  caughtHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  fact: { flexDirection: "row", alignItems: "center", gap: sp.m, paddingVertical: 10 },
  group: { fontFamily: f.medium, fontSize: 13, color: c.muted, marginTop: sp.xl, marginBottom: 2 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 13 },
  when: { width: 76, fontFamily: f.medium, fontSize: 14, lineHeight: 23, color: c.ink2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.control },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 44, marginTop: sp.l, paddingHorizontal: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.control, backgroundColor: c.surface },
  searchInput: { flex: 1, height: 44, fontFamily: f.regular, fontSize: 15, color: c.ink },
  person: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 13 },
  reason: { fontFamily: f.medium, fontSize: 13, maxWidth: 130, textAlign: "right" },
});
