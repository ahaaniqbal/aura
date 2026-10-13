import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Avatar from "../components/Avatar";
import ActionCard from "../components/ActionCard";
import { Button, Divider, Empty, LinkButton, Press, Section, Status, Toggle } from "../components/ui";
import { usd } from "../components/Results";
import { c, f, layout, r, sp, t, Tone, toneColor } from "../theme";
import { contactStats, isDrifting, warmth } from "../lib/weight";
import { capitalize, daysUntilBirthday, dueMeta, inDays, reminderWhen, todayLabel } from "../lib/dates";
import type { Card as ActionItem, GraphPerson, MoneySummary, PlaceReminder, PromiseItem, Reminder, Routine, Trip } from "../lib/api";

type Nudge = { key: string; person: string | null; title: string; label: string; tone: Tone; body: string; rank: number; promise?: string };

const firstName = (n: string) => String(n || "").split(" ")[0];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

// The brief for work and life: what's waiting for your OK, what's on your plate, and who could
// use you. It leads with a sentence, not a dashboard.
export default function TodayScreen({ loaded, approvals, onAct, onEdit, busy, scheduled, places, onReminderDone, promises, people, onDone, onOpenPerson, onAsk, onRecord, onBrief, status, statusTone, routines, connected, onRoutine, onToggleRoutine, onConnect, trips, onTrip, money, onMoney }: {
  loaded: boolean; approvals: ActionItem[]; onAct: (c: ActionItem, d: "approve" | "decline") => void; onEdit: (c: ActionItem) => void; busy: boolean;
  scheduled: Reminder[]; places: PlaceReminder[]; onReminderDone: (id: string) => void;
  promises: PromiseItem[]; people: GraphPerson[]; onDone: (text: string) => void; onOpenPerson: (name: string) => void;
  onAsk: () => void; onRecord: () => void; onBrief: () => void; status: string; statusTone: Tone;
  routines: Routine[]; connected: string[]; onRoutine: (r: Routine) => void; onToggleRoutine: (r: Routine, on: boolean) => void; onConnect: (slug: string) => void;
  trips: Trip[]; onTrip: (t: Trip) => void; money: MoneySummary | null; onMoney: () => void;
}) {
  const plate = scheduled.filter((x) => x.bucket === "today" || x.bucket === "tomorrow");

  const pN: Nudge[] = promises.map((p) => {
    const meta = dueMeta(p.due);
    const who = p.person || null;
    return {
      key: "p:" + p.text + (p.person || ""), person: who, title: capitalize(p.text), promise: p.text,
      label: meta ? meta.label : "Open", tone: meta?.tone === "over" ? "accent" : meta?.tone === "soon" ? "neutral" : "muted",
      body: p.direction === "owed_to_me" ? `${who || "Someone"} owes you` : `Promised to ${who || "someone"}`, rank: meta ? meta.rank : 9999,
    };
  });
  const bN: Nudge[] = people.map((p) => ({ p, d: daysUntilBirthday(p.birthday) })).filter((x) => x.d !== null && (x.d as number) <= 14).map(({ p, d }) => {
    const days = d as number;
    const wants = (p.wants || []).filter(Boolean).map((w) => w.charAt(0).toLowerCase() + w.slice(1));
    return { key: "b:" + p.person, person: p.person, title: `${firstName(p.person)}'s birthday`, label: inDays(days), tone: days <= 3 ? "accent" : "neutral",
      body: wants.length ? `Would love ${wants.slice(0, 2).join(" or ")}` : "", rank: days };
  });
  const cN: Nudge[] = people.filter((p) => p.care && p.care_at && (Date.now() - Number(p.care_at) < 30 * 86400000)).slice(0, 3).map((p) => ({
    key: "c:" + p.person, person: p.person, title: `Check in on ${firstName(p.person)}`, label: "On their mind", tone: "accent", body: String(p.care || ""), rank: -12,
  }));
  const surfaced = new Set([...cN, ...pN, ...bN].map((n) => String(n.person || "").toLowerCase()));
  const rN: Nudge[] = people.filter((p) => !surfaced.has(String(p.person).toLowerCase()) && isDrifting(p))
    .sort((a, b) => warmth(a) - warmth(b)).slice(0, 2).map((p) => {
      const st = contactStats(p);
      return { key: "r:" + p.person, person: p.person, title: `Reconnect with ${firstName(p.person)}`, label: "It's been a while", tone: "muted",
        body: st.lastLabel ? `Last spoke ${st.lastLabel}` : "", rank: 6 };
    });
  const nudges = [...cN, ...rN, ...pN, ...bN].sort((a, b) => a.rank - b.rank).slice(0, 5);

  // one sentence that says what kind of day it is, then the rest as a quieter line
  const parts: string[] = [];
  if (approvals.length) parts.push(`${plural(approvals.length, "reply is", "replies are")} waiting for your OK`);
  const onPlate = plate.length + places.length;
  if (onPlate) parts.push(`${plural(onPlate, "thing", "things")} on your plate`);
  if (nudges.length) parts.push(`${plural(nudges.length, "person", "people")} could use you`);
  const headline = parts.length ? capitalize(parts[0]) + "." : "Nothing needs you right now.";
  const rest = parts.slice(1);

  return (
    <ScrollView style={s.fill} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.top}>
        <Text style={t.caption}>{todayLabel()}</Text>
        <Status label={status} tone={statusTone} dot />
      </View>
      {loaded ? (
        <>
          <Text style={[t.display, { marginTop: sp.l }]} accessibilityRole="header">{headline}</Text>
          {rest.length ? <Text style={[t.callout, { marginTop: sp.s }]}>Also {joinList(rest)}.</Text> : null}
        </>
      ) : (
        <View style={{ marginTop: sp.l, gap: 10 }} accessibilityLabel="Loading your day">
          <View style={[s.skel, { height: 34, width: "88%" }]} />
          <View style={[s.skel, { height: 34, width: "56%" }]} />
        </View>
      )}

      <View style={s.quick}>
        <Press onPress={onAsk} style={s.ask} scaleTo={0.99} accessibilityLabel="Message Aura">
          <Text style={s.askTxt}>Message Aura</Text>
          <Feather name="arrow-up" size={17} color={c.ink2} />
        </Press>
        <Press onPress={onRecord} style={s.record} scaleTo={0.97} accessibilityLabel="Record a conversation">
          <View style={s.recDot} />
          <Text style={t.label}>Record</Text>
        </Press>
      </View>
      <LinkButton label="Get my brief" icon="sun" onPress={onBrief} style={{ marginTop: sp.s }} />

      {approvals.length ? (
        <Section title="Waiting for your OK" meta={String(approvals.length)}>
          {approvals.map((cd) => <ActionCard key={cd.id} card={cd} onAct={onAct} onEdit={onEdit} busy={busy} />)}
        </Section>
      ) : null}

      {routines.length ? (
        <Section title="Running on its own" meta={`${routines.filter((r) => r.active).length} on`}>
          {routines.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <RoutineRow r={r} connected={connected} onPress={() => onRoutine(r)} onToggle={(on) => onToggleRoutine(r, on)} onConnect={onConnect} />
            </View>
          ))}
        </Section>
      ) : null}

      {loaded && (plate.length || places.length) ? (
        <Section title="On your plate" meta={String(plate.length + places.length)}>
          {[...plate.map((x) => ({ id: x.id, when: reminderWhen(x), text: x.text })), ...places.map((x) => ({ id: x.id, when: x.place, text: x.text }))].map((x, i) => (
            <View key={x.id}>
              {i > 0 ? <Divider /> : null}
              <View style={s.item}>
                <Text style={s.when} numberOfLines={2}>{x.when}</Text>
                <Text style={[t.body, { flex: 1 }]}>{x.text}</Text>
                <Press onPress={() => onReminderDone(x.id)} hitSlop={8} scaleTo={0.9} style={s.check} accessibilityRole="checkbox" accessibilityLabel={`Mark done: ${x.text}`} />
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {trips.length || (money && (money.total > 0 || money.categories.some((x) => x.budget))) ? (
        <Section title={trips.length && money && money.total > 0 ? "Trips and money" : trips.length ? "Coming up" : "Money"}>
          {trips.slice(0, 2).map((tr, i) => (
            <View key={tr.id}>
              {i > 0 ? <Divider /> : null}
              <Press onPress={() => onTrip(tr)} style={s.item} scaleTo={0.99} accessibilityLabel={`Trip: ${tr.title}`}>
                <Text style={s.when} numberOfLines={2}>{tr.start_date ? shortDay(tr.start_date) : "Planning"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={t.body}>{tr.title}</Text>
                  <Text style={[t.footnote, { marginTop: 2 }]}>{[(tr.plan || []).length ? `${tr.plan.length} day plan` : null, tr.bookings?.length ? `${tr.bookings.length} booked` : null].filter(Boolean).join("  ·  ") || tr.destination || "Trip"}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={c.faint} style={{ marginTop: 3 }} />
              </Press>
            </View>
          ))}
          {money && (money.total > 0 || money.categories.some((x) => x.budget)) ? (
            <View>
              {trips.length ? <Divider /> : null}
              <Press onPress={onMoney} style={s.item} scaleTo={0.99} accessibilityLabel="This month's spending">
                <Text style={s.when}>This month</Text>
                <View style={{ flex: 1 }}>
                  <Text style={t.body}>{usd(money.total)} spent</Text>
                  {(() => { const over = money.categories.find((x) => x.budget && x.spent > x.budget); const top = money.categories[0];
                    return over ? <Text style={[t.footnote, { marginTop: 2, color: c.accentText }]}>{over.category} is over budget by {usd(over.spent - (over.budget || 0))}</Text>
                      : top ? <Text style={[t.footnote, { marginTop: 2 }]}>Most on {top.category.toLowerCase()}, {usd(top.spent)}</Text> : null; })()}
                </View>
                <Feather name="chevron-right" size={18} color={c.faint} style={{ marginTop: 3 }} />
              </Press>
            </View>
          ) : null}
        </Section>
      ) : null}

      <Section title="Your people">
        {!loaded ? <SkeletonRows /> : nudges.length ? nudges.map((n, i) => (
          <View key={n.key}>
            {i > 0 ? <Divider inset={56} /> : null}
            <Press onPress={() => n.person && onOpenPerson(n.person)} disabled={!n.person} style={s.row} scaleTo={0.99} accessibilityLabel={`${n.title}. ${n.label}`}>
              <Avatar name={n.person || "?"} size={40} signal={n.tone === "accent"} />
              <View style={{ flex: 1 }}>
                <Text style={t.label}>{n.title}</Text>
                <Text style={[t.callout, { marginTop: 3 }]} numberOfLines={2}>
                  <Text style={{ fontFamily: f.medium, color: toneColor[n.tone] }}>{n.label}</Text>
                  {n.body ? `  ${n.body}` : ""}
                </Text>
              </View>
              {n.promise ? <Button label="Done" size="sm" variant="secondary" onPress={() => onDone(n.promise as string)} /> : <Feather name="chevron-right" size={18} color={c.faint} />}
            </Press>
          </View>
        )) : (
          <Empty title="No one's waiting on you" body="Mention a birthday, a promise or a friend you haven't seen in a while, and Aura brings them back here at the right time." />
        )}
      </Section>
    </ScrollView>
  );
}

const APP_NAME: Record<string, string> = { googlecalendar: "Calendar", gmail: "Gmail" };
// A routine reads like a line in the day: when, what, and a switch.
function RoutineRow({ r, connected, onPress, onToggle, onConnect }: { r: Routine; connected: string[]; onPress: () => void; onToggle: (on: boolean) => void; onConnect: (slug: string) => void }) {
  const missing = r.needs && !connected.some((x) => x.replace(/[-_]/g, "") === r.needs) ? r.needs : null;
  return (
    <View style={s.item}>
      <Text style={[s.when, !r.active && { color: c.muted }]} numberOfLines={2}>{r.cadence === "before_meetings" ? "Before meetings" : clockLabel(r.at)}</Text>
      <Press onPress={onPress} style={{ flex: 1 }} scaleTo={0.99} accessibilityLabel={`${r.title}. ${r.blurb || ""}. Details`}>
        <Text style={[t.body, !r.active && { color: c.ink2 }]}>{r.title}</Text>
        <Text style={[t.footnote, { marginTop: 2 }]} numberOfLines={2}>{r.blurb || r.prompt}</Text>
      </Press>
      {missing
        ? <Button label={`Connect ${APP_NAME[missing] || missing}`} size="sm" variant="secondary" onPress={() => onConnect(missing === "googlecalendar" ? "google-calendar" : missing)} />
        : <Toggle value={r.active} onChange={onToggle} label={`${r.title} on`} />}
    </View>
  );
}
function clockLabel(at: string) { const [h, m] = String(at || "08:00").split(":").map((x) => parseInt(x, 10)); return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; }
function shortDay(iso: string) { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return iso; return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1]} ${+m[3]}`; }

function SkeletonRows() {
  return (
    <View accessibilityLabel="Loading">
      {[0, 1, 2].map((i) => (
        <View key={i} style={[s.row, { opacity: 1 - i * 0.25 }]}>
          <View style={[s.skel, { width: 40, height: 40, borderRadius: 20 }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[s.skel, { height: 12, width: "60%" }]} />
            <View style={[s.skel, { height: 10, width: "80%" }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.m, paddingBottom: 56 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp.m },
  skel: { backgroundColor: c.sunken, borderRadius: r.xs },
  quick: { flexDirection: "row", gap: sp.s, marginTop: sp.xxl },
  ask: { flex: 1, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderRadius: r.md, borderWidth: 1, borderColor: c.control, backgroundColor: c.surface },
  askTxt: { fontFamily: f.regular, fontSize: 16, color: c.faint },
  record: { height: 50, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, borderRadius: r.md, borderWidth: 1, borderColor: c.control },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 13 },
  when: { width: 76, fontFamily: f.medium, fontSize: 14, lineHeight: 23, color: c.ink2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.control },
});
