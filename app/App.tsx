import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, UIManager, View,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const ease = () => LayoutAnimation.configureNext(LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as Location from "expo-location";
import { useFonts } from "expo-font";
import { Fraunces_600SemiBold, Fraunces_500Medium, Fraunces_400Regular_Italic } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { Feather } from "@expo/vector-icons";
import Orb from "./components/Orb";
import BrandIcon from "./components/BrandIcon";
import MicButton from "./components/MicButton";
import { c, font, r, sp, type as ty } from "./theme";
import { addNote, approve, capture, Card, connect, Feed, getConnections, getFeed, Memory, Message, setLocation, simulate, syncEmail } from "./lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: false,
  } as any),
});

const TOOLS = [
  { key: "gmail", slug: "gmail", brand: "gmail", label: "Gmail", icon: "mail", sub: "drafts replies in your voice" },
  { key: "gcal", slug: "google-calendar", brand: "googlecalendar", label: "Calendar", icon: "calendar", sub: "knows when you're free" },
  { key: "notion", slug: "notion", brand: "notion", label: "Notion", icon: "file-text", sub: "your notes and docs" },
  { key: "slack", slug: "slack", brand: "slack", label: "Slack", icon: "slack", sub: "catches what matters" },
  { key: "whatsapp", slug: "", brand: "whatsapp", label: "WhatsApp", icon: "message-circle", sub: "messages and threads" },
  { key: "bank", slug: "", brand: "", label: "Bank and cards", icon: "credit-card", sub: "pays, with your ok" },
];

