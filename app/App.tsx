import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Dimensions, Easing, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable,
  RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, UIManager, View,
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
import Onboarding from "./components/Onboarding";
import { c, font, layout, r, shadow, sp, type as ty } from "./theme";
import { addNote, agent, approve, Card, clearChat, closePromise, connect, Feed, getBrief, getConnections, getFeed, getGraph, getPlans, getSubscription, GraphPerson, loadSession, login, logout, Memory, Message, PromiseItem, setLocation, signup, simulate, subscribe, syncEmail } from "./lib/api";

const INPUT_LINE_H = 22;
const INPUT_MAX_H = 120;
const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESH = 100;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: false,
  } as any),
});

const STARTERS = [
  "Remember Sarah loves tulips",
  "What's on my calendar today?",
  "Check my inbox for anything urgent",
];

const TABS = [
  { key: "today" as const, icon: "sun", label: "Today" },
  { key: "chat" as const, icon: "message-circle", label: "Chat" },
  { key: "people" as const, icon: "users", label: "People" },
  { key: "notes" as const, icon: "edit-3", label: "Notes" },
  { key: "connect" as const, icon: "link", label: "Connect" },
];
const TOOLS = [
  { key: "gmail", slug: "gmail", brand: "gmail", label: "Gmail", icon: "mail", sub: "Drafts replies in your voice" },
  { key: "gcal", slug: "google-calendar", brand: "googlecalendar", label: "Calendar", icon: "calendar", sub: "Knows when you're free" },
  { key: "notion", slug: "notion", brand: "notion", label: "Notion", icon: "file-text", sub: "Your notes and docs" },
  { key: "slack", slug: "slack", brand: "slack", label: "Slack", icon: "slack", sub: "Catches what matters" },
  { key: "whatsapp", slug: "", brand: "whatsapp", label: "WhatsApp", icon: "message-circle", sub: "Messages and threads" },
  { key: "bank", slug: "", brand: "", label: "Bank and cards", icon: "credit-card", sub: "Pays, with your OK" },
];

