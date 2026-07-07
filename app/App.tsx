import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, AppState, Dimensions, Easing, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable,
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
import { Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";
import { Feather } from "@expo/vector-icons";
import Orb from "./components/Orb";
import BrandIcon from "./components/BrandIcon";
import MicButton from "./components/MicButton";
import Onboarding from "./components/Onboarding";
import { c, font, grad, layout, r, shadow, sp, type as ty } from "./theme";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Line } from "react-native-svg";
import Avatar from "./components/Avatar";
import PersonSheet from "./components/PersonSheet";
import PulseCard from "./components/PulseCard";
import { closeness, warmth, isDrifting, contactStats } from "./lib/weight";
import CaptureMoment from "./components/CaptureMoment";
import { addNote, agent, approve, Card, clearChat, closePromise, connect, Feed, getBrief, getConnections, getFeed, getGraph, getPlans, getPulse, getSubscription, GraphPerson, loadSession, login, logout, logPulse, Memory, Message, PromiseItem, Pulse, registerDevice, setLocation, signup, simulate, subscribe, syncEmail } from "./lib/api";

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
  "remember sarah loves tulips",
  "what's on my calendar today?",
  "check my inbox for anything urgent",
];

const TABS = [
  { key: "today" as const, icon: "sun", label: "today" },
  { key: "chat" as const, icon: "message-circle", label: "chat" },
  { key: "people" as const, icon: "users", label: "people" },
  { key: "notes" as const, icon: "edit-3", label: "notes" },
  { key: "connect" as const, icon: "link", label: "connect" },
];
const TOOLS = [
  { key: "gmail", slug: "gmail", brand: "gmail", label: "gmail", icon: "mail", sub: "drafts replies in your voice" },
  { key: "gcal", slug: "google-calendar", brand: "googlecalendar", label: "calendar", icon: "calendar", sub: "knows when you're free" },
  { key: "notion", slug: "notion", brand: "notion", label: "notion", icon: "file-text", sub: "your notes and docs" },
  { key: "slack", slug: "slack", brand: "slack", label: "slack", icon: "slack", sub: "catches what matters" },
  { key: "whatsapp", slug: "", brand: "whatsapp", label: "whatsapp", icon: "message-circle", sub: "messages and threads" },
  { key: "bank", slug: "", brand: "", label: "bank and cards", icon: "credit-card", sub: "pays, with your ok" },
];