export default function App() {
  const [loaded] = useFonts({
    Fraunces_600SemiBold, Fraunces_500Medium, Fraunces_400Regular_Italic,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const [feed, setFeed] = useState<Feed | null>(null);
  const [tab, setTab] = useState<"chat" | "notes" | "connect">("chat");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [serverConnected, setServerConnected] = useState<string[]>([]);
  const [pending, setPending] = useState<{ id: string; content: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const sigRef = useRef("");
  const sendingRef = useRef(false);
  const scroller = useRef<ScrollView>(null);

  const refresh = useCallback(async () => {
    try {
      const f = await getFeed();
      for (const card of f.cards || []) {
        if (card.type === "urgent" && card.status === "pending" && !seen.current.has(card.id)) {
          if (!first.current) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            Notifications.scheduleNotificationAsync({ content: { title: "aura", body: `${card.title}, looks urgent. i drafted a reply.` }, trigger: null }).catch(() => {});
          }
        }
        seen.current.add(card.id);
      }
      first.current = false;
      const sig = `${(f.messages || []).length}:${(f.messages || []).slice(-1)[0]?.id || ""}:${(f.cards || []).map((x) => x.id + x.status + x.body).join(",")}:${(f.memories || []).length}:${f.context?.status || ""}`;
      if (sig !== sigRef.current) { sigRef.current = sig; ease(); setFeed(f); }
    } catch (e) { /* keep last good feed */ }
  }, []);

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
    refresh();
    getConnections().then(setServerConnected).catch(() => {});
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({});
        const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const place = geo[0]?.district || geo[0]?.city || geo[0]?.subregion || "nearby";
        await setLocation(pos.coords.latitude, pos.coords.longitude, place);
      } catch (e) { /* ignore */ }
    })();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (tab === "chat") setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 120);
  }, [feed?.messages?.length, tab]);

  const send = async () => {
    const t = draft.trim();
    if (!t || sendingRef.current) return;
    sendingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const tempId = "t" + Date.now();
    ease();
    setPending((p) => [...p, { id: tempId, content: t }]);
    setDraft(""); setBusy(true); setThinking(true);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    try { await capture(t); await refresh(); }
    finally { sendingRef.current = false; setPending((p) => p.filter((x) => x.id !== tempId)); setThinking(false); setBusy(false); }
  };
  const act = async (card: Card, decision: "approve" | "decline") => {
    if (!card.action_id) return;
    Haptics.impactAsync(decision === "approve" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true);
    try {
      await approve(card.action_id, decision);
      if (decision === "approve") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await refresh();
    } finally { setBusy(false); }
  };
  const runSim = async (scenario: string, extra: any = {}) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDemoOpen(false); setBusy(true); setTab("chat");
    try { await simulate(scenario, extra); await refresh(); } finally { setBusy(false); }
  };
  const syncEmailFlow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDemoOpen(false); setBusy(true); setTab("chat"); setThinking(true);
    try { await syncEmail(); await refresh(); } finally { setThinking(false); setBusy(false); }
  };
  const addNoteFlow = async (text: string) => {
    const t = text.trim(); if (!t) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true);
    try { await addNote(t); await refresh(); } finally { setBusy(false); }
  };
  const connectFlow = async (slug: string) => {
    if (!slug) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      const res: any = await connect(slug);
      if (res?.authUrl) await WebBrowser.openBrowserAsync(res.authUrl);
      for (let i = 0; i < 6; i++) {
        const cn = await getConnections();
        setServerConnected(cn);
        if (cn.includes(slug)) break;
        await new Promise((r2) => setTimeout(r2, 1500));
      }
    } catch (e) { /* ignore */ }
  };

  if (!loaded) {
    return <View style={[s.fill, s.center, { backgroundColor: c.bg }]}><Orb size={120} state="idle" /></View>;
  }

  const cards = feed?.cards || [];
  const pendingUrgent = cards.some((x) => x.type === "urgent" && x.status === "pending");
  const headerState: "idle" | "thinking" | "warm" = busy || thinking ? "thinking" : pendingUrgent ? "warm" : "idle";
  const locName = feed?.context?.location?.name;
  const status = feed?.context?.in_meeting ? "in a meeting" : (locName && locName !== "nearby" ? "near " + locName : "all quiet");
  const cardById = (id: string | null) => (id ? cards.find((x) => x.id === id) : undefined);
  const notes = (feed?.memories || []).filter((m) => m.source === "note");

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: c.bg }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Orb size={34} state={headerState} />
        <View style={{ flex: 1, marginLeft: sp.m }}>
          <Text style={s.brand}>Aura</Text>
          <Text style={s.status}>{status}</Text>
        </View>
        <Pressable onPress={() => setDemoOpen(true)} style={({ pressed }) => [s.demoBtn, pressed && s.pressed]} hitSlop={10}>
          <Text style={s.demoBtnTxt}>✦ demo</Text>
        </Pressable>
      </View>

      {tab === "chat" && (
        <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
          <ScrollView ref={scroller} style={s.fill} contentContainerStyle={{ padding: sp.xl, paddingBottom: sp.h }}>
            {(!feed?.messages || feed.messages.length === 0) && pending.length === 0 && <EmptyChat />}
            {feed?.messages?.map((m) => (
              <FadeInUp key={m.id}>
                <Bubble m={m} />
                {m.card_id && cardById(m.card_id) && <InlineCard card={cardById(m.card_id)!} onAct={act} busy={busy} />}
              </FadeInUp>
            ))}
            {pending.filter((p) => !(feed?.messages || []).some((m) => m.role === "user" && m.content === p.content)).map((p) => (
              <View key={p.id} style={[s.row, { justifyContent: "flex-end" }]}>
                <View style={[s.bubble, s.bubbleUser]}><Text style={s.bubbleTxt}>{p.content}</Text></View>
              </View>
            ))}
            {thinking && <ThinkingBubble />}
          </ScrollView>
          <View style={s.composer}>
            <TextInput style={s.input} value={draft} onChangeText={setDraft} placeholder="tell aura anything" placeholderTextColor={c.muted} multiline />
            <MicButton onResult={(t) => setDraft((d) => (d ? d + " " + t : t))} disabled={busy} />
            <Pressable onPress={send} style={({ pressed }) => [s.sendBtn, { opacity: draft.trim() ? 1 : 0.4 }, pressed && s.pressed]} disabled={!draft.trim()}>
              {busy ? <ActivityIndicator color={c.text} /> : <Feather name="arrow-up" size={20} color={c.text} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {tab === "notes" && <NotesView notes={notes} onAdd={addNoteFlow} busy={busy} />}
      {tab === "connect" && <ConnectView serverConnected={serverConnected} onConnect={connectFlow} />}

      <View style={s.tabs}>
        {([["chat", "message-circle", "chat"], ["notes", "edit-3", "notes"], ["connect", "grid", "connect"]] as const).map(([k, icon, l]) => (
          <Pressable key={k} onPress={() => { Haptics.selectionAsync().catch(() => {}); ease(); setTab(k as any); }} style={({ pressed }) => [s.tab, tab === k && s.tabActive, pressed && s.pressed]}>
            <Feather name={icon as any} size={19} color={tab === k ? c.text : c.muted} style={{ marginBottom: 3 }} />
            <Text style={[s.tabLabel, { color: tab === k ? c.text : c.muted }]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={demoOpen} transparent animationType="fade" onRequestClose={() => setDemoOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setDemoOpen(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>aura actions</Text>
            <Text style={s.sheetSub}>live, plus a few you can simulate</Text>
            <DemoBtn icon="inbox" label="check my inbox (live)" onPress={syncEmailFlow} />
            <DemoBtn icon="map-pin" label="walk past the bakery" onPress={() => runSim("near_bakery")} />
            <DemoBtn icon="mail" label="email arrives (you're in a meeting)" onPress={() => runSim("incoming_email")} />
            <DemoBtn icon="zap" label="urgent email arrives" onPress={() => runSim("incoming_email", { urgent: true })} />
            <DemoBtn icon="check-circle" label="your meeting ends" onPress={() => runSim("meeting_end")} />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

function Bubble({ m }: { m: Message }) {
  const mine = m.role === "user";
  return (
    <View style={[s.row, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
      <View style={[s.bubble, mine ? s.bubbleUser : s.bubbleAura]}>
        <Text style={[s.bubbleTxt, !mine && s.lower]}>{m.content}</Text>
      </View>
    </View>
  );
}

function ThinkingBubble() {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    const anims = dots.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 180),
      Animated.timing(v, { toValue: 1, duration: 340, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.3, duration: 340, useNativeDriver: true }),
      Animated.delay((2 - i) * 180),
    ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);
  return (
    <View style={[s.row, { justifyContent: "flex-start" }]}>
      <View style={[s.bubble, s.bubbleAura, { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 15 }]}>
        {dots.map((v, i) => (
          <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.muted, opacity: v, transform: [{ scale: v }] }} />
        ))}
      </View>
    </View>
  );
}

function InlineCard({ card, onAct, busy }: { card: Card; onAct: (c: Card, d: "approve" | "decline") => void; busy: boolean }) {
  const done = card.status === "done";
  const dismissed = card.status === "dismissed";
  const urgent = card.type === "urgent";
  if (dismissed) return null;
  return (
    <View style={[s.card, urgent && !done && s.cardUrgent]}>
      {!done && (card.memory_refs?.length || urgent) ? (
        <View style={s.chipRow}>
          {urgent && <View style={s.tag}><Text style={s.tagTxt}>urgent</Text></View>}
          {(card.memory_refs || []).slice(0, 2).map((mr, i) => (
            <View key={i} style={s.chip}><Text style={s.chipTxt}>🧠 {mr}</Text></View>
          ))}
        </View>
      ) : null}
      <Text style={s.cardTitle}>{card.title}</Text>
      <Text style={s.cardBody}>{card.body}</Text>
      {done ? (
        <View style={s.doneRow}><Feather name="check" size={15} color="#5BA37E" style={{ marginRight: 5 }} /><Text style={s.doneTxt}>done</Text></View>
      ) : (
        <View style={s.btnRow}>
          <Pressable style={({ pressed }) => [s.approve, pressed && s.pressed]} onPress={() => onAct(card, "approve")} disabled={busy}>
            <Text style={s.approveTxt}>approve</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.decline, pressed && s.pressed]} onPress={() => onAct(card, "decline")} disabled={busy}>
            <Text style={s.declineTxt}>not now</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function NotesView({ notes, onAdd, busy }: { notes: Memory[]; onAdd: (t: string) => void; busy: boolean }) {
  const [d, setD] = useState("");
  const submit = () => { if (!d.trim()) return; onAdd(d); setD(""); };
  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      <ScrollView style={s.fill} contentContainerStyle={{ padding: sp.xl, paddingBottom: sp.h }} keyboardShouldPersistTaps="handled">
        <Text style={s.notesTitle}>notes</Text>
        <View style={s.notePage}>
          <TextInput
            style={s.notePageInput}
            value={d}
            onChangeText={setD}
            placeholder={"start writing.\nanything you jot becomes memory aura can use."}
            placeholderTextColor={c.muted}
            multiline
            textAlignVertical="top"
          />
          <View style={s.notePageFooter}>
            <Text style={s.noteHint}>{d.trim() ? "saves to your memory" : "type or speak"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MicButton onResult={(t) => setD((p) => (p ? p + " " + t : t))} disabled={busy} size={40} />
              <Pressable onPress={submit} disabled={!d.trim()} style={({ pressed }) => [s.saveBtn, { opacity: d.trim() ? 1 : 0.4 }, pressed && s.pressed]}>
                {busy ? <ActivityIndicator color={c.bg} /> : <Text style={s.saveTxt}>save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
        {notes.length > 0 && <Text style={s.notesSection}>earlier</Text>}
        {notes.map((n) => (
          <FadeInUp key={n.id}>
            <View style={s.noteItem}>
              <View style={s.noteDot} />
              <Text style={s.noteItemTxt}>{n.text}</Text>
            </View>
          </FadeInUp>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ConnectView({ serverConnected, onConnect }: { serverConnected: string[]; onConnect: (slug: string) => void }) {
  return (
    <ScrollView style={s.fill} contentContainerStyle={{ padding: sp.xl, paddingBottom: sp.h, alignItems: "center" }}>
      <Orb size={128} state="idle" style={{ marginTop: sp.s, marginBottom: sp.l }} />
      <Text style={s.hero}>Aura</Text>
      <Text style={[s.lede, { textAlign: "center", marginBottom: sp.xl }]}>
        connect your world. aura quietly remembers, drafts, and handles the small stuff, and only interrupts you when it matters.
      </Text>
      {TOOLS.map((t) => {
        const on = !!t.slug && serverConnected.includes(t.slug);
        const connectable = !!t.slug;
        return (
          <Pressable key={t.key} style={({ pressed }) => [s.tool, pressed && connectable && s.pressed]} onPress={() => connectable && onConnect(t.slug)} disabled={!connectable || on}>
            <View style={s.toolTile}>{t.brand ? <BrandIcon brand={t.brand} size={22} /> : <Feather name={t.icon as any} size={18} color={c.text} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.toolLabel}>{t.label}</Text>
              <Text style={s.toolSub}>{t.sub}</Text>
            </View>
            <View style={[s.connectPill, on && s.connectPillOn]}>
              <Text style={[s.connectPillTxt, on && { color: c.text }]}>{on ? "connected" : connectable ? "connect" : "soon"}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const EmptyChat = () => (
  <View style={[s.center, { paddingTop: sp.xh }]}>
    <Orb size={132} state="idle" />
    <Text style={[s.h1, { marginTop: sp.xl }]}>hi, i'm aura.</Text>
    <Text style={[s.lede, { textAlign: "center", marginTop: sp.s }]}>
      tell me a thought, a plan, a person you care about. i'll remember, and bring it back the moment it's useful.
    </Text>
  </View>
);

const DemoBtn = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <Pressable style={({ pressed }) => [s.demoRow, pressed && s.pressed]} onPress={onPress}>
    <Feather name={icon as any} size={18} color={c.text} style={{ marginRight: 12 }} />
    <Text style={s.demoRowTxt}>{label}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.96 },
  lower: { textTransform: "lowercase" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: sp.xl, paddingTop: sp.s, paddingBottom: sp.m, borderBottomWidth: 1, borderBottomColor: c.hairline },
  brand: { fontFamily: font.display, fontSize: ty.h2, color: c.text, letterSpacing: -0.5 },
  status: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, marginTop: 1 },
  demoBtn: { paddingHorizontal: sp.m, paddingVertical: sp.s, borderRadius: r.chip, backgroundColor: c.surfaceAlt },
  demoBtnTxt: { fontFamily: font.medium, fontSize: ty.caption, color: c.muted },

  row: { flexDirection: "row", marginBottom: sp.m },
  bubble: { maxWidth: "82%", paddingHorizontal: sp.l, paddingVertical: sp.m, borderRadius: r.bubble },
  bubbleAura: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderBottomLeftRadius: 6 },
  bubbleUser: { backgroundColor: c.userBubble, borderBottomRightRadius: 6 },
  bubbleTxt: { fontFamily: font.body, fontSize: ty.body, lineHeight: 23, color: c.text },

  card: { backgroundColor: c.surface, borderRadius: r.card, borderWidth: 1, borderColor: c.hairline, padding: sp.l, marginBottom: sp.l, marginTop: -sp.xs, shadowColor: "#998", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  cardUrgent: { borderLeftWidth: 4, borderLeftColor: c.blush },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: sp.s },
  tag: { backgroundColor: c.blush, paddingHorizontal: sp.s, paddingVertical: 3, borderRadius: r.chip },
  tagTxt: { fontFamily: font.bold, fontSize: 10, color: c.text, letterSpacing: 0.6 },
  chip: { backgroundColor: c.chipBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: r.chip },
  chipTxt: { fontFamily: font.medium, fontSize: ty.caption, color: c.text, textTransform: "lowercase" },
  cardTitle: { fontFamily: font.display, fontSize: ty.title, color: c.text, letterSpacing: -0.3, marginBottom: 4, textTransform: "lowercase" },
  cardBody: { fontFamily: font.body, fontSize: ty.subhead, lineHeight: 21, color: c.muted, marginBottom: sp.m, textTransform: "lowercase" },
  btnRow: { flexDirection: "row", gap: sp.m },
  approve: { backgroundColor: c.text, paddingVertical: sp.m, paddingHorizontal: sp.xl, borderRadius: r.button, flex: 1, alignItems: "center" },
  approveTxt: { fontFamily: font.semibold, fontSize: ty.subhead, color: c.bg },
  decline: { paddingVertical: sp.m, paddingHorizontal: sp.l, borderRadius: r.button, borderWidth: 1, borderColor: c.hairline, alignItems: "center", justifyContent: "center" },
  declineTxt: { fontFamily: font.medium, fontSize: ty.subhead, color: c.muted },
  doneRow: { flexDirection: "row", alignItems: "center" },
  doneTxt: { fontFamily: font.semibold, fontSize: ty.subhead, color: "#5BA37E" },

  composer: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: sp.l, paddingVertical: sp.m, borderTopWidth: 1, borderTopColor: c.hairline, backgroundColor: c.bg, gap: sp.s },
  input: { flex: 1, maxHeight: 120, minHeight: 46, backgroundColor: c.surface, borderRadius: r.input, borderWidth: 1, borderColor: c.hairline, paddingHorizontal: sp.l, paddingTop: 12, paddingBottom: 12, fontFamily: font.body, fontSize: ty.body, color: c.text },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.lavender, alignItems: "center", justifyContent: "center" },
  sendTxt: { fontFamily: font.bold, fontSize: 20, color: c.text },

  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: c.hairline, paddingTop: sp.s, paddingBottom: sp.l, paddingHorizontal: sp.l, backgroundColor: c.bg },
  tab: { flex: 1, alignItems: "center", paddingVertical: sp.s, borderRadius: r.button },
  tabActive: { backgroundColor: c.surfaceAlt },
  tabGlyph: { fontSize: 18, marginBottom: 2 },
  tabLabel: { fontFamily: font.medium, fontSize: ty.micro },

  h1: { fontFamily: font.display, fontSize: ty.h1, color: c.text, letterSpacing: -0.6, textTransform: "lowercase" },
  hero: { fontFamily: font.display, fontSize: ty.hero, color: c.text, letterSpacing: -0.8, marginBottom: sp.s },
  lede: { fontFamily: font.body, fontSize: ty.subhead, lineHeight: 22, color: c.muted, marginTop: 4 },

  notesTitle: { fontFamily: font.display, fontSize: ty.hero, color: c.text, letterSpacing: -0.8, marginBottom: sp.l },
  notePage: { backgroundColor: c.surface, borderRadius: r.card, borderWidth: 1, borderColor: c.hairline, padding: sp.xl, minHeight: 210, shadowColor: "#998", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  notePageInput: { fontFamily: font.body, fontSize: 18, lineHeight: 28, color: c.text, minHeight: 130, padding: 0 },
  notePageFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: sp.l, borderTopWidth: 1, borderTopColor: c.hairline, paddingTop: sp.m },
  noteHint: { fontFamily: font.body, fontSize: ty.caption, color: c.muted },
  saveBtn: { backgroundColor: c.text, paddingHorizontal: sp.xl, paddingVertical: 11, borderRadius: r.button },
  saveTxt: { fontFamily: font.semibold, fontSize: ty.subhead, color: c.bg },
  notesSection: { fontFamily: font.medium, fontSize: ty.caption, color: c.muted, marginTop: sp.xxl, marginBottom: sp.xs, letterSpacing: 0.3 },
  noteItem: { flexDirection: "row", alignItems: "flex-start", gap: sp.m, paddingVertical: sp.m, paddingHorizontal: sp.xs },
  noteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.lavender, marginTop: 9 },
  noteItemTxt: { flex: 1, fontFamily: font.body, fontSize: ty.body, lineHeight: 24, color: c.text },

  tool: { flexDirection: "row", alignItems: "center", width: "100%", backgroundColor: c.surface, borderRadius: r.bubble, borderWidth: 1, borderColor: c.hairline, padding: sp.l, marginBottom: sp.m, gap: sp.m },
  toolTile: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline },
  toolLabel: { fontFamily: font.semibold, fontSize: ty.body, color: c.text },
  toolSub: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, marginTop: 1 },
  connectPill: { paddingHorizontal: sp.l, paddingVertical: sp.s, borderRadius: r.chip, borderWidth: 1, borderColor: c.text },
  connectPillOn: { backgroundColor: c.mint, borderColor: c.mint },
  connectPillTxt: { fontFamily: font.semibold, fontSize: ty.caption, color: c.text },

  modalBg: { flex: 1, backgroundColor: "rgba(20,16,12,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: r.sheet, borderTopRightRadius: r.sheet, padding: sp.xl, paddingBottom: sp.xh },
  sheetTitle: { fontFamily: font.display, fontSize: ty.h2, color: c.text, letterSpacing: -0.4, textTransform: "lowercase" },
  sheetSub: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, marginBottom: sp.l },
  demoRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderRadius: r.bubble, padding: sp.l, marginTop: sp.m },
  demoRowTxt: { fontFamily: font.medium, fontSize: ty.body, color: c.text },
});
