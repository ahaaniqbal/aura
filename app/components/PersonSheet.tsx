import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Avatar from "./Avatar";
import { c, font, shadow } from "../theme";
import type { GraphPerson } from "../lib/api";
import { closeness, warmth, tieLabel } from "../lib/weight";

// The person detail. Tap a star in the constellation and the relationship opens up: who they
// are, what they're carrying, what they want, and what you owe them, each with a way to act.
// This is where Aura's memory of a person becomes something you can do something about.

function daysUntilBirthday(bday?: string | null): number | null {
  if (!bday) return null;
  const m = String(bday).match(/(\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  const mm = Number(m[1]) - 1, dd = Number(m[2]);
  let next = new Date(now.getFullYear(), mm, dd);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next < today) next = new Date(now.getFullYear() + 1, mm, dd);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function fmtBday(bday?: string | null): string {
  const m = bday && String(bday).match(/(\d{1,2})[-/](\d{1,2})/);
  if (!m) return "";
  return `${MONTHS[Number(m[1]) - 1] || ""} ${Number(m[2])}`;
}

export default function PersonSheet({ person, onClose, onAct }: { person: GraphPerson | null; onClose: () => void; onAct: (text: string) => void }) {
  const p = person;
  const first = p ? p.person.split(" ")[0].toLowerCase() : "";
  const wants = (p?.wants || []).filter(Boolean);
  const promises = (p?.open_promises || []).filter(Boolean);
  const bd = daysUntilBirthday(p?.birthday);
  const bsoon = bd !== null && bd <= 45;
  const cl = p ? closeness(p) : 0;
  const w = p ? warmth(p) : 1;
  const drift = w < 0.5 && cl >= 34;
  const ring = bsoon ? c.pink : promises.length ? c.coral : drift ? c.blue : c.mint;

  const run = (t: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onClose(); onAct(t); };
  const gift = () => run(`help me get ${first} something they'd love. they've mentioned wanting: ${wants.join(", ")}. suggest something thoughtful and offer to handle it for me.`);
  const reach = () => run(p?.care ? `help me reach out warmly to ${first}. what's going on: ${p.care}` : `help me reach out to ${first}, i'd love to reconnect.`);

  return (
    <Modal visible={!!p} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.grab} />
        {p ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <View style={st.head}>
              <Avatar name={p.person} size={68} ring={ring} glow={bsoon} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.name}>{p.person.toLowerCase()}</Text>
                <Text style={st.sub} numberOfLines={1}>
                  {[p.relation, p.org].filter(Boolean).join(" · ") || "someone you know"}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={st.x}><Feather name="x" size={18} color={c.ink} /></Pressable>
            </View>

            <View style={st.tie}>
              <View style={st.meterTrack}><View style={[st.meterFill, { width: `${Math.max(8, cl)}%`, backgroundColor: drift ? c.blue : c.accent }]} /></View>
              <Text style={[st.tieTxt, drift && { color: c.blue }]}>{tieLabel(cl, w)}</Text>
            </View>

            <View style={st.tags}>
              {bsoon ? <View style={[st.tag, { backgroundColor: c.pink }]}><Text style={st.tagTxt}>🎂 {bd === 0 ? "today" : bd === 1 ? "tomorrow" : `${fmtBday(p.birthday)}, ${bd}d`}</Text></View> : null}
              {(p.topics || []).slice(0, 3).map((t) => <View key={t} style={st.tagQuiet}><Text style={st.tagQuietTxt}>{t}</Text></View>)}
            </View>

            {p.care ? (
              <View style={st.care}>
                <View style={st.careHead}><Feather name="heart" size={13} color={c.pink} /><Text style={st.careLabel}>holding gently</Text></View>
                <Text style={st.careTxt}>{p.care}</Text>
                <Pressable onPress={reach} style={({ pressed }) => [st.careBtn, pressed && { opacity: 0.9 }]}><Text style={st.careBtnTxt}>reach out to {first}</Text><Feather name="arrow-right" size={15} color="#fff" /></Pressable>
              </View>
            ) : null}

            {wants.length ? (
              <View style={st.block}>
                <View style={st.blockHead}><Feather name="gift" size={13} color={c.accent} /><Text style={st.blockLabel}>wishlist</Text></View>
                <View style={st.chips}>{wants.map((w) => <View key={w} style={st.wChip}><Text style={st.wChipTxt}>{w}</Text></View>)}</View>
                <Pressable onPress={gift} style={({ pressed }) => [st.giftBtn, pressed && { opacity: 0.9 }]}>
                  <Feather name="gift" size={15} color="#fff" /><Text style={st.giftBtnTxt}>help me gift {first}</Text>
                </Pressable>
              </View>
            ) : null}

            {promises.length ? (
              <View style={st.block}>
                <View style={st.blockHead}><Feather name="corner-up-right" size={13} color={c.coral} /><Text style={[st.blockLabel, { color: c.coral }]}>you owe {first}</Text></View>
                {promises.map((pr) => <View key={pr} style={st.owe}><Text style={st.oweTxt}>{pr}</Text></View>)}
              </View>
            ) : null}

            {!p.care ? (
              <Pressable onPress={reach} style={({ pressed }) => [st.reach, pressed && { opacity: 0.92 }]}>
                <Feather name="message-circle" size={16} color="#fff" /><Text style={st.reachTxt}>reach out to {first}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const st: any = {
  scrim: { flex: 1, backgroundColor: "rgba(20,12,50,0.34)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 30, maxHeight: "82%", ...shadow.card },
  grab: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(23,19,52,0.14)", marginBottom: 14 },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  name: { fontFamily: font.display, fontSize: 23, color: c.ink, letterSpacing: -0.7 },
  sub: { fontFamily: font.medium, fontSize: 13.5, color: c.muted, letterSpacing: -0.2, marginTop: 2 },
  x: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(23,19,52,0.06)" },
  tie: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  meterTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: "rgba(23,19,52,0.08)", overflow: "hidden" },
  meterFill: { height: 7, borderRadius: 4 },
  tieTxt: { fontFamily: font.bold, fontSize: 11.5, color: c.accent, letterSpacing: -0.1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  tag: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  tagTxt: { fontFamily: font.bold, fontSize: 12, color: "#fff", letterSpacing: -0.2 },
  tagQuiet: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: "rgba(123,92,255,0.1)" },
  tagQuietTxt: { fontFamily: font.semibold, fontSize: 12, color: c.accent, letterSpacing: -0.2 },
  care: { backgroundColor: "rgba(255,92,168,0.09)", borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(255,92,168,0.22)", padding: 15, marginTop: 14 },
  careHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 },
  careLabel: { fontFamily: font.bold, fontSize: 11, color: c.pink, letterSpacing: -0.1, textTransform: "lowercase" },
  careTxt: { fontFamily: font.medium, fontSize: 15, lineHeight: 22, color: c.ink, letterSpacing: -0.2 },
  careBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.pink, height: 46, borderRadius: 14, marginTop: 12, ...shadow.soft },
  careBtnTxt: { fontFamily: font.bold, fontSize: 15, color: "#fff", letterSpacing: -0.3 },
  block: { marginTop: 18 },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 9 },
  blockLabel: { fontFamily: font.bold, fontSize: 11, color: c.accent, letterSpacing: -0.1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  wChip: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1.5, borderColor: "rgba(123,92,255,0.16)", ...shadow.soft },
  wChipTxt: { fontFamily: font.semibold, fontSize: 14, color: c.ink, letterSpacing: -0.2 },
  giftBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: c.accent, height: 50, borderRadius: 16, marginTop: 13, borderWidth: 2.5, borderColor: "#fff", ...shadow.puff },
  giftBtnTxt: { fontFamily: font.bold, fontSize: 15.5, color: "#fff", letterSpacing: -0.3 },
  owe: { backgroundColor: "#fff", borderRadius: 14, padding: 13, marginBottom: 7, borderWidth: 1, borderColor: "rgba(255,90,95,0.16)", ...shadow.soft },
  oweTxt: { fontFamily: font.medium, fontSize: 14.5, lineHeight: 21, color: c.ink, letterSpacing: -0.2 },
  reach: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: c.accent, height: 52, borderRadius: 16, marginTop: 20, borderWidth: 2.5, borderColor: "#fff", ...shadow.puff },
  reachTxt: { fontFamily: font.bold, fontSize: 16, color: "#fff", letterSpacing: -0.3 },
};
