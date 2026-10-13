import React, { useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Avatar from "./Avatar";
import { Button, IconButton, Sheet } from "./ui";
import { c, f, sp, t } from "../theme";
import type { GraphPerson } from "../lib/api";
import { closeness, warmth, tieLabel, contactStats } from "../lib/weight";
import { capitalize, daysUntilBirthday, fmtBday, inDays } from "../lib/dates";

// The person detail: what Aura knows, as a plain record. Facts first, then what's on their mind,
// what they'd love, and what you owe them, with the two things you can do about it at the bottom.
export default function PersonSheet({ person, onClose, onAct }: { person: GraphPerson | null; onClose: () => void; onAct: (text: string) => void }) {
  // keep the last person while the sheet animates closed
  const last = useRef<GraphPerson | null>(person);
  if (person) last.current = person;
  const p = person || last.current;

  const first = p ? p.person.split(" ")[0] : "";
  const wants = (p?.wants || []).filter(Boolean);
  const promises = (p?.open_promises || []).filter(Boolean);
  const topics = (p?.topics || []).filter(Boolean);
  const bd = daysUntilBirthday(p?.birthday);
  const stats = p ? contactStats(p) : null;
  const tie = p ? capitalize(tieLabel(closeness(p), warmth(p))) : "";

  const run = (text: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onClose(); onAct(text); };
  const gift = () => run(`help me get ${first} something they'd love. they've mentioned wanting: ${wants.join(", ")}. suggest something thoughtful and offer to handle it for me.`);
  const reach = () => run(p?.care ? `help me reach out warmly to ${first}. what's going on: ${p.care}` : `help me reach out to ${first}, i'd love to reconnect.`);

  const facts: [string, string][] = p ? [
    ["Relationship", [p.relation && capitalize(p.relation), p.org].filter(Boolean).join(", ") || "Not set"],
    ["Closeness", tie],
    ...(bd !== null ? [["Birthday", `${fmtBday(p.birthday)}, ${inDays(bd).toLowerCase()}`] as [string, string]] : []),
    ["Last spoke", stats?.lastLabel ? capitalize(stats.lastLabel) : "Not yet"],
    ...(stats?.cadenceLabel ? [["Usually", capitalize(stats.cadenceLabel)] as [string, string]] : []),
  ] : [];

  return (
    <Sheet visible={!!person} onClose={onClose}>
      {p ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          <View style={s.head}>
            <Avatar name={p.person} size={52} />
            <Text style={[t.title1, { flex: 1, marginLeft: 14 }]} numberOfLines={2}>{p.person}</Text>
            <IconButton icon="x" size={34} onPress={onClose} label="Close" />
          </View>

          <View style={s.facts}>
            {facts.map(([k, v]) => (
              <View key={k} style={s.fact}>
                <Text style={s.key}>{k}</Text>
                <Text style={[s.val, k === "Birthday" && bd !== null && bd <= 7 && { color: c.accentText }]}>{v}</Text>
              </View>
            ))}
          </View>

          {p.care ? (
            <View style={s.block}>
              <Text style={s.label}>On {first}'s mind</Text>
              <Text style={s.care}>{p.care}</Text>
            </View>
          ) : null}

          {wants.length ? (
            <View style={s.block}>
              <Text style={s.label}>Would love</Text>
              {wants.map((x) => <Text key={x} style={s.item}>{x}</Text>)}
            </View>
          ) : null}

          {promises.length ? (
            <View style={s.block}>
              <Text style={s.label}>You owe {first}</Text>
              {promises.map((x) => <Text key={x} style={s.item}>{x}</Text>)}
            </View>
          ) : null}

          {topics.length ? (
            <View style={s.block}>
              <Text style={s.label}>Talks about</Text>
              <Text style={[t.body, { marginTop: 6 }]}>{capitalize(topics.slice(0, 6).join(", "))}</Text>
            </View>
          ) : null}

          <View style={s.actions}>
            <Button label={`Reach out to ${first}`} onPress={reach} style={{ flex: 1 }} />
            {wants.length ? <Button label="Find a gift" variant="secondary" onPress={gift} /> : null}
          </View>
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", marginBottom: sp.xl },
  facts: { borderTopWidth: 1, borderTopColor: c.ink },
  fact: { flexDirection: "row", alignItems: "baseline", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  key: { width: 112, fontFamily: f.regular, fontSize: 14, color: c.muted },
  val: { flex: 1, fontFamily: f.medium, fontSize: 15, color: c.ink, letterSpacing: -0.1 },
  block: { marginTop: sp.xxl },
  label: { fontFamily: f.medium, fontSize: 13.5, color: c.muted },
  care: { fontFamily: f.medium, fontSize: 19, lineHeight: 25, letterSpacing: -0.4, color: c.ink, marginTop: 6 },
  item: { fontFamily: f.regular, fontSize: 16, lineHeight: 22, color: c.ink, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  actions: { flexDirection: "row", gap: sp.s, marginTop: sp.h },
});