function AuraApp({ onSignOut }: { onSignOut: () => void }) {
  const [loaded] = useFonts({
    Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
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
  const [recOpen, setRecOpen] = useState(false);
  const [serverConnected, setServerConnected] = useState<string[]>([]);
  const [graph, setGraph] = useState<{ people: GraphPerson[]; promises: PromiseItem[] }>({ people: [], promises: [] });
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [pending, setPending] = useState<{ id: string; content: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
  const loadPulse = useCallback(async () => {
    try { setPulse(await getPulse()); } catch (e) {}
  }, []);
  const onPulse = useCallback(async (v: number, mood: string) => {
    try { await logPulse(v, mood); await loadPulse(); } catch (e) {}
  }, [loadPulse]);

  useEffect(() => {
    (async () => {
      try {
        let g = (await Notifications.getPermissionsAsync()).granted;
        if (!g) g = (await Notifications.requestPermissionsAsync()).granted;
        if (!g) return;
        const t = await Notifications.getExpoPushTokenAsync();
        if (t?.data) await registerDevice(t.data, Platform.OS);
      } catch (e) { /* push token needs a dev build; no-op in Expo Go */ }
    })();
    refresh();
    getConnections().then(setServerConnected).catch(() => {});
    loadGraph();
    loadPulse();
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
  }, [refresh]);

  // Live refresh only where it matters (chat needs fast liveness; today a gentler beat),
  // paused on other tabs and whenever the app is backgrounded, to spare battery + backend.
  useEffect(() => {
    if (tab !== "chat" && tab !== "today") return;
    const id = setInterval(() => { if (AppState.currentState === "active") refresh(); }, tab === "chat" ? 2000 : 7000);
    return () => clearInterval(id);
  }, [tab, refresh]);

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
    setDraft(""); setBusy(true); setThinking(true); setNotice(null);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    try { await agent(t); await refresh(); loadGraph(); }
    catch (e) { setNotice("i couldn't reach the server just now. give me a moment and try again."); }
    finally { sendingRef.current = false; setPending((p) => p.filter((x) => x.id !== tempId)); setThinking(false); setBusy(false); }
  };
  const homeCapture = async (text: string) => {
    const t = text.trim(); if (!t) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTab("chat"); setBusy(true); setThinking(true); setNotice(null);
    try { await agent(t, "home"); await refresh(); await loadGraph(); }
    catch (e) { setNotice("i couldn't reach the server just now. give me a moment and try again."); }
    finally { setThinking(false); setBusy(false); }
  };
  const donePromise = async (text: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // fetch first, then animate the resolved nudge sliding away as the list settles
    try { await closePromise(text); const g = await getGraph(); ease(); setGraph(g); } catch (e) {}
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
    setDemoOpen(false); setBusy(true); setTab("chat"); setThinking(true); setNotice(null);
    try { await syncEmail(); await refresh(); }
    catch (e) { setNotice("i couldn't reach your inbox just now. try again in a moment."); }
    finally { setThinking(false); setBusy(false); }
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
    Alert.alert("clear chat?", "this clears the conversation. your memory stays.", [
      { text: "cancel", style: "cancel" },
      { text: "clear", style: "destructive", onPress: async () => {
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
    setTab("chat"); setBusy(true); setThinking(true); setNotice(null);
    try { await getBrief(); await refresh(); }
    catch (e) { setNotice("i couldn't put your brief together just now. try again in a moment."); }
    finally { setThinking(false); setBusy(false); }
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
    ? "in a meeting"
    : locName && locName !== "nearby"
      ? `Near ${locName}`
      : "watching quietly";
  const hasChat = (feed?.messages?.length || 0) > 0 || pending.length > 0;
  const cardById = (id: string | null) => (id ? cards.find((x) => x.id === id) : undefined);
  const notes = (feed?.memories || []).filter((m) => m.source === "note");
  const isPro = feed?.entitlement?.tier === "pro";

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: (tab === "today" || tab === "people") ? "#6B54E8" : c.bg }]}>
      <StatusBar style={(tab === "today" || tab === "people") ? "light" : "dark"} />
      {!(tab === "today" || tab === "people") && (
      <View style={s.header}>
        <Orb size={32} state={headerState} />
        <View style={s.headerText}>
          <Text style={s.brand}>aura</Text>
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
            <Text style={s.demoBtnTxt}>demo</Text>
          </Press>
        </View>
      </View>
      )}

      {tab === "today" && <HomeView promises={graph.promises} people={graph.people} pulse={pulse} onPulse={onPulse} busy={busy} onCapture={homeCapture} onDone={donePromise} onBrief={briefFlow} onRecord={() => setRecOpen(true)} />}

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
            {notice ? <Bubble m={{ id: "notice", role: "aura", content: notice, kind: "system", card_id: null, created_at: "" } as Message} /> : null}
          </ScrollView>
          <View style={s.composer}>
            <View style={[s.inputShell, inputH > INPUT_LINE_H && s.inputShellTall]}>
              <TextInput
                style={[s.input, { height: Math.max(INPUT_LINE_H, inputH) }]}
                value={draft}
                onChangeText={setDraft}
                placeholder="message aura…"
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

      {tab === "people" && <PeopleView people={graph.people} promises={graph.promises} onRefresh={loadGraph} onAct={homeCapture} onAdd={() => setTab("today")} isPro={isPro} onUpgrade={() => setPayOpen(true)} onBrief={briefFlow} onSignOut={signOut} />}
      {tab === "notes" && <NotesView notes={notes} onAdd={addNoteFlow} busy={busy} />}
      {tab === "connect" && <ConnectView serverConnected={serverConnected} onConnect={connectFlow} />}

      <View style={s.tabBar}>
        {TABS.map(({ key, icon, label }) => (
          <TabItem
            key={key}
            icon={icon}
            label={label}
            active={tab === key}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); ease(); setTab(key); }}
          />
        ))}
      </View>

      <Modal visible={demoOpen} transparent animationType="fade" onRequestClose={() => setDemoOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setDemoOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetGrabber} />
            <Text style={s.sheetTitle}>try aura</Text>
            <Text style={s.sheetSub}>run a live action, or simulate a scenario</Text>
            <DemoBtn icon="inbox" label="check my inbox" sub="live" onPress={syncEmailFlow} />
            <DemoBtn icon="map-pin" label="walk past the bakery" onPress={() => runSim("near_bakery")} />
            <DemoBtn icon="mail" label="email while in a meeting" onPress={() => runSim("incoming_email")} />
            <DemoBtn icon="zap" label="urgent email arrives" onPress={() => runSim("incoming_email", { urgent: true })} />
            <DemoBtn icon="check-circle" label="meeting ends" onPress={() => runSim("meeting_end")} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setPayOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetGrabber} />
            <View style={s.payHeader}>
              <Orb size={38} state="warm" />
              <Text style={s.payTitle}>aura pro</Text>
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

      <CaptureMoment visible={recOpen} onClose={() => setRecOpen(false)} onCaptured={() => { refresh(); loadGraph(); }} />
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

// Tab item with a spring pop on the icon and a fading/scaling underline when it becomes active.
function TabItem({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => { Animated.spring(a, { toValue: active ? 1 : 0, useNativeDriver: true, friction: 6, tension: 150 }).start(); }, [active]);
  const iconScale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const lift = a.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  return (
    <Press onPress={onPress} style={s.tab}>
      <Animated.View style={{ transform: [{ scale: iconScale }, { translateY: lift }] }}>
        <Feather name={icon as any} size={20} color={active ? c.accent : c.muted} />
      </Animated.View>
      <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
      <Animated.View style={[s.tabIndicator, { opacity: a, transform: [{ scaleX: a }] }]} />
    </Press>
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
      <Animated.View pointerEvents="none" style={[s.stamp, s.stampApprove, { opacity: approveOp }]}><Text style={s.stampApproveTxt}>approve</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[s.stamp, s.stampNope, { opacity: nopeOp }]}><Text style={s.stampNopeTxt}>not now</Text></Animated.View>
      {(card.memory_refs?.length || urgent) ? (
        <View style={s.chipRow}>
          {urgent ? <View style={s.tag}><Text style={s.tagTxt}>urgent</Text></View> : null}
          {(card.memory_refs || []).slice(0, 1).map((mr, i) => {
            const short = String(mr).split("\n")[0].replace(/^extra context:\s*/i, "").trim();
            return <View key={i} style={s.chip}><Text style={s.chipTxt} numberOfLines={1}>from memory · {short.length > 32 ? short.slice(0, 32) + "…" : short}</Text></View>;
          })}
        </View>
      ) : null}
      <Text style={s.cardTitle}>{card.title}</Text>
      <Text style={s.cardBody}>{card.body}</Text>
      <Text style={s.swipeHint}>swipe right to approve · left to dismiss</Text>
      <View style={s.btnRow}>
        <Press style={s.approve} onPress={() => finish("approve", 1)} disabled={busy}>
          <Feather name="check" size={18} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={s.approveTxt}>approve</Text>
        </Press>
        <Press style={s.decline} onPress={() => finish("decline", -1)} disabled={busy}>
          <Text style={s.declineTxt}>not now</Text>
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
        <ScreenHeader title="notes" subtitle="anything you save becomes memory aura can recall later." />
        <View style={s.notePage}>
          <TextInput
            style={s.notePageInput}
            value={d}
            onChangeText={setD}
            placeholder="write a note…"
            placeholderTextColor={c.muted}
            multiline
            textAlignVertical="top"
          />
          <View style={s.notePageFooter}>
            <Text style={s.noteHint}>{d.trim() ? "tap save to add to memory" : "type or tap the mic"}</Text>
            <View style={s.noteActions}>
              <MicButton onResult={(t) => setD((p) => (p ? p + " " + t : t))} disabled={busy} size={layout.controlSm} />
              <Press onPress={submit} disabled={!d.trim()} style={[s.saveBtn, !d.trim() && s.sendBtnOff]}>
                {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.saveTxt}>Save</Text>}
              </Press>
            </View>
          </View>
        </View>
        {notes.length > 0 ? <Text style={s.sectionLabel}>saved notes</Text> : null}
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
      <ScreenHeader title="connect" subtitle="link your apps so aura can read context and act on your behalf." />
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
                {on ? "connected" : connectable ? "connect" : "soon"}
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
function fmtBday(b: string): string {
  const parts = String(b).split("-").map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
  if (parts.length < 2) return b;
  return `${MM[parts[parts.length - 2] - 1] || "?"} ${parts[parts.length - 1]}`;
}
function daysUntilBirthday(bday?: string | null): number | null {
  if (!bday) return null;
  const parts = String(bday).split("-").map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
  if (parts.length < 2) return null;
  const month = parts[parts.length - 2], day = parts[parts.length - 1];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next.getTime() < now.getTime()) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - now.getTime()) / 86400000);
}
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