function AuraApp({ onSignOut }: { onSignOut: () => void }) {
  const [loaded] = useFonts({
    Fraunces_600SemiBold, Fraunces_500Medium, Fraunces_400Regular_Italic,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const [feed, setFeed] = useState<Feed | null>(null);
  const [tab, setTab] = useState<"today" | "chat" | "people" | "notes" | "connect">("today");
  const [draft, setDraft] = useState("");
  const [inputH, setInputH] = useState(INPUT_LINE_H);
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [serverConnected, setServerConnected] = useState<string[]>([]);
  const [graph, setGraph] = useState<{ people: GraphPerson[]; promises: PromiseItem[] }>({ people: [], promises: [] });
  const [pending, setPending] = useState<{ id: string; content: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const sigRef = useRef("");
  const sendingRef = useRef(false);
  const seenMsg = useRef<Set<string>>(new Set());
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
      for (const m of f.messages || []) {
        if (m.kind === "reminder" && !seenMsg.current.has(m.id)) {
          if (!first.current) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            Notifications.scheduleNotificationAsync({ content: { title: "aura", body: m.content }, trigger: null }).catch(() => {});
          }
        }
        seenMsg.current.add(m.id);
      }
      first.current = false;
      const sig = `${(f.messages || []).length}:${(f.messages || []).slice(-1)[0]?.id || ""}:${(f.cards || []).map((x) => x.id + x.status + x.body).join(",")}:${(f.memories || []).length}:${f.context?.status || ""}`;
      if (sig !== sigRef.current) { sigRef.current = sig; ease(); setFeed(f); }
    } catch (e) { /* keep last good feed */ }
  }, []);

  const loadGraph = useCallback(async () => {
    try { setGraph(await getGraph()); } catch (e) {}
  }, []);

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
    refresh();
    getConnections().then(setServerConnected).catch(() => {});
    loadGraph();
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

  useEffect(() => { if (tab === "people") loadGraph(); }, [tab, loadGraph]);

  useEffect(() => {
    if (tab === "chat") setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 120);
  }, [feed?.messages?.length, tab]);

  useEffect(() => {
    if (!draft) setInputH(INPUT_LINE_H);
  }, [draft]);

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
    try { await agent(t); await refresh(); loadGraph(); }
    finally { sendingRef.current = false; setPending((p) => p.filter((x) => x.id !== tempId)); setThinking(false); setBusy(false); }
  };
  const homeCapture = async (text: string) => {
    const t = text.trim(); if (!t) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true);
    try { await agent(t, "home"); await refresh(); await loadGraph(); } finally { setBusy(false); }
  };
  const donePromise = async (text: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try { await closePromise(text); await loadGraph(); } catch (e) {}
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
  const clearChatFlow = () => {
    Alert.alert("Clear chat?", "This clears the conversation. Your memory stays.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setPending([]); setThinking(false);
        try { await clearChat(); } catch (e) {}
        seen.current.clear(); seenMsg.current.clear(); sigRef.current = "";
        ease(); refresh();
      } },
    ]);
  };

  const briefFlow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTab("chat"); setBusy(true); setThinking(true);
    try { await getBrief(); await refresh(); } finally { setThinking(false); setBusy(false); }
  };
  const signOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try { await logout(); } catch (e) {}
    onSignOut();
  };
  const onSubscribe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPayBusy(true); setPayErr("");
    try {
      const plans = await getPlans();
      const plan = plans.find((p) => /pro/i.test(p.name)) || plans[0];
      if (!plan) { setPayErr("billing is being set up, check back shortly."); return; }
      const res = await subscribe(plan.id);
      if (res.url) {
        await WebBrowser.openBrowserAsync(res.url);
        for (let i = 0; i < 8; i++) {
          const sub = await getSubscription();
          if (sub && (sub.status === "active" || sub.status === "trialing")) { await refresh(); setPayOpen(false); break; }
          await new Promise((r2) => setTimeout(r2, 1500));
        }
      } else setPayErr(res.error || "could not start checkout.");
    } finally { setPayBusy(false); }
  };

  if (!loaded) {
    return <View style={[s.fill, s.centered, { backgroundColor: c.bg }]}><Orb size={120} state="idle" /></View>;
  }

  const cards = feed?.cards || [];
  const pendingUrgent = cards.some((x) => x.type === "urgent" && x.status === "pending");
  const headerState: "idle" | "thinking" | "warm" = busy || thinking ? "thinking" : pendingUrgent ? "warm" : "idle";
  const locName = feed?.context?.location?.name;
  const status = feed?.context?.in_meeting
    ? "In a meeting"
    : locName && locName !== "nearby"
      ? `Near ${locName}`
      : "Watching quietly";
  const hasChat = (feed?.messages?.length || 0) > 0 || pending.length > 0;
  const cardById = (id: string | null) => (id ? cards.find((x) => x.id === id) : undefined);
  const notes = (feed?.memories || []).filter((m) => m.source === "note");
  const isPro = feed?.entitlement?.tier === "pro";

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: c.bg }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Orb size={32} state={headerState} />
        <View style={s.headerText}>
          <Text style={s.brand}>Aura</Text>
          <View style={s.statusRow}>
            <View style={[s.statusDot, { backgroundColor: headerState === "thinking" ? c.lavender : headerState === "warm" ? c.peach : c.mint }]} />
            <Text style={s.status}>{status}</Text>
          </View>
        </View>
        <View style={s.headerActions}>
          {tab === "chat" && hasChat ? (
            <Press onPress={clearChatFlow} style={s.iconBtn} hitSlop={8}>
              <Feather name="trash-2" size={18} color={c.muted} />
            </Press>
          ) : null}
          <Press onPress={() => setDemoOpen(true)} style={s.demoBtn} hitSlop={8}>
            <Feather name="play-circle" size={16} color={c.accent} />
            <Text style={s.demoBtnTxt}>Demo</Text>
          </Press>
        </View>
      </View>

      {tab === "today" && <HomeView promises={graph.promises} people={graph.people} busy={busy} onCapture={homeCapture} onDone={donePromise} onBrief={briefFlow} />}

      {tab === "chat" && (
        <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
          <ScrollView ref={scroller} style={s.fill} contentContainerStyle={s.pageScroll} keyboardShouldPersistTaps="handled">
            {(!feed?.messages || feed.messages.length === 0) && pending.length === 0 && (
              <EmptyChat onSuggest={setDraft} onDemo={() => setDemoOpen(true)} />
            )}
            {feed?.messages?.map((m) => (
              <FadeInUp key={m.id}>
                <Bubble m={m} />
                {m.card_id && cardById(m.card_id) ? (
                  <InlineCard card={cardById(m.card_id)!} onAct={act} busy={busy} />
                ) : null}
              </FadeInUp>
            ))}
            {pending.filter((p) => !(feed?.messages || []).some((m) => m.role === "user" && m.content === p.content)).map((p) => (
              <View key={p.id} style={s.msgRowUser}>
                <View style={[s.bubble, s.bubbleUser]}><Text style={s.bubbleTxt}>{p.content}</Text></View>
              </View>
            ))}
            {thinking ? <ThinkingBubble /> : null}
          </ScrollView>
          <View style={s.composer}>
            <View style={[s.inputShell, inputH > INPUT_LINE_H && s.inputShellTall]}>
              <TextInput
                style={[s.input, { height: Math.max(INPUT_LINE_H, inputH) }]}
                value={draft}
                onChangeText={setDraft}
                placeholder="Message Aura…"
                placeholderTextColor={c.muted}
                multiline
                scrollEnabled={inputH >= INPUT_MAX_H}
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  setInputH(Math.min(INPUT_MAX_H, Math.max(INPUT_LINE_H, h)));
                }}
              />
              <View style={s.inputActions}>
                <MicButton
                  variant="inline"
                  onResult={(t) => setDraft((d) => (d ? d + " " + t : t))}
                  disabled={busy}
                  size={32}
                />
                <Press onPress={send} style={[s.sendBtn, !draft.trim() && s.sendBtnOff]} disabled={!draft.trim() || busy}>
                  {busy ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Feather name="arrow-up" size={18} color={draft.trim() ? "#FFF" : c.muted} />
                  )}
                </Press>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {tab === "people" && <PeopleView people={graph.people} promises={graph.promises} onRefresh={loadGraph} isPro={isPro} onUpgrade={() => setPayOpen(true)} onBrief={briefFlow} onSignOut={signOut} />}
      {tab === "notes" && <NotesView notes={notes} onAdd={addNoteFlow} busy={busy} />}
      {tab === "connect" && <ConnectView serverConnected={serverConnected} onConnect={connectFlow} />}

      <View style={s.tabBar}>
        {TABS.map(({ key, icon, label }) => {
          const active = tab === key;
          return (
            <Press
              key={key}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); ease(); setTab(key); }}
              style={s.tab}
            >
              <Feather name={icon as any} size={20} color={active ? c.accent : c.muted} />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
              {active ? <View style={s.tabIndicator} /> : null}
            </Press>
          );
        })}
      </View>

      <Modal visible={demoOpen} transparent animationType="fade" onRequestClose={() => setDemoOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setDemoOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetGrabber} />
            <Text style={s.sheetTitle}>Try Aura</Text>
            <Text style={s.sheetSub}>Run a live action or simulate a scenario</Text>
            <DemoBtn icon="inbox" label="Check my inbox" sub="Live" onPress={syncEmailFlow} />
            <DemoBtn icon="map-pin" label="Walk past the bakery" onPress={() => runSim("near_bakery")} />
            <DemoBtn icon="mail" label="Email while in a meeting" onPress={() => runSim("incoming_email")} />
            <DemoBtn icon="zap" label="Urgent email arrives" onPress={() => runSim("incoming_email", { urgent: true })} />
            <DemoBtn icon="check-circle" label="Meeting ends" onPress={() => runSim("meeting_end")} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setPayOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetGrabber} />
            <View style={s.payHeader}>
              <Orb size={38} state="warm" />
              <Text style={s.payTitle}>Aura Pro</Text>
            </View>
            <Text style={s.payPrice}>$12<Text style={s.payPriceUnit}> / month</Text></Text>
            {["unlimited people and promises", "your proactive daily brief", "priority ai model", "early access to new powers"].map((f) => (
              <View key={f} style={s.payFeatureRow}>
                <View style={s.payCheck}><Feather name="check" size={13} color={c.accent} /></View>
                <Text style={s.payFeature}>{f}</Text>
              </View>
            ))}
            {payErr ? <Text style={s.payErr}>{payErr}</Text> : null}
            <Press style={s.payCta} onPress={onSubscribe} disabled={payBusy}>
              {payBusy ? <ActivityIndicator color="#FFF" /> : <Text style={s.payCtaTxt}>Start 7 day free trial</Text>}
            </Press>
            <Text style={s.payFine}>cancel anytime. billed monthly after the trial.</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={s.screenHeader}>
      <Text style={s.screenTitle}>{title}</Text>
      <Text style={s.screenSub}>{subtitle}</Text>
    </View>
  );
}

