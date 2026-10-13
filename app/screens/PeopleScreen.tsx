import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Avatar from "../components/Avatar";
import { Button, Divider, Empty, Press, Tabs } from "../components/ui";
import { c, f, inputReset, layout, r, sp, t, Tone, toneColor } from "../theme";
import { contactStats, isDrifting, closeness } from "../lib/weight";
import { capitalize, daysUntilBirthday, inDays } from "../lib/dates";
import type { GraphPerson } from "../lib/api";

type Filter = "all" | "needs" | "birthdays" | "drifting";
type Row = { p: GraphPerson; label: string | null; tone: Tone; line: string; need: boolean; bday: boolean; drift: boolean; cl: number };

// One reason per person, in priority order, and one color: orange only when they need you now.
function describe(p: GraphPerson): Row {
  const b = daysUntilBirthday(p.birthday);
  const bday = b !== null && b <= 21;
  const owes = !!(p.open_promises && p.open_promises.length);
  const care = !!(p.care && p.care_at && Date.now() - Number(p.care_at) < 30 * 86400000);
  const drift = isDrifting(p);
  const st = contactStats(p);
  let label: string | null = null, tone: Tone = "muted";
  if (care) { label = "On their mind"; tone = "signal"; }
  else if (bday) { label = `Birthday ${inDays(b as number).toLowerCase()}`; tone = (b as number) <= 3 ? "signal" : "neutral"; }
  else if (owes) { label = "You owe them"; tone = "neutral"; }
  else if (drift) { label = "Drifting"; tone = "muted"; }
  const line = [p.relation ? capitalize(p.relation) : null, p.org, st.lastLabel ? `last spoke ${st.lastLabel}` : null].filter(Boolean).join(" · ");
  return { p, label, tone, line: capitalize(line) || "Someone you know", need: bday || care || owes || drift, bday, drift, cl: closeness(p) };
}

export default function PeopleScreen({ people, onRefresh, onOpen, onAdd }: { people: GraphPerson[]; onRefresh: () => Promise<void> | void; onOpen: (name: string) => void; onAdd: () => void }) {
  useEffect(() => { onRefresh(); }, []);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => people.map(describe).sort((a, b) => (Number(b.need) - Number(a.need)) || (b.cl - a.cl)), [people]);
  const need = rows.filter((x) => x.need).length;
  const query = q.trim().toLowerCase();
  const shown = rows
    .filter((x) => filter === "all" || (filter === "needs" && x.need) || (filter === "birthdays" && x.bday) || (filter === "drifting" && x.drift))
    .filter((x) => !query || x.p.person.toLowerCase().includes(query) || (x.p.relation || "").toLowerCase().includes(query) || (x.p.org || "").toLowerCase().includes(query));

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={t.display} accessibilityRole="header">People</Text>
      {people.length ? (
        <>
          <Text style={[t.callout, { marginTop: sp.s }]}>
            {people.length} in your circle.{need ? ` ${need} could use a word from you.` : " Everyone's in touch."}
          </Text>

          {people.length > 5 ? (
            <View style={s.search}>
              <Feather name="search" size={16} color={c.muted} />
              <TextInput style={[s.searchInput, inputReset]} value={q} onChangeText={setQ} placeholder="Search by name, relation, company" placeholderTextColor={c.faint}
                selectionColor={c.accent} autoCorrect={false} accessibilityLabel="Search people" clearButtonMode="while-editing" />
            </View>
          ) : null}

          <Tabs style={{ marginTop: sp.l }} value={filter} onChange={setFilter} options={[
            { key: "all", label: "All", count: rows.length },
            { key: "needs", label: "Needs you", count: need },
            { key: "birthdays", label: "Birthdays", count: rows.filter((x) => x.bday).length },
            { key: "drifting", label: "Drifting", count: rows.filter((x) => x.drift).length },
          ]} />

          {shown.length ? shown.map((x, i) => (
            <View key={x.p.person}>
              {i > 0 ? <Divider inset={60} /> : null}
              <Press onPress={() => onOpen(x.p.person)} style={s.row} scaleTo={0.99} accessibilityLabel={`${x.p.person}${x.label ? `, ${x.label}` : ""}`}>
                <Avatar name={x.p.person} size={44} signal={x.tone === "signal"} />
                <View style={{ flex: 1 }}>
                  <Text style={t.headline} numberOfLines={1}>{x.p.person}</Text>
                  <Text style={[t.footnote, { marginTop: 2 }]} numberOfLines={1}>{x.line}</Text>
                </View>
                {x.label ? <Text style={[s.reason, { color: toneColor[x.tone] }]} numberOfLines={1}>{x.label}</Text> : null}
              </Press>
            </View>
          )) : (
            <Empty title={query ? `No one matches "${q.trim()}"` : "No one here"} body={query ? "Check the spelling, or search by relation or company." : "Nobody fits this filter right now."} />
          )}
        </>
      ) : (
        <Empty style={{ marginTop: sp.l }} title="Start with one person" body="Tell Aura about someone who matters: how you know them, their birthday, anything you owe them. They'll appear here.">
          <Button label="Tell Aura about someone" size="md" onPress={onAdd} />
        </Empty>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.xl, paddingBottom: 56 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 44, marginTop: sp.xl, paddingHorizontal: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  searchInput: { flex: 1, height: 44, fontFamily: f.regular, fontSize: 15.5, color: c.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 13 },
  reason: { fontFamily: f.medium, fontSize: 13, maxWidth: 130, textAlign: "right" },
});