function Stat({ n, label }: { n: string; label: string }) {
  return <View style={hs.stat}><Text style={hs.statN}>{n}</Text><Text style={hs.statL}>{label}</Text></View>;
}
function Chip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <View style={[hs.chip, { backgroundColor: bg }]}><Text style={[hs.chipTxt, { color: fg }]}>{label}</Text></View>;
}
function HomeView({ promises, people, pulse, onPulse, busy, onCapture, onDone, onBrief, onRecord }: { promises: PromiseItem[]; people: GraphPerson[]; pulse: Pulse | null; onPulse: (v: number, mood: string) => void; busy: boolean; onCapture: (t: string) => void; onDone: (text: string) => void; onBrief: () => void; onRecord: () => void }) {
  const [q, setQ] = useState("");
  const submit = () => { if (!q.trim()) return; onCapture(q); setQ(""); };
  const pN = promises.map((p) => {
    const meta = dueMeta(p.due); const over = !!meta && meta.tone === "over";
    return { key: "p:" + p.text + (p.person || ""), person: p.person || "someone",
      title: p.direction === "owed_to_me" ? `${p.person || "someone"} owes you` : `for ${p.person || "someone"}`, body: p.text,
      chip: meta ? { label: meta.label, bg: over ? c.coral : c.chipBg, fg: over ? "#fff" : c.muted } : null,
      ring: over ? c.coral : c.mint, glow: false, rank: meta ? meta.rank : 9999, actBg: c.mint, icon: "check", action: () => onDone(p.text) };
  });
  const bN = people.map((p) => ({ p, d: daysUntilBirthday(p.birthday) })).filter((x) => x.d !== null && (x.d as number) <= 21).map(({ p, d }) => {
    const days = d as number; const label = days === 0 ? "today!" : days === 1 ? "tomorrow" : `in ${days} days`;
    const wants = (p.wants || []).filter(Boolean);
    const body = wants.length ? `they mentioned wanting ${wants.slice(0, 2).join(", ")}` : (p.relation ? `your ${p.relation}` : "coming up");
    const action = wants.length
      ? () => onCapture(`help me get ${p.person} a birthday gift. they've mentioned wanting: ${wants.join(", ")}. suggest something thoughtful and offer to handle it for me.`)
      : () => onCapture(`help me send a warm birthday message to ${p.person}`);
    return { key: "b:" + p.person, person: p.person, title: `${p.person}'s birthday`, body,
      chip: { label, bg: c.pink, fg: "#fff" }, ring: c.pink, glow: true, rank: days, actBg: c.pink, icon: "gift", action };
  });
  const cN = people.filter((p) => p.care && p.care_at && (Date.now() - Number(p.care_at) < 30 * 86400000)).slice(0, 3).map((p) => ({
    key: "c:" + p.person, person: p.person, title: `check in on ${p.person}`, body: String(p.care || ""),
    chip: { label: "needs you", bg: c.pink, fg: "#fff" }, ring: c.pink, glow: true, rank: -12,
    actBg: c.pink, icon: "heart", action: () => onCapture(`help me reach out warmly to ${p.person}. what's going on: ${p.care}`),
  }));
  // social connector: gently resurface people you've drifted from, so no one important goes quiet
  const surfaced = new Set([...cN, ...pN, ...bN].map((n) => String(n.person || "").toLowerCase()));
  const rN = people.filter((p) => !surfaced.has(String(p.person).toLowerCase()) && isDrifting(p))
    .sort((a, b) => warmth(a) - warmth(b)).slice(0, 2).map((p) => {
      const st = contactStats(p);
      const body = st.cadenceLabel
        ? `you usually talk ${st.cadenceLabel}, last was ${st.lastLabel}`
        : (st.overdueWeeks ? `it's been ${st.overdueWeeks} ${st.overdueWeeks === 1 ? "week" : "weeks"} since you caught up` : "you've gone quiet lately");
      return { key: "r:" + p.person, person: p.person, title: `reconnect with ${p.person}`, body,
        chip: { label: p.relation || "reach out", bg: c.blue, fg: "#fff" }, ring: c.blue, glow: false, rank: 6, actBg: c.blue, icon: "message-circle",
        action: () => onCapture(`help me reconnect with ${p.person}, it's been a while. draft a warm, low pressure message to pick things back up.`) };
    });
  const nudges = [...cN, ...rN, ...pN, ...bN].sort((a, b) => a.rank - b.rank).slice(0, 6);
  return (
    <View style={s.fill}>
      <LinearGradient colors={grad.today as any} locations={[0, 0.34, 0.64]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <ScrollView style={s.fill} contentContainerStyle={hs.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={hs.greet}>{greeting()}</Text>
          <Text style={hs.sub}>{nudges.length ? `${nudges.length} ${nudges.length === 1 ? "thing needs" : "things need"} you today.` : "you're all caught up today."}</Text>
          <View style={hs.statRow}>
            <Stat n={String(people.length)} label="people" />
            <Stat n={String(promises.length)} label="promises" />
            <Stat n={String(bN.length)} label="birthdays" />
          </View>
          <View style={hs.capture}>
            <TextInput style={hs.captureInput} value={q} onChangeText={setQ} placeholder="tell aura anything…" placeholderTextColor="#9a94bd" multiline />
            <View style={hs.captureRow}>
              <MicButton onResult={(t) => setQ((d) => (d ? d + " " + t : t))} disabled={busy} size={38} />
              <Press onPress={submit} disabled={!q.trim() || busy} style={[hs.send, !q.trim() && { opacity: 0.45 }]}>
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="arrow-up" size={19} color="#fff" />}
              </Press>
            </View>
          </View>
          <Press onPress={onRecord} style={hs.recPill}>
            <View style={hs.recMic}><Feather name="mic" size={16} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={hs.recTitle}>capture a moment</Text>
              <Text style={hs.recSub}>record a conversation, i'll remember it</Text>
            </View>
            <Feather name="chevron-right" size={20} color={c.muted} />
          </Press>
          <PulseCard pulse={pulse} onPulse={onPulse} />
          <View style={hs.secRow}><Text style={hs.sec}>who needs you</Text><Press onPress={onBrief} hitSlop={8}><Text style={hs.brief}>daily brief →</Text></Press></View>
          {nudges.length ? nudges.map((n) => (
            <FadeInUp key={n.key}>
              <View style={hs.card}>
                <Avatar name={n.person} size={54} ring={n.ring} glow={n.glow} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={hs.cardTitle} numberOfLines={1}>{n.title}</Text>
                  <Text style={hs.cardBody} numberOfLines={1}>{n.body}</Text>
                  {n.chip ? <Chip label={n.chip.label} bg={n.chip.bg} fg={n.chip.fg} /> : null}
                </View>
                <Press onPress={n.action} style={[hs.act, { backgroundColor: n.actBg }]}><Feather name={n.icon as any} size={19} color="#fff" /></Press>
              </View>
            </FadeInUp>
          )) : (
            <View style={hs.empty}><Feather name="sun" size={26} color="#fff" /><Text style={hs.emptyTxt}>nothing needs you right now. tell aura about someone you met, or a promise you made.</Text></View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const hs = StyleSheet.create({
  scroll: { padding: 16, paddingTop: 6, paddingBottom: 30 },
  greet: { fontFamily: font.display, fontSize: 30, color: "#fff", letterSpacing: -0.9, lineHeight: 34 },
  sub: { fontFamily: font.semibold, fontSize: 14, color: "rgba(255,255,255,0.92)", letterSpacing: -0.2, marginTop: 4, marginBottom: 14 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 18, borderWidth: 2.5, borderColor: "#fff", paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", ...shadow.puff },
  statN: { fontFamily: font.display, fontSize: 21, color: c.ink, letterSpacing: -0.6 },
  statL: { fontFamily: font.semibold, fontSize: 11, color: c.muted, letterSpacing: -0.2, marginTop: 1 },
  capture: { backgroundColor: "#fff", borderRadius: 22, padding: 12, marginBottom: 16, ...shadow.card },
  captureInput: { fontFamily: font.medium, fontSize: 15, color: c.ink, letterSpacing: -0.2, minHeight: 40, padding: 0 },
  captureRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "#fff", ...shadow.puff },
  secRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 2 },
  sec: { fontFamily: font.display, fontSize: 15, color: "#fff", letterSpacing: -0.4 },
  brief: { fontFamily: font.bold, fontSize: 13, color: "#fff", letterSpacing: -0.2, opacity: 0.95 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 22, padding: 11, marginBottom: 10, ...shadow.card },
  cardTitle: { fontFamily: font.display, fontSize: 16, color: c.ink, letterSpacing: -0.4, lineHeight: 19 },
  cardBody: { fontFamily: font.medium, fontSize: 12.5, color: c.muted, letterSpacing: -0.2, marginTop: 1 },
  chip: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 2, borderColor: "#fff", paddingHorizontal: 9, paddingVertical: 3, marginTop: 6, ...shadow.soft },
  chipTxt: { fontFamily: font.bold, fontSize: 10.5, letterSpacing: -0.2 },
  act: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff", ...shadow.puff },
  empty: { alignItems: "center", gap: 10, paddingVertical: 30, paddingHorizontal: 24 },
  emptyTxt: { fontFamily: font.semibold, fontSize: 14.5, color: "rgba(255,255,255,0.95)", textAlign: "center", letterSpacing: -0.2, lineHeight: 21 },
  recPill: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 22, padding: 12, marginBottom: 16, ...shadow.card },
  recMic: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.pink, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "#fff", ...shadow.soft },
  recTitle: { fontFamily: font.display, fontSize: 15.5, color: c.ink, letterSpacing: -0.4 },
  recSub: { fontFamily: font.medium, fontSize: 12, color: c.muted, letterSpacing: -0.2, marginTop: 1 },
});

const SLOTS = [
  { x: 27, y: 22 }, { x: 73, y: 24 }, { x: 15, y: 50 }, { x: 85, y: 51 },
  { x: 31, y: 76 }, { x: 69, y: 78 }, { x: 50, y: 13 }, { x: 50, y: 88 },
];
function Float({ i, children }: { i: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 2200 + i * 170, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 2200 + i * 170, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  const ty = a.interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 ? 7 : -7] });
  return <Animated.View style={{ transform: [{ translateY: ty }] }}>{children}</Animated.View>;
}
function PeopleView({ people, onRefresh, onAct, onAdd, isPro, onUpgrade, onBrief, onSignOut }: { people: GraphPerson[]; promises: PromiseItem[]; onRefresh: () => Promise<void> | void; onAct: (t: string) => void; onAdd: () => void; isPro: boolean; onUpgrade: () => void; onBrief: () => void; onSignOut: () => void }) {
  useEffect(() => { onRefresh(); }, []);
  const [sel, setSel] = useState<GraphPerson | null>(null);
  const shown = [...people].sort((a, b) => closeness(b) - closeness(a)).slice(0, 8);
  const need = people.filter((p) => { const b = daysUntilBirthday(p.birthday); return (b !== null && b <= 21) || !!(p.open_promises && p.open_promises.length) || isDrifting(p); }).length;
  const score = people.length ? Math.max(38, 98 - need * 7) : 100;
  // the health score counts up when the constellation opens
  const [shownScore, setShownScore] = useState(0);
  const scoreAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = scoreAnim.addListener(({ value }) => setShownScore(Math.round(value)));
    Animated.timing(scoreAnim, { toValue: score, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => scoreAnim.removeListener(id);
  }, [score]);
  const cx = 50, cy = 47;
  return (
    <View style={s.fill}>
      <LinearGradient colors={grad.cons as any} style={StyleSheet.absoluteFill} />
      <View style={cs.top}>
        <View style={{ flex: 1 }}>
          <Text style={cs.h}>your circle</Text>
          <Text style={cs.hSub}>{people.length} {people.length === 1 ? "person" : "people"}{need ? ` · ${need} need you` : ""}</Text>
        </View>
        <View style={cs.health}><Text style={cs.healthN}>{shownScore}</Text><Text style={cs.healthL}>health</Text></View>
      </View>
      <View style={cs.canvas}>
        {people.length === 0 ? (
          <View style={cs.emptyWrap}>
            <Orb size={72} state="idle" />
            <Text style={cs.emptyTxt}>your constellation is empty. tell aura about the people who matter, and they'll appear here.</Text>
            <Press onPress={onAdd} style={cs.emptyCta}><Text style={cs.emptyCtaTxt}>tell aura about your people</Text><Feather name="arrow-right" size={16} color={c.accent} /></Press>
          </View>
        ) : (
          <>
            <Svg style={StyleSheet.absoluteFill as any} viewBox="0 0 100 100" preserveAspectRatio="none">
              {shown.map((p, i) => {
                const t = (0.13 + 0.22 * (closeness(p) / 100)) * (0.45 + 0.55 * warmth(p));
                return <Line key={i} x1={cx} y1={cy} x2={SLOTS[i].x} y2={SLOTS[i].y} stroke={`rgba(255,255,255,${t.toFixed(3)})`} strokeWidth={0.28 + 0.5 * (closeness(p) / 100)} />;
              })}
            </Svg>
            <View style={[cs.node, { left: `${cx}%`, top: `${cy}%`, marginLeft: -46, marginTop: -34 }]}>
              <View style={cs.youOrb}><Text style={cs.youTxt}>you</Text></View>
            </View>
            {shown.map((p, i) => {
              const b = daysUntilBirthday(p.birthday); const bsoon = b !== null && b <= 21;
              const owes = !!(p.open_promises && p.open_promises.length);
              const cl = closeness(p); const w = warmth(p); const drift = isDrifting(p);
              const ring = bsoon ? c.pink : owes ? c.coral : drift ? c.blue : c.mint;
              const size = Math.round(46 + (Math.min(cl, 92) / 92) * 26);
              const st = bsoon ? `🎂 ${b === 0 ? "today" : b + "d"}` : owes ? "you owe" : drift ? "drifting" : (p.relation || "");
              return (
                <View key={p.person} style={[cs.node, { left: `${SLOTS[i].x}%`, top: `${SLOTS[i].y}%`, marginLeft: -46, marginTop: -size / 2 }]}>
                  <Press onPress={() => setSel(p)} style={{ alignItems: "center", opacity: 0.5 + 0.5 * w }}>
                    <Float i={i}><Avatar name={p.person} size={size} ring={ring} glow={bsoon || (cl >= 52 && w >= 0.85)} /></Float>
                    <Text style={cs.nm} numberOfLines={1}>{p.person}</Text>
                    {st ? <Text style={[cs.st, drift && { color: "#cfe6ff" }]} numberOfLines={1}>{st}</Text> : null}
                  </Press>
                </View>
              );
            })}
          </>
        )}
      </View>
      <View style={cs.legend}>
        <View style={cs.lg}><View style={[cs.dot, { backgroundColor: c.mint }]} /><Text style={cs.lgTxt}>in touch</Text></View>
        <View style={cs.lg}><View style={[cs.dot, { backgroundColor: c.pink }]} /><Text style={cs.lgTxt}>birthday</Text></View>
        <View style={cs.lg}><View style={[cs.dot, { backgroundColor: c.coral }]} /><Text style={cs.lgTxt}>owed</Text></View>
        <View style={cs.lg}><View style={[cs.dot, { backgroundColor: c.blue }]} /><Text style={cs.lgTxt}>drifting</Text></View>
      </View>
      <View style={cs.actions}>
        <Press style={cs.pillPrimary} onPress={onBrief}><Feather name="sun" size={15} color="#fff" /><Text style={cs.pillPrimaryTxt}>daily brief</Text></Press>
        {isPro ? <View style={cs.pill}><Feather name="star" size={12} color="#fff" /><Text style={cs.pillTxt}>aura pro</Text></View>
          : <Press style={cs.pill} onPress={onUpgrade}><Text style={cs.pillTxt}>✦ pro</Text></Press>}
        <Press style={cs.iconPill} onPress={onSignOut} hitSlop={8}><Feather name="log-out" size={15} color="#fff" /></Press>
      </View>
      <PersonSheet person={sel} onClose={() => setSel(null)} onAct={onAct} />
    </View>
  );
}
const cs = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 2 },
  h: { fontFamily: font.display, fontSize: 26, color: "#fff", letterSpacing: -0.8 },
  hSub: { fontFamily: font.semibold, fontSize: 13, color: "rgba(255,255,255,0.9)", letterSpacing: -0.2, marginTop: 1 },
  health: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 3, borderColor: c.mint, alignItems: "center", justifyContent: "center" },
  healthN: { fontFamily: font.display, fontSize: 18, color: "#fff", letterSpacing: -0.5, lineHeight: 19 },
  healthL: { fontFamily: font.bold, fontSize: 7, color: "rgba(255,255,255,0.8)", letterSpacing: 0.4 },
  canvas: { flex: 1, position: "relative", marginHorizontal: 8 },
  node: { position: "absolute", width: 92, alignItems: "center" },
  youOrb: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", ...shadow.card },
  youTxt: { fontFamily: font.display, fontSize: 15, color: c.accent, letterSpacing: -0.5 },
  nm: { fontFamily: font.display, fontSize: 12, color: "#fff", letterSpacing: -0.3, marginTop: 4, textShadowColor: "rgba(20,10,60,0.5)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  st: { fontFamily: font.semibold, fontSize: 9.5, color: "rgba(255,255,255,0.9)", letterSpacing: -0.2 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },
  emptyTxt: { fontFamily: font.semibold, fontSize: 15, color: "rgba(255,255,255,0.95)", textAlign: "center", letterSpacing: -0.2, lineHeight: 22 },
  emptyCta: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", height: 50, paddingHorizontal: 22, borderRadius: 999, borderWidth: 2.5, borderColor: "rgba(255,255,255,0.6)", marginTop: 4, ...shadow.puff },
  emptyCtaTxt: { fontFamily: font.bold, fontSize: 15, color: c.accent, letterSpacing: -0.3 },
  legend: { flexDirection: "row", justifyContent: "center", gap: 7, paddingVertical: 8 },
  lg: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  lgTxt: { fontFamily: font.bold, fontSize: 10.5, color: "#fff", letterSpacing: -0.2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  pillPrimary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 999, backgroundColor: c.accent, borderWidth: 2.5, borderColor: "#fff", ...shadow.puff },
  pillPrimaryTxt: { fontFamily: font.bold, fontSize: 14, color: "#fff", letterSpacing: -0.3 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, height: 44, paddingHorizontal: 15, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" },
  pillTxt: { fontFamily: font.bold, fontSize: 13, color: "#fff", letterSpacing: -0.2 },
  iconPill: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" },
});