function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 400, delay, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }}>{children}</Animated.View>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// smooth spring press, the react native equivalent of a framer motion tap/hover.
function Press({ children, onPress, disabled, style, scaleTo = 0.96, hitSlop }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean; style?: any; scaleTo?: number; hitSlop?: number }) {
  const a = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(a, { toValue: v, useNativeDriver: true, friction: 7, tension: 140 }).start();
  return (
    <AnimatedPressable
      onPressIn={() => { if (!disabled) to(scaleTo); }}
      onPressOut={() => to(1)}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[style, { transform: [{ scale: a }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

function Bubble({ m }: { m: Message }) {
  const mine = m.role === "user";
  if (mine) {
    return (
      <View style={s.msgRowUser}>
        <View style={[s.bubble, s.bubbleUser]}>
          <Text style={s.bubbleTxt}>{m.content}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={s.msgRowAura}>
      <View style={[s.bubble, s.bubbleAura]}>
        <Text style={[s.bubbleTxt, s.auraVoice]}>{m.content}</Text>
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
    <View style={s.msgRowAura}>
      <View style={[s.bubble, s.bubbleAura, s.thinkingBubble]}>
        {dots.map((v, i) => (
          <Animated.View key={i} style={[s.thinkingDot, { opacity: v, transform: [{ scale: v }] }]} />
        ))}
      </View>
    </View>
  );
}

function InlineCard({ card, onAct, busy }: { card: Card; onAct: (c: Card, d: "approve" | "decline") => void; busy: boolean }) {
  const done = card.status === "done";
  const dismissed = card.status === "dismissed";
  const urgent = card.type === "urgent";
  const pan = useRef(new Animated.Value(0)).current;
  const [gone, setGone] = useState(false);
  const acting = useRef(false);
  const onActRef = useRef(onAct); onActRef.current = onAct;
  const cardRef = useRef(card); cardRef.current = card;
  const finish = (decision: "approve" | "decline", dir: number) => {
    if (acting.current) return;
    acting.current = true;
    Haptics.notificationAsync(decision === "approve" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Animated.timing(pan, { toValue: dir * (SCREEN_W + 80), duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setGone(true);
      onActRef.current(cardRef.current, decision);
    });
  };
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !acting.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3,
    onPanResponderMove: (_, g) => pan.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_THRESH) finish("approve", 1);
      else if (g.dx < -SWIPE_THRESH) finish("decline", -1);
      else Animated.spring(pan, { toValue: 0, useNativeDriver: true, friction: 6, tension: 140 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(pan, { toValue: 0, useNativeDriver: true, friction: 6, tension: 140 }).start(),
  })).current;

  if (dismissed || gone) return null;

  if (done) {
    return (
      <View style={s.card}>
        <Text style={s.cardTitle}>{card.title}</Text>
        <Text style={s.cardBody}>{card.body}</Text>
        <View style={s.doneRow}><Feather name="check" size={15} color={c.success} /><Text style={s.doneTxt}>Done</Text></View>
      </View>
    );
  }

  const rotate = pan.interpolate({ inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2], outputRange: ["-7deg", "0deg", "7deg"], extrapolate: "clamp" });
  const approveOp = pan.interpolate({ inputRange: [14, 96], outputRange: [0, 1], extrapolate: "clamp" });
  const nopeOp = pan.interpolate({ inputRange: [-96, -14], outputRange: [1, 0], extrapolate: "clamp" });
  return (
    <Animated.View style={[s.card, urgent && s.cardUrgent, { transform: [{ translateX: pan }, { rotate }] }]} {...responder.panHandlers}>
      <Animated.View pointerEvents="none" style={[s.stamp, s.stampApprove, { opacity: approveOp }]}><Text style={s.stampApproveTxt}>Approve</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[s.stamp, s.stampNope, { opacity: nopeOp }]}><Text style={s.stampNopeTxt}>Not now</Text></Animated.View>
      {(card.memory_refs?.length || urgent) ? (
        <View style={s.chipRow}>
          {urgent ? <View style={s.tag}><Text style={s.tagTxt}>Urgent</Text></View> : null}
          {(card.memory_refs || []).slice(0, 1).map((mr, i) => {
            const short = String(mr).split("\n")[0].replace(/^extra context:\s*/i, "").trim();
            return <View key={i} style={s.chip}><Text style={s.chipTxt} numberOfLines={1}>From memory · {short.length > 32 ? short.slice(0, 32) + "…" : short}</Text></View>;
          })}
        </View>
      ) : null}
      <Text style={s.cardTitle}>{card.title}</Text>
      <Text style={s.cardBody}>{card.body}</Text>
      <Text style={s.swipeHint}>Swipe right to approve · left to dismiss</Text>
      <View style={s.btnRow}>
        <Press style={s.approve} onPress={() => finish("approve", 1)} disabled={busy}>
          <Feather name="check" size={18} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={s.approveTxt}>Approve</Text>
        </Press>
        <Press style={s.decline} onPress={() => finish("decline", -1)} disabled={busy}>
          <Text style={s.declineTxt}>Not now</Text>
        </Press>
      </View>
    </Animated.View>
  );
}

function NotesView({ notes, onAdd, busy }: { notes: Memory[]; onAdd: (t: string) => void; busy: boolean }) {
  const [d, setD] = useState("");
  const submit = () => { if (!d.trim()) return; onAdd(d); setD(""); };
  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      <ScrollView style={s.fill} contentContainerStyle={s.pageScroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Notes" subtitle="Anything you save becomes memory Aura can recall later." />
        <View style={s.notePage}>
          <TextInput
            style={s.notePageInput}
            value={d}
            onChangeText={setD}
            placeholder="Write a note…"
            placeholderTextColor={c.muted}
            multiline
            textAlignVertical="top"
          />
          <View style={s.notePageFooter}>
            <Text style={s.noteHint}>{d.trim() ? "Tap Save to add to memory" : "Type or tap the mic"}</Text>
            <View style={s.noteActions}>
              <MicButton onResult={(t) => setD((p) => (p ? p + " " + t : t))} disabled={busy} size={layout.controlSm} />
              <Press onPress={submit} disabled={!d.trim()} style={[s.saveBtn, !d.trim() && s.sendBtnOff]}>
                {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.saveTxt}>Save</Text>}
              </Press>
            </View>
          </View>
        </View>
        {notes.length > 0 ? <Text style={s.sectionLabel}>Saved notes</Text> : null}
        {notes.map((n) => (
          <FadeInUp key={n.id}>
            <View style={s.noteItem}>
              <Text style={s.noteItemTxt}>{n.text}</Text>
            </View>
          </FadeInUp>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ConnectView({ serverConnected, onConnect }: { serverConnected: string[]; onConnect: (slug: string) => void }) {
  const connected = TOOLS.filter((t) => t.slug && serverConnected.includes(t.slug)).length;
  return (
    <ScrollView style={s.fill} contentContainerStyle={s.pageScroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Connect" subtitle="Link your apps so Aura can read context and act on your behalf." />
      <View style={s.connectSummary}>
        <Text style={s.connectSummaryTxt}>{connected} of {TOOLS.filter((t) => t.slug).length} connected</Text>
      </View>
      {TOOLS.map((t) => {
        const on = !!t.slug && serverConnected.includes(t.slug);
        const connectable = !!t.slug;
        return (
          <Press key={t.key} style={[s.tool, on && s.toolConnected, !connectable && s.toolDisabled]} onPress={() => connectable && !on && onConnect(t.slug)} disabled={!connectable || on}>
            <View style={s.toolTile}>{t.brand ? <BrandIcon brand={t.brand} size={22} /> : <Feather name={t.icon as any} size={18} color={c.text} />}</View>
            <View style={s.toolBody}>
              <Text style={s.toolLabel}>{t.label}</Text>
              <Text style={s.toolSub}>{t.sub}</Text>
            </View>
            <View style={[s.connectPill, on ? s.connectPillOn : !connectable ? s.connectPillSoon : null]}>
              {on ? <Feather name="check" size={14} color={c.success} style={{ marginRight: 4 }} /> : null}
              <Text style={[s.connectPillTxt, on ? s.connectPillTxtOn : !connectable ? s.connectPillTxtMuted : s.connectPillTxtAction]}>
                {on ? "Connected" : connectable ? "Connect" : "Soon"}
              </Text>
            </View>
          </Press>
        );
      })}
    </ScrollView>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "good morning";
  if (h < 18) return "good afternoon";
  return "good evening";
}
const MM = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function dueMeta(due: string | null): { label: string; tone: "over" | "soon" | "later"; rank: number } | null {
  if (!due) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
  if (!m) return { label: due, tone: "later", rank: 9000 };
  const d = new Date(+m[1], +m[2] - 1, +m[3]); d.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  const nice = `${MM[+m[2] - 1]} ${+m[3]}`;
  if (days < 0) return { label: "overdue", tone: "over", rank: days };
  if (days === 0) return { label: "today", tone: "over", rank: 0 };
  if (days === 1) return { label: "tomorrow", tone: "soon", rank: 1 };
  if (days <= 4) return { label: `in ${days} days`, tone: "soon", rank: days };
  return { label: nice, tone: "later", rank: days };
}

function HomeView({ promises, people, busy, onCapture, onDone, onBrief }: { promises: PromiseItem[]; people: GraphPerson[]; busy: boolean; onCapture: (t: string) => void; onDone: (text: string) => void; onBrief: () => void }) {
  const [q, setQ] = useState("");
  const submit = () => { if (!q.trim()) return; onCapture(q); setQ(""); };
  const nudges = promises
    .map((p) => ({ p, meta: dueMeta(p.due) }))
    .sort((a, b) => (a.meta?.rank ?? 9999) - (b.meta?.rank ?? 9999))
    .slice(0, 6);
  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      <ScrollView style={s.fill} contentContainerStyle={s.pageScroll} keyboardShouldPersistTaps="handled">
        <View style={s.homeHead}>
          <Text style={s.homeGreet}>{greeting()}.</Text>
          <Text style={s.homeSub}>{promises.length ? "here's who needs you today." : `you're keeping track of ${people.length} ${people.length === 1 ? "person" : "people"}.`}</Text>
        </View>

        <View style={s.homeCapture}>
          <TextInput style={s.homeCaptureInput} value={q} onChangeText={setQ} placeholder="tell aura anything, a person, a promise, a plan…" placeholderTextColor={c.muted} multiline />
          <View style={s.homeCaptureRow}>
            <MicButton onResult={(t) => setQ((d) => (d ? d + " " + t : t))} disabled={busy} size={layout.controlSm} />
            <Press onPress={submit} disabled={!q.trim() || busy} style={[s.homeCaptureBtn, !q.trim() && s.sendBtnOff]}>
              {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Feather name="arrow-up" size={18} color={q.trim() ? "#FFF" : c.muted} />}
            </Press>
          </View>
        </View>

        {nudges.length ? (
          <>
            <View style={s.homeSectionRow}>
              <Text style={s.sectionLabel}>Who needs you</Text>
              <Press onPress={onBrief} hitSlop={8}><Text style={s.homeBriefLink}>daily brief</Text></Press>
            </View>
            {nudges.map(({ p, meta }, i) => (
              <FadeInUp key={i}>
                <View style={s.nudge}>
                  <View style={s.nudgeAvatar}><Text style={s.nudgeInitial}>{(p.person || "?").trim().charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.nudgeTitle}>{p.direction === "owed_to_me" ? `${p.person || "someone"} owes you` : `for ${p.person || "someone"}`}</Text>
                    <Text style={s.nudgeBody}>{p.text}</Text>
                    {meta ? (
                      <View style={[s.nudgeChip, meta.tone === "over" && s.nudgeChipOver, meta.tone === "soon" && s.nudgeChipSoon]}>
                        <Text style={[s.nudgeChipTxt, meta.tone === "over" && s.nudgeChipTxtOver, meta.tone === "soon" && s.nudgeChipTxtSoon]}>{meta.label}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Press onPress={() => onDone(p.text)} hitSlop={8} style={s.nudgeDone}><Feather name="check" size={18} color={c.success} /></Press>
                </View>
              </FadeInUp>
            ))}
          </>
        ) : (
          <View style={s.homeEmpty}>
            <Orb size={64} state="idle" />
            <Text style={s.homeEmptyTxt}>nothing needs you right now. tell me about someone you met, or a promise you made, and i'll keep watch.</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PeopleView({ people, promises, onRefresh, isPro, onUpgrade, onBrief, onSignOut }: { people: GraphPerson[]; promises: PromiseItem[]; onRefresh: () => Promise<void> | void; isPro: boolean; onUpgrade: () => void; onBrief: () => void; onSignOut: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } };
  return (
    <ScrollView
      style={s.fill}
      contentContainerStyle={s.pageScroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={c.accent} />}
    >
      <ScreenHeader title="People" subtitle="Everyone you've told Aura about, and the promises between you. This is your relationship graph." />
      {isPro ? (
        <View style={s.proChip}><Feather name="star" size={13} color={c.accent} /><Text style={s.proChipTxt}>Aura Pro</Text></View>
      ) : (
        <Press style={s.upsell} onPress={onUpgrade}>
          <View style={{ flex: 1 }}>
            <Text style={s.upsellTitle}>Unlock Aura Pro</Text>
            <Text style={s.upsellSub}>your daily brief, unlimited people, and priority ai.</Text>
          </View>
          <View style={s.upsellCta}><Text style={s.upsellCtaTxt}>$12/mo</Text></View>
        </Press>
      )}
      <Press style={s.briefBtn} onPress={onBrief}>
        <Feather name="sun" size={17} color="#FFF" />
        <Text style={s.briefBtnTxt}>Daily brief</Text>
      </Press>
      {promises.length > 0 ? (
        <View style={{ marginBottom: sp.l }}>
          <Text style={s.sectionLabel}>Open promises</Text>
          {promises.map((p, i) => (
            <FadeInUp key={i}>
              <View style={s.promiseItem}>
                <View style={s.promiseDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.promiseTxt}>{p.text}</Text>
                  <Text style={s.promiseMeta}>
                    {p.direction === "owed_to_me" ? "owed to you" : "you owe"}{p.person ? ` · ${p.person}` : ""}{p.due ? ` · by ${p.due}` : ""}
                  </Text>
                </View>
              </View>
            </FadeInUp>
          ))}
        </View>
      ) : null}
      <Text style={s.sectionLabel}>Your people</Text>
      {people.length === 0 ? (
        <View style={s.peopleEmpty}>
          <Feather name="users" size={26} color={c.muted} />
          <Text style={s.peopleEmptyTxt}>Tell Aura about someone you met, like "just met alex, runs a design studio, into film", and they'll show up here.</Text>
        </View>
      ) : (
        people.map((p) => (
          <FadeInUp key={p.person}>
            <View style={s.personCard}>
              <View style={s.personAvatar}><Text style={s.personInitial}>{(p.person || "?").trim().charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.personName}>{p.person}</Text>
                {p.org ? <Text style={s.personOrg}>{p.org}</Text> : null}
                {p.topics && p.topics.filter(Boolean).length ? (
                  <View style={s.topicRow}>
                    {p.topics.filter(Boolean).map((t) => (
                      <View key={t} style={s.topicChip}><Text style={s.topicChipTxt}>{t}</Text></View>
                    ))}
                  </View>
                ) : null}
                {p.open_promises && p.open_promises.filter(Boolean).length ? (
                  <View style={s.personPromises}>
                    {p.open_promises.filter(Boolean).map((op, j) => (
                      <View key={j} style={s.personPromiseRow}>
                        <Feather name="corner-down-right" size={12} color={c.accent} />
                        <Text style={s.personPromiseTxt}>{op}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </FadeInUp>
        ))
      )}
      <Press style={s.signOut} onPress={onSignOut} hitSlop={8}>
        <Feather name="log-out" size={15} color={c.muted} />
        <Text style={s.signOutTxt}>Sign out</Text>
      </Press>
    </ScrollView>
  );
}

const EmptyChat = ({ onSuggest, onDemo }: { onSuggest: (t: string) => void; onDemo: () => void }) => (
  <View style={s.empty}>
    <Text style={s.emptyTitle}>What should I remember?</Text>
    <Text style={s.emptySub}>Tell me a thought, plan, or person — I'll bring it back when it matters.</Text>
    <View style={s.starterList}>
      {STARTERS.map((t) => (
        <Press key={t} style={s.starter} onPress={() => onSuggest(t)}>
          <Text style={s.starterTxt}>{t}</Text>
          <Feather name="arrow-up-right" size={16} color={c.muted} />
        </Press>
      ))}
    </View>
    <Press style={s.emptyDemo} onPress={onDemo}>
      <Feather name="play-circle" size={18} color={c.accent} />
      <Text style={s.emptyDemoTxt}>Run a demo scenario</Text>
    </Press>
  </View>
);

const DemoBtn = ({ icon, label, sub, onPress }: { icon: string; label: string; sub?: string; onPress: () => void }) => (
  <Press style={s.demoRow} onPress={onPress}>
    <View style={s.demoRowIcon}>
      <Feather name={icon as any} size={17} color={c.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.demoRowTxt}>{label}</Text>
      {sub ? <Text style={s.demoRowSub}>{sub}</Text> : null}
    </View>
    <Feather name="chevron-right" size={18} color={c.muted} />
  </Press>
);

const s = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  pageScroll: { paddingHorizontal: layout.page, paddingTop: sp.l, paddingBottom: sp.xxl },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.page,
    paddingVertical: sp.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
    backgroundColor: c.bg,
  },
  headerText: { flex: 1, marginLeft: sp.m, justifyContent: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: sp.s },
  brand: { fontFamily: font.display, fontSize: ty.h2, color: c.text, letterSpacing: -0.4, lineHeight: 24 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, lineHeight: 18 },
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: sp.m,
    height: layout.controlSm,
    borderRadius: r.button,
    backgroundColor: c.accentSoft,
  },
  demoBtnTxt: { fontFamily: font.semibold, fontSize: ty.caption, color: c.accent },
  iconBtn: {
    width: layout.controlSm,
    height: layout.controlSm,
    borderRadius: layout.controlSm / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceAlt,
  },

  screenHeader: { marginBottom: sp.l },
  screenTitle: { fontFamily: font.display, fontSize: ty.hero, color: c.text, letterSpacing: -0.5, lineHeight: 36 },
  screenSub: { fontFamily: font.body, fontSize: ty.subhead, color: c.muted, lineHeight: 22, marginTop: 4 },

  msgRowUser: { flexDirection: "row", justifyContent: "flex-end", marginBottom: sp.m, width: "100%" },
  msgRowAura: { width: "100%", marginBottom: sp.m },
  bubble: { width: "100%", paddingHorizontal: sp.m + 2, paddingVertical: sp.m, borderRadius: r.bubble },
  bubbleAura: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, borderBottomLeftRadius: r.bubbleTail },
  bubbleUser: { backgroundColor: c.userBubble, borderBottomRightRadius: r.bubbleTail, maxWidth: "85%", width: "auto" },
  bubbleTxt: { fontFamily: font.body, fontSize: ty.body, lineHeight: 22, color: c.text },
  auraVoice: { textTransform: "lowercase" },
  thinkingBubble: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: sp.m + 2, width: "auto", alignSelf: "flex-start" },
  thinkingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.muted },

  card: {
    width: "100%",
    backgroundColor: c.surface,
    borderRadius: r.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    padding: sp.l,
    marginBottom: sp.m,
    ...shadow.card,
  },
  cardUrgent: { borderColor: c.urgentBorder, backgroundColor: c.urgentBg },
  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: sp.m },
  tag: { backgroundColor: c.blush, paddingHorizontal: sp.s, paddingVertical: 3, borderRadius: r.chip },
  tagTxt: { fontFamily: font.bold, fontSize: ty.micro, color: c.text, letterSpacing: 0.3 },
  chip: { backgroundColor: c.chipBg, paddingHorizontal: sp.s, paddingVertical: 3, borderRadius: r.chip, maxWidth: "100%" },
  chipTxt: { fontFamily: font.medium, fontSize: ty.micro, color: c.muted },
  cardTitle: { fontFamily: font.semibold, fontSize: ty.title, color: c.text, lineHeight: 24, marginBottom: 4 },
  cardBody: { fontFamily: font.body, fontSize: ty.subhead, lineHeight: 22, color: c.muted, marginBottom: sp.m },
  swipeHint: { fontFamily: font.medium, fontSize: ty.micro, color: c.muted, marginBottom: sp.m, textAlign: "center" },
  btnRow: { flexDirection: "row", gap: sp.s },
  approve: {
    flex: 1,
    height: layout.control,
    borderRadius: r.button,
    backgroundColor: c.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  approveTxt: { fontFamily: font.semibold, fontSize: ty.subhead, color: "#FFF" },
  decline: {
    height: layout.control,
    paddingHorizontal: sp.l,
    borderRadius: r.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  declineTxt: { fontFamily: font.medium, fontSize: ty.subhead, color: c.muted },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  doneTxt: { fontFamily: font.semibold, fontSize: ty.subhead, color: c.success },
  stamp: { position: "absolute", top: 12, zIndex: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 2, backgroundColor: "rgba(255,253,250,0.95)" },
  stampApprove: { left: 12, borderColor: c.success, transform: [{ rotate: "-12deg" }] },
  stampNope: { right: 12, borderColor: c.danger, transform: [{ rotate: "12deg" }] },
  stampApproveTxt: { fontFamily: font.bold, fontSize: 13, color: c.success },
  stampNopeTxt: { fontFamily: font.bold, fontSize: 13, color: c.danger },

  composer: {
    paddingHorizontal: layout.page,
    paddingVertical: sp.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
    backgroundColor: c.bg,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    paddingLeft: sp.m + 2,
    paddingRight: 6,
    paddingVertical: 4,
  },
  inputShellTall: { alignItems: "flex-end", paddingBottom: 6, paddingTop: 8 },
  input: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 6 : 4,
    paddingBottom: Platform.OS === "ios" ? 6 : 4,
    paddingRight: sp.s,
    fontFamily: font.body,
    fontSize: ty.body,
    color: c.text,
    lineHeight: 22,
    textAlignVertical: "center",
  },
  inputActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: c.surfaceAlt, opacity: 1 },

  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
    backgroundColor: c.surface,
    paddingBottom: sp.s,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: sp.m, position: "relative" },
  tabLabel: { fontFamily: font.medium, fontSize: ty.micro, color: c.muted, marginTop: 3 },
  tabLabelActive: { fontFamily: font.semibold, color: c.accent },
  tabIndicator: { position: "absolute", top: 0, width: 32, height: 2, borderRadius: 1, backgroundColor: c.accent },

  empty: { paddingTop: sp.xl, paddingBottom: sp.l },
  emptyTitle: { fontFamily: font.display, fontSize: ty.h1, color: c.text, letterSpacing: -0.5, lineHeight: 32 },
  emptySub: { fontFamily: font.body, fontSize: ty.subhead, color: c.muted, lineHeight: 22, marginTop: sp.s, marginBottom: sp.l },
  starterList: { gap: sp.s, marginBottom: sp.l },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    borderRadius: r.button,
    paddingHorizontal: sp.m + 2,
    paddingVertical: sp.m + 2,
  },
  starterTxt: { flex: 1, fontFamily: font.medium, fontSize: ty.subhead, color: c.text, lineHeight: 20, paddingRight: sp.s },
  emptyDemo: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp.s, paddingVertical: sp.m },
  emptyDemoTxt: { fontFamily: font.semibold, fontSize: ty.subhead, color: c.accent },

  notePage: {
    backgroundColor: c.surface,
    borderRadius: r.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    padding: sp.l,
    minHeight: 180,
    ...shadow.soft,
  },
  notePageInput: { fontFamily: font.body, fontSize: ty.body, lineHeight: 24, color: c.text, minHeight: 120, padding: 0 },
  notePageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: sp.m,
    paddingTop: sp.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  noteHint: { flex: 1, fontFamily: font.body, fontSize: ty.caption, color: c.muted, paddingRight: sp.s },
  noteActions: { flexDirection: "row", alignItems: "center", gap: sp.s },
  saveBtn: {
    height: layout.controlSm,
    paddingHorizontal: sp.l,
    borderRadius: r.button,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveTxt: { fontFamily: font.semibold, fontSize: ty.subhead, color: "#FFF" },
  sectionLabel: { fontFamily: font.semibold, fontSize: ty.caption, color: c.muted, marginTop: sp.xl, marginBottom: sp.s, letterSpacing: 0.5 },
  noteItem: {
    backgroundColor: c.surface,
    borderRadius: r.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    padding: sp.m + 2,
    marginBottom: sp.s,
  },
  noteItemTxt: { fontFamily: font.body, fontSize: ty.body, lineHeight: 24, color: c.text },

  connectSummary: {
    alignSelf: "flex-start",
    backgroundColor: c.accentSoft,
    paddingHorizontal: sp.m,
    paddingVertical: 6,
    borderRadius: r.chip,
    marginBottom: sp.l,
  },
  connectSummaryTxt: { fontFamily: font.semibold, fontSize: ty.caption, color: c.accent },
  tool: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: r.tool,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    padding: sp.m + 2,
    marginBottom: sp.s,
  },
  toolConnected: { backgroundColor: c.successSoft, borderColor: "rgba(74, 148, 104, 0.25)" },
  toolDisabled: { opacity: 0.72 },
  toolTile: {
    width: 44,
    height: 44,
    borderRadius: r.toolTile,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    marginRight: sp.m,
  },
  toolBody: { flex: 1, paddingRight: sp.s },
  toolLabel: { fontFamily: font.semibold, fontSize: ty.body, color: c.text, lineHeight: 22 },
  toolSub: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, lineHeight: 18, marginTop: 1 },
  connectPill: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 96,
    justifyContent: "center",
    paddingHorizontal: sp.m,
    paddingVertical: 7,
    borderRadius: r.chip,
    backgroundColor: c.accent,
  },
  connectPillOn: { backgroundColor: c.successSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(74, 148, 104, 0.3)" },
  connectPillSoon: { backgroundColor: c.surfaceAlt },
  connectPillTxt: { fontFamily: font.semibold, fontSize: ty.caption },
  connectPillTxtOn: { color: c.success },
  connectPillTxtAction: { color: "#FFF" },
  connectPillTxtMuted: { color: c.muted },

  modalBg: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.bg,
    borderTopLeftRadius: r.sheet,
    borderTopRightRadius: r.sheet,
    paddingHorizontal: layout.page,
    paddingTop: sp.m,
    paddingBottom: sp.xh,
  },
  sheetGrabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.hairline, alignSelf: "center", marginBottom: sp.l },
  sheetTitle: { fontFamily: font.display, fontSize: ty.h2, color: c.text, letterSpacing: -0.3 },
  sheetSub: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, marginTop: 4, marginBottom: sp.m },
  demoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    borderRadius: r.button,
    padding: sp.m + 2,
    marginTop: sp.s,
    gap: sp.m,
  },
  demoRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accentSoft,
  },
  demoRowTxt: { fontFamily: font.semibold, fontSize: ty.body, color: c.text, lineHeight: 20 },
  demoRowSub: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, marginTop: 2 },

  promiseItem: { flexDirection: "row", alignItems: "flex-start", gap: sp.s, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, borderRadius: r.button, padding: sp.m + 2, marginBottom: sp.s },
  promiseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, marginTop: 6 },
  promiseTxt: { fontFamily: font.medium, fontSize: ty.subhead, color: c.text, lineHeight: 21 },
  promiseMeta: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, marginTop: 2 },
  peopleEmpty: { alignItems: "center", gap: sp.m, paddingVertical: sp.xl, paddingHorizontal: sp.l },
  peopleEmptyTxt: { fontFamily: font.body, fontSize: ty.subhead, color: c.muted, textAlign: "center", lineHeight: 22 },
  personCard: { flexDirection: "row", alignItems: "flex-start", gap: sp.m, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, borderRadius: r.card, padding: sp.l, marginBottom: sp.s, ...shadow.soft },
  personAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" },
  personInitial: { fontFamily: font.display, fontSize: 20, color: c.accent },
  personName: { fontFamily: font.semibold, fontSize: ty.body, color: c.text, lineHeight: 22 },
  personOrg: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, marginTop: 1 },
  topicRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: sp.s },
  topicChip: { backgroundColor: c.chipBg, paddingHorizontal: sp.s, paddingVertical: 3, borderRadius: r.chip },
  topicChipTxt: { fontFamily: font.medium, fontSize: ty.micro, color: c.muted },
  personPromises: { marginTop: sp.s, gap: 3 },
  personPromiseRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  personPromiseTxt: { flex: 1, fontFamily: font.body, fontSize: ty.caption, color: c.text, lineHeight: 18 },

  upsell: { flexDirection: "row", alignItems: "center", gap: sp.m, backgroundColor: c.accentSoft, borderRadius: r.card, padding: sp.l, marginBottom: sp.l },
  upsellTitle: { fontFamily: font.semibold, fontSize: ty.body, color: c.accent },
  upsellSub: { fontFamily: font.body, fontSize: ty.caption, color: c.accent, opacity: 0.85, marginTop: 2, lineHeight: 18 },
  upsellCta: { backgroundColor: c.accent, paddingHorizontal: sp.m, paddingVertical: 7, borderRadius: r.chip },
  upsellCtaTxt: { fontFamily: font.semibold, fontSize: ty.caption, color: "#FFF" },
  proChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: c.accentSoft, paddingHorizontal: sp.m, paddingVertical: 6, borderRadius: r.chip, marginBottom: sp.l },
  proChipTxt: { fontFamily: font.semibold, fontSize: ty.caption, color: c.accent },
  briefBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp.s, height: layout.control, borderRadius: r.button, backgroundColor: c.accent, marginBottom: sp.l },
  briefBtnTxt: { fontFamily: font.semibold, fontSize: ty.body, color: "#FFF" },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: sp.l, marginTop: sp.s },
  signOutTxt: { fontFamily: font.medium, fontSize: ty.subhead, color: c.muted },

  homeHead: { marginBottom: sp.l },
  homeGreet: { fontFamily: font.display, fontSize: ty.hero, color: c.text, letterSpacing: -0.5, lineHeight: 36 },
  homeSub: { fontFamily: font.body, fontSize: ty.subhead, color: c.muted, lineHeight: 22, marginTop: 4 },
  homeCapture: { backgroundColor: c.surface, borderRadius: r.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, padding: sp.m + 2, marginBottom: sp.l, ...shadow.soft },
  homeCaptureInput: { fontFamily: font.body, fontSize: ty.body, lineHeight: 22, color: c.text, minHeight: 44, padding: 0 },
  homeCaptureRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: sp.s, marginTop: sp.s },
  homeCaptureBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  homeSectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  homeBriefLink: { fontFamily: font.semibold, fontSize: ty.caption, color: c.accent },
  nudge: { flexDirection: "row", alignItems: "center", gap: sp.m, backgroundColor: c.surface, borderRadius: r.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, padding: sp.m + 2, marginBottom: sp.s, ...shadow.soft },
  nudgeAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" },
  nudgeInitial: { fontFamily: font.display, fontSize: 18, color: c.accent },
  nudgeTitle: { fontFamily: font.medium, fontSize: ty.caption, color: c.muted, lineHeight: 16 },
  nudgeBody: { fontFamily: font.semibold, fontSize: ty.subhead, color: c.text, lineHeight: 20, marginTop: 1 },
  nudgeChip: { alignSelf: "flex-start", backgroundColor: c.chipBg, paddingHorizontal: sp.s, paddingVertical: 2, borderRadius: r.chip, marginTop: 6 },
  nudgeChipOver: { backgroundColor: "rgba(201,110,104,0.14)" },
  nudgeChipSoon: { backgroundColor: c.accentSoft },
  nudgeChipTxt: { fontFamily: font.semibold, fontSize: ty.micro, color: c.muted, letterSpacing: 0.2 },
  nudgeChipTxtOver: { color: "#C96E68" },
  nudgeChipTxtSoon: { color: c.accent },
  nudgeDone: { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" },
  homeEmpty: { alignItems: "center", gap: sp.m, paddingVertical: sp.xl, paddingHorizontal: sp.l },
  homeEmptyTxt: { fontFamily: font.body, fontSize: ty.subhead, color: c.muted, textAlign: "center", lineHeight: 22 },

  payHeader: { flexDirection: "row", alignItems: "center", gap: sp.s, marginBottom: sp.s },
  payTitle: { fontFamily: font.display, fontSize: ty.h1, color: c.text, letterSpacing: -0.4 },
  payPrice: { fontFamily: font.display, fontSize: 34, color: c.text, letterSpacing: -0.6, marginBottom: sp.m },
  payPriceUnit: { fontFamily: font.body, fontSize: ty.subhead, color: c.muted },
  payFeatureRow: { flexDirection: "row", alignItems: "center", gap: sp.s, marginBottom: sp.s },
  payCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" },
  payFeature: { fontFamily: font.medium, fontSize: ty.subhead, color: c.text },
  payCta: { height: layout.control, borderRadius: r.button, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", marginTop: sp.m },
  payCtaTxt: { fontFamily: font.semibold, fontSize: ty.body, color: "#FFF" },
  payErr: { fontFamily: font.medium, fontSize: ty.caption, color: c.danger, marginTop: sp.s },
  payFine: { fontFamily: font.body, fontSize: ty.caption, color: c.muted, textAlign: "center", marginTop: sp.s },
});

const authInputStyle: any = { backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderRadius: 14, paddingHorizontal: 16, height: 54, fontFamily: font.body, fontSize: 16, color: c.text, marginBottom: 12 };

function AuthGate({ onAuthed }: { onAuthed: (isNew: boolean) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!email.trim() || !pw) { setErr("enter your email and password."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true); setErr("");
    const res = mode === "login" ? await login(email, pw) : await signup(email, pw, name);
    setBusy(false);
    if (res.ok) onAuthed(mode === "signup"); else setErr(res.error || "something went wrong.");
  };
  return (
    <SafeAreaView style={[s.fill, { backgroundColor: c.bg }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 28 }}>
          <View style={{ alignItems: "center", marginBottom: 30 }}>
            <Orb size={92} state="idle" />
            <Text style={{ fontFamily: font.display, fontSize: 40, color: c.text, letterSpacing: -0.8, marginTop: 16 }}>Aura</Text>
            <Text style={{ fontFamily: font.body, fontSize: 15, lineHeight: 22, color: c.muted, textAlign: "center", marginTop: 6 }}>the personal ai that remembers what matters.</Text>
          </View>
          {mode === "signup" ? (
            <TextInput style={authInputStyle} value={name} onChangeText={setName} placeholder="your name" placeholderTextColor={c.muted} autoCapitalize="words" />
          ) : null}
          <TextInput style={authInputStyle} value={email} onChangeText={setEmail} placeholder="email" placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
          <TextInput style={authInputStyle} value={pw} onChangeText={setPw} placeholder="password" placeholderTextColor={c.muted} secureTextEntry />
          {err ? <Text style={{ color: "#C96E68", fontFamily: font.medium, fontSize: 13, marginBottom: 8, marginLeft: 4 }}>{err}</Text> : null}
          <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [{ backgroundColor: c.accent, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 }, pressed && { opacity: 0.9 }]}>
            {busy ? <ActivityIndicator color={c.bg} /> : <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.bg }}>{mode === "login" ? "log in" : "create account"}</Text>}
          </Pressable>
          <Pressable onPress={() => { setErr(""); setMode(mode === "login" ? "signup" : "login"); }} hitSlop={10} style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.muted }}>{mode === "login" ? "new here? create an account" : "have an account? log in"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function Root() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => { loadSession().then((ok) => setAuthed(ok)).catch(() => setAuthed(false)); }, []);
  if (authed === null) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}><Orb size={110} state="idle" /></View>;
  if (!authed) return <AuthGate onAuthed={(isNew) => { setOnboarding(isNew); setAuthed(true); }} />;
  if (onboarding) return <Onboarding onDone={() => setOnboarding(false)} />;
  return <AuraApp onSignOut={() => { setOnboarding(false); setAuthed(false); }} />;
}