const EmptyChat = ({ onSuggest, onDemo }: { onSuggest: (t: string) => void; onDemo: () => void }) => (
  <View style={s.empty}>
    <Text style={s.emptyTitle}>what should i remember?</Text>
    <Text style={s.emptySub}>tell me a thought, a plan, a person. i'll bring it back when it matters.</Text>
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
  bdayRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  bdayTxt: { fontFamily: font.medium, fontSize: ty.caption, color: c.muted },

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

const authInputStyle: any = { backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 18, height: 56, fontFamily: font.semibold, fontSize: 16, color: c.ink, letterSpacing: -0.2, marginBottom: 12, ...shadow.card };

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
    <View style={s.fill}>
      <LinearGradient colors={grad.cons as any} style={StyleSheet.absoluteFill} />
      <StatusBar style="light" />
      <SafeAreaView style={s.fill}>
        <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 28 }}>
            <View style={{ alignItems: "center", marginBottom: 30 }}>
              <Orb size={92} state="idle" />
              <Text style={{ fontFamily: font.display, fontSize: 44, color: "#fff", letterSpacing: -1.2, marginTop: 16 }}>aura</Text>
              <Text style={{ fontFamily: font.medium, fontSize: 15, lineHeight: 22, color: "rgba(255,255,255,0.9)", textAlign: "center", letterSpacing: -0.2, marginTop: 6 }}>the personal ai that remembers what matters.</Text>
            </View>
            {mode === "signup" ? (
              <TextInput style={authInputStyle} value={name} onChangeText={setName} placeholder="your name" placeholderTextColor="#a99fd6" autoCapitalize="words" />
            ) : null}
            <TextInput style={authInputStyle} value={email} onChangeText={setEmail} placeholder="email" placeholderTextColor="#a99fd6" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
            <TextInput style={authInputStyle} value={pw} onChangeText={setPw} placeholder="password" placeholderTextColor="#a99fd6" secureTextEntry />
            {err ? <Text style={{ color: "#FFD7DA", fontFamily: font.semibold, fontSize: 13, letterSpacing: -0.2, marginBottom: 8, marginLeft: 4 }}>{err}</Text> : null}
            <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [{ backgroundColor: "#fff", height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 4, borderWidth: 3, borderColor: "rgba(255,255,255,0.6)", ...shadow.puff }, pressed && { opacity: 0.92 }]}>
              {busy ? <ActivityIndicator color={c.accent} /> : <Text style={{ fontFamily: font.bold, fontSize: 17, color: c.accent, letterSpacing: -0.3 }}>{mode === "login" ? "log in" : "create account"}</Text>}
            </Pressable>
            <Pressable onPress={() => { setErr(""); setMode(mode === "login" ? "signup" : "login"); }} hitSlop={10} style={{ marginTop: 20, alignItems: "center" }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 14, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2 }}>{mode === "login" ? "new here? create an account" : "have an account? log in"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

export default function Root() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => { loadSession().then((ok) => setAuthed(ok)).catch(() => setAuthed(false)); }, []);
  if (!fontsLoaded || authed === null) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}><Orb size={110} state="idle" /></View>;
  if (!authed) return <AuthGate onAuthed={(isNew) => { setOnboarding(isNew); setAuthed(true); }} />;
  if (onboarding) return <Onboarding onDone={() => setOnboarding(false)} />;
  return <AuraApp onSignOut={() => { setOnboarding(false); setAuthed(false); }} />;
}
