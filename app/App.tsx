import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, LayoutAnimation, Platform, SafeAreaView, StyleSheet, UIManager, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as Location from "expo-location";
import { useFonts } from "expo-font";
import Mark from "./components/Mark";
import Onboarding from "./components/Onboarding";
import CaptureMoment from "./components/CaptureMoment";
import PersonSheet from "./components/PersonSheet";
import TabBar, { TabKey } from "./components/TabBar";
import { isReply } from "./components/ActionCard";
import { AdultSheet, ConfirmSheet, EditDraftSheet, ProSheet, ScenarioKey, ScenarioSheet } from "./components/Sheets";
import { Toast } from "./components/ui";
import AuraScreen from "./screens/AuraScreen";
import TodayScreen from "./screens/TodayScreen";
import MemoryScreen from "./screens/MemoryScreen";
import YouScreen from "./screens/YouScreen";
import AuthScreen from "./screens/AuthScreen";
import { c, fontAssets, Tone } from "./theme";
import { onToast } from "./lib/toast";
import { personalityLabel } from "./lib/personality";
import {
  agent, approve, Card, captureThought, CaptureResult, clearChat, closePromise, connect, DEFAULT_SETTINGS, Feed, forgetAllMemories, forgetMemory,
  getBrief, getConnections, getFeed, getGraph, getPlans, getRemember, getSettings, getSubscription, GraphPerson, loadSession, logout, Memory,
  Personality, PlaceReminder, PromiseItem, registerDevice, Remembered, rememberDone, Reminder, saveSettings, setLocation, setTimezone, Settings,
  simulate, subscribe, syncEmail,
} from "./lib/api";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const ease = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
const OFFLINE = "I couldn't reach the server just now. Give me a moment and try again.";
const UNDO_MS = 5000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: false,
  } as any),
});

type RememberData = { scheduled: Reminder[]; places: PlaceReminder[]; remembered: Remembered[] };
type Confirm = { title: string; body: string; confirm: string; run: () => void } | null;

function AuraApp({ onSignOut }: { onSignOut: () => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [tab, setTab] = useState<TabKey>("aura");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [recOpen, setRecOpen] = useState(false);
  const [serverConnected, setServerConnected] = useState<string[]>([]);
  const [graph, setGraph] = useState<{ people: GraphPerson[]; promises: PromiseItem[] }>({ people: [], promises: [] });
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [pending, setPending] = useState<{ id: string; content: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remember, setRemember] = useState<RememberData>({ scheduled: [], places: [], remembered: [] });
  const [rememberLoaded, setRememberLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [adultOpen, setAdultOpen] = useState(false);
  const [adultBusy, setAdultBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [person, setPerson] = useState<GraphPerson | null>(null);
  const [askFocus, setAskFocus] = useState(0);
  const [toast, setToast] = useState<{ text: string; undo?: boolean } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const sigRef = useRef("");
  const sendingRef = useRef(false);
  const seenMsg = useRef<Set<string>>(new Set());
  const undoRef = useRef<{ commit: () => void; revert: () => void; timer: any } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const f = await getFeed();
      for (const card of f.cards || []) {
        if (card.type === "urgent" && card.status === "pending" && !seen.current.has(card.id)) {
          if (!first.current) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            Notifications.scheduleNotificationAsync({ content: { title: "Aura", body: `${card.title} looks urgent. I drafted a reply.` }, trigger: null }).catch(() => {});
          }
        }
        seen.current.add(card.id);
      }
      for (const m of f.messages || []) {
        if (m.kind === "reminder" && !seenMsg.current.has(m.id)) {
          if (!first.current) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            Notifications.scheduleNotificationAsync({ content: { title: "Aura", body: m.content }, trigger: null }).catch(() => {});
          }
        }
        seenMsg.current.add(m.id);
      }
      first.current = false;
      const sig = `${(f.messages || []).length}:${(f.messages || []).slice(-1)[0]?.id || ""}:${(f.cards || []).map((x) => x.id + x.status + x.body).join(",")}:${(f.memories || []).map((m) => m.id).join(",")}:${f.context?.status || ""}`;
      if (sig !== sigRef.current) { sigRef.current = sig; ease(); setFeed(f); }
    } catch (e) { /* keep last good feed */ }
  }, []);

  const loadGraph = useCallback(async () => {
    try { setGraph(await getGraph()); } catch (e) {} finally { setGraphLoaded(true); }
  }, []);
  const loadRemember = useCallback(async () => {
    try { setRemember(await getRemember()); } catch (e) {} finally { setRememberLoaded(true); }
  }, []);
  const captureNote = useCallback(async (text: string): Promise<CaptureResult> => {
    const res = await captureThought(text);
    loadRemember(); refresh();
    return res;
  }, [loadRemember, refresh]);

  // ---------- toasts and undo: outbound or destructive actions wait five seconds behind Undo ----------
  const flash = useCallback((text: string) => {
    setToast({ text });
    setTimeout(() => setToast((cur) => (cur && cur.text === text && !cur.undo ? null : cur)), 3500);
  }, []);
  useEffect(() => onToast(flash), [flash]);
  const flushUndo = useCallback(() => {
    const p = undoRef.current; if (!p) return;
    clearTimeout(p.timer); undoRef.current = null; setToast(null); p.commit();
  }, []);
  const withUndo = (text: string, commit: () => void, revert: () => void) => {
    flushUndo();
    const timer = setTimeout(() => { undoRef.current = null; setToast(null); commit(); }, UNDO_MS);
    undoRef.current = { commit, revert, timer };
    setToast({ text, undo: true });
  };
  const undo = () => {
    const p = undoRef.current; if (!p) return;
    clearTimeout(p.timer); undoRef.current = null;
    Haptics.selectionAsync().catch(() => {});
    ease(); p.revert(); setToast(null);
  };
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const unhide = (id: string) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; });

  const act = (card: Card, decision: "approve" | "decline", edited?: string) => {
    if (!card.action_id) return;
    const actionId = card.action_id;
    ease(); hide(card.id);
    const label = decision === "decline" ? "Set aside" : isReply(card) ? "Sending reply" : "Approved";
    withUndo(label, async () => {
      try {
        const res: any = await approve(actionId, decision, edited);
        if (res?.ok === false || res?.error) flash(res?.error === "send_failed" ? "That didn't send. It's still waiting for you." : "That didn't go through. Try again.");
        else if (decision === "approve") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await refresh();
      } catch (e) { flash("That didn't go through. Check your connection."); }
      finally { unhide(card.id); }
    }, () => unhide(card.id));
  };
  const donePromise = (text: string) => {
    const prev = graph;
    ease();
    setGraph({ people: graph.people.map((p) => ({ ...p, open_promises: (p.open_promises || []).filter((x) => x !== text) })), promises: graph.promises.filter((p) => p.text !== text) });
    withUndo("Marked done", async () => {
      try { await closePromise(text); setGraph(await getGraph()); } catch (e) { setGraph(prev); flash("That didn't save. Try again."); }
    }, () => setGraph(prev));
  };
  const onReminderDone = (id: string) => {
    const prev = remember;
    ease();
    setRemember({ scheduled: prev.scheduled.filter((x) => x.id !== id), places: prev.places.filter((x) => x.id !== id), remembered: prev.remembered });
    withUndo("Marked done", async () => {
      try { await rememberDone(id); setRemember(await getRemember()); } catch (e) { setRemember(prev); flash("That didn't save. Try again."); }
    }, () => setRemember(prev));
  };
  const forget = (m: Memory) => {
    ease(); hide(m.id);
    withUndo("Forgotten", async () => {
      try { await forgetMemory(m.id); await refresh(); } catch (e) { flash("Couldn't forget that. Try again."); }
      finally { unhide(m.id); }
    }, () => unhide(m.id));
  };
  const forgetAll = () => setConfirm({
    title: "Forget everything?", body: "Aura will lose every fact it has kept about you. Reminders and people stay. This can't be undone.", confirm: "Forget everything",
    run: async () => {
      try { await forgetAllMemories(); sigRef.current = ""; await refresh(); flash("Aura's memory is clear."); } catch (e) { flash("Couldn't clear memory. Try again."); }
    },
  });

  // ---------- settings: personality, unfiltered, instructions ----------
  const changeSettings = async (patch: { personality?: Personality; instructions?: string }) => {
    const prev = settings;
    setSettings({ ...settings, ...patch });
    Haptics.selectionAsync().catch(() => {});
    const res = await saveSettings(patch);
    if (res.ok && res.settings) { setSettings(res.settings); if (patch.instructions !== undefined) flash("Saved. Aura will follow these from now on."); return true; }
    setSettings(prev); flash("Couldn't save that. Try again."); return false;
  };
  const toggleUnfiltered = async (on: boolean) => {
    if (on && !settings.adult_confirmed) { setAdultOpen(true); return; }
    const prev = settings;
    setSettings({ ...settings, unfiltered: on });
    const res = await saveSettings({ unfiltered: on });
    if (res.ok && res.settings) setSettings(res.settings); else { setSettings(prev); flash("Couldn't change that. Try again."); }
  };
  const confirmAdult = async () => {
    setAdultBusy(true);
    const res = await saveSettings({ unfiltered: true, confirm_adult: true });
    setAdultBusy(false); setAdultOpen(false);
    if (res.ok && res.settings) { setSettings(res.settings); flash("Unfiltered is on."); } else flash("Couldn't turn that on. Try again.");
  };

  // report the current device timezone (any IANA zone worldwide). re-run on foreground so travel updates it.
  const reportTimezone = useCallback(() => {
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) setTimezone(tz).catch(() => {}); } catch (e) {}
  }, []);
  // refresh current location without re-prompting (only if already granted); catches travel too.
  const refreshLocation = useCallback(async (ask = false) => {
    try {
      const { status } = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const place = geo[0]?.name || geo[0]?.district || geo[0]?.city || geo[0]?.subregion || "nearby";
      const res = await setLocation(pos.coords.latitude, pos.coords.longitude, place);
      if (res?.surfaced?.length) refresh(); // a place-triggered reminder just fired
    } catch (e) { /* ignore */ }
  }, [refresh]);

  useEffect(() => {
    (async () => {
      try {
        let g = (await Notifications.getPermissionsAsync()).granted;
        if (!g) g = (await Notifications.requestPermissionsAsync()).granted;
        if (!g) return;
        const tk = await Notifications.getExpoPushTokenAsync();
        if (tk?.data) await registerDevice(tk.data, Platform.OS);
      } catch (e) { /* push token needs a dev build; no-op in Expo Go */ }
    })();
    refresh();
    getSettings().then(setSettings).catch(() => {});
    getConnections().then(setServerConnected).catch(() => {});
    loadGraph();
    loadRemember();
    reportTimezone();
    refreshLocation(true);
  }, [refresh]);

  // Re-detect timezone + location whenever Aura returns to the foreground, so travel updates your
  // local time and place. Leaving the app commits anything waiting behind Undo, so nothing is lost.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") { reportTimezone(); refreshLocation(); }
      else flushUndo();
    });
    return () => sub.remove();
  }, [reportTimezone, refreshLocation, flushUndo]);

  // Live refresh where it matters: the conversation fast, Today on a gentler beat. Paused elsewhere
  // and whenever the app is backgrounded, to spare battery and the backend.
  useEffect(() => {
    if (tab !== "aura" && tab !== "today") return;
    const id = setInterval(() => { if (AppState.currentState === "active") refresh(); }, tab === "aura" ? 2000 : 7000);
    return () => clearInterval(id);
  }, [tab, refresh]);

  useEffect(() => { if (tab === "today" || tab === "memory") { loadGraph(); loadRemember(); } }, [tab, loadGraph, loadRemember]);
  useEffect(() => { if (tab === "you") { getConnections().then(setServerConnected).catch(() => {}); getSettings().then(setSettings).catch(() => {}); } }, [tab]);

  const go = (k: TabKey) => { Haptics.selectionAsync().catch(() => {}); setTab(k); };
  const openChat = () => { setTab("aura"); setAskFocus((k) => k + 1); };

  const send = async () => {
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const tempId = "t" + Date.now();
    ease();
    setPending((p) => [...p, { id: tempId, content: text }]);
    setDraft(""); setBusy(true); setThinking(true); setNotice(null);
    try { await agent(text); await refresh(); loadGraph(); }
    catch (e) { setNotice(OFFLINE); }
    finally { sendingRef.current = false; setPending((p) => p.filter((x) => x.id !== tempId)); setThinking(false); setBusy(false); }
  };
  // a request started from elsewhere (a person, the brief): hand it to Aura and follow along in chat
  const askAura = async (text: string) => {
    const msg = text.trim(); if (!msg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTab("aura"); setBusy(true); setThinking(true); setNotice(null);
    try { await agent(msg, "home"); await refresh(); await loadGraph(); }
    catch (e) { setNotice(OFFLINE); }
    finally { setThinking(false); setBusy(false); }
  };
  const openPerson = (name: string) => {
    const key = String(name || "").toLowerCase();
    const p = graph.people.find((x) => x.person.toLowerCase() === key) || graph.people.find((x) => x.person.toLowerCase().split(" ")[0] === key.split(" ")[0]);
    if (p) { Haptics.selectionAsync().catch(() => {}); setPerson(p); }
  };
  const runSim = async (scenario: string, extra: any = {}) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDemoOpen(false); setBusy(true); setTab("aura");
    try { await simulate(scenario, extra); await refresh(); }
    catch (e) { setNotice(OFFLINE); }
    finally { setBusy(false); }
  };
  const syncEmailFlow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDemoOpen(false); setBusy(true); setTab("aura"); setThinking(true); setNotice(null);
    try { await syncEmail(); await refresh(); }
    catch (e) { setNotice("I couldn't reach your inbox just now. Try again in a moment."); }
    finally { setThinking(false); setBusy(false); }
  };
  const runScenario = (k: ScenarioKey) => {
    if (k === "inbox") syncEmailFlow();
    else if (k === "urgent") runSim("incoming_email", { urgent: true });
    else runSim(k);
  };
  const connectFlow = async (slug: string) => {
    if (!slug) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      const res: any = await connect(slug);
      if (res?.authUrl) await WebBrowser.openBrowserAsync(res.authUrl);
      let cn: string[] = [];
      for (let i = 0; i < 6; i++) {
        cn = await getConnections();
        setServerConnected(cn);
        if (cn.includes(slug)) break;
        await new Promise((r2) => setTimeout(r2, 1500));
      }
      if (!cn.includes(slug)) flash("Not connected yet. You can try again anytime.");
    } catch (e) { flash("Couldn't start connecting. Check your connection."); }
  };
  const clearChatFlow = () => setConfirm({
    title: "Clear this conversation?", body: "Only the chat is cleared. Everything Aura remembers stays.", confirm: "Clear conversation",
    run: async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setPending([]); setThinking(false);
      try { await clearChat(); } catch (e) { flash("Couldn't clear the conversation. Try again."); }
      seen.current.clear(); seenMsg.current.clear(); sigRef.current = "";
      ease(); refresh();
    },
  });
  const briefFlow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTab("aura"); setBusy(true); setThinking(true); setNotice(null);
    try { await getBrief(); await refresh(); }
    catch (e) { setNotice("I couldn't put your brief together just now. Try again in a moment."); }
    finally { setThinking(false); setBusy(false); }
  };
  const signOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    flushUndo();
    try { await logout(); } catch (e) {}
    onSignOut();
  };
  const onSubscribe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPayBusy(true); setPayErr("");
    try {
      const plans = await getPlans();
      const plan = plans.find((p) => /pro/i.test(p.name)) || plans[0];
      if (!plan) { setPayErr("Billing is being set up. Check back shortly."); return; }
      const res = await subscribe(plan.id);
      if (res.url) {
        await WebBrowser.openBrowserAsync(res.url);
        for (let i = 0; i < 8; i++) {
          const sub = await getSubscription();
          if (sub && (sub.status === "active" || sub.status === "trialing")) { await refresh(); setPayOpen(false); break; }
          await new Promise((r2) => setTimeout(r2, 1500));
        }
      } else setPayErr(res.error ? String(res.error) : "Couldn't start checkout.");
    } finally { setPayBusy(false); }
  };

  const cards = feed?.cards || [];
  const approvals = cards.filter((cd) => isReply(cd) && cd.status === "pending" && !hidden.has(cd.id));
  const pendingUrgent = cards.some((x) => x.type === "urgent" && x.status === "pending" && !hidden.has(x.id));
  const working = busy || thinking;
  const locName = feed?.context?.location?.name;
  const inMeeting = !!feed?.context?.in_meeting;
  const status = working ? "Working on it" : inMeeting ? "In a meeting" : locName && locName !== "nearby" ? `Near ${locName}` : "All quiet";
  const statusTone: Tone = working ? "accent" : inMeeting ? "neutral" : "muted";
  const subtitle = working ? "Thinking" : `${personalityLabel(settings.personality)}${settings.unfiltered ? " · Unfiltered" : ""}`;
  const memories = (feed?.memories || []).filter((m) => !hidden.has(m.id));
  const isPro = feed?.entitlement?.tier === "pro";

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="dark" />
      <View style={s.fill}>
        {tab === "aura" && (
          <AuraScreen feed={feed} pending={pending} thinking={thinking} notice={notice} busy={busy} draft={draft} setDraft={setDraft}
            onSend={send} onAct={act} onEdit={setEditCard} hidden={hidden} onClear={clearChatFlow} onDemo={() => setDemoOpen(true)}
            markState={working ? "thinking" : "idle"} subtitle={subtitle} focusKey={askFocus} />
        )}
        {tab === "today" && (
          <TodayScreen loaded={graphLoaded && rememberLoaded && !!feed} approvals={approvals} onAct={act} onEdit={setEditCard} busy={busy}
            scheduled={remember.scheduled} places={remember.places} onReminderDone={onReminderDone}
            promises={graph.promises} people={graph.people} onDone={donePromise} onOpenPerson={openPerson}
            onAsk={openChat} onRecord={() => setRecOpen(true)} onBrief={briefFlow} status={status} statusTone={statusTone} />
        )}
        {tab === "memory" && (
          <MemoryScreen loaded={graphLoaded && rememberLoaded && !!feed} memories={memories} people={graph.people} scheduled={remember.scheduled} places={remember.places}
            onTeach={captureNote} onForget={forget} onForgetAll={forgetAll} onOpenPerson={openPerson} onReminderDone={onReminderDone} />
        )}
        {tab === "you" && (
          <YouScreen settings={settings} onSettings={changeSettings} onUnfiltered={toggleUnfiltered} serverConnected={serverConnected}
            onConnect={connectFlow} isPro={isPro} onUpgrade={() => setPayOpen(true)} onSignOut={signOut} />
        )}
        <Toast text={toast?.text || null} action={toast?.undo ? "Undo" : undefined} onAction={undo} />
      </View>

      <TabBar tab={tab} onChange={go} badges={{ aura: pendingUrgent && tab !== "aura" }} />

      <PersonSheet person={person} onClose={() => setPerson(null)} onAct={askAura} />
      <EditDraftSheet card={editCard} onClose={() => setEditCard(null)} onSend={(card, body) => { setEditCard(null); act(card, "approve", body); }} />
      <ConfirmSheet visible={!!confirm} title={confirm?.title || ""} body={confirm?.body || ""} confirm={confirm?.confirm || "Confirm"}
        onClose={() => setConfirm(null)} onConfirm={() => { const run = confirm?.run; setConfirm(null); run?.(); }} />
      <AdultSheet visible={adultOpen} busy={adultBusy} onClose={() => setAdultOpen(false)} onConfirm={confirmAdult} />
      <ScenarioSheet visible={demoOpen} onClose={() => setDemoOpen(false)} onRun={runScenario} />
      <ProSheet visible={payOpen} onClose={() => setPayOpen(false)} onSubscribe={onSubscribe} busy={payBusy} error={payErr} />
      <CaptureMoment visible={recOpen} onClose={() => setRecOpen(false)} onCaptured={() => { refresh(); loadGraph(); }} />
    </SafeAreaView>
  );
}

function Splash() {
  return <View style={[s.fill, s.center]}><Mark size={48} /></View>;
}

export default function Root() {
  const [fontsLoaded] = useFonts(fontAssets);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [signupName, setSignupName] = useState<string | undefined>(undefined);
  useEffect(() => { loadSession().then((ok) => setAuthed(ok)).catch(() => setAuthed(false)); }, []);
  if (!fontsLoaded || authed === null) return <Splash />;
  if (!authed) return <AuthScreen onAuthed={(isNew, name) => { setSignupName(name); setOnboarding(isNew); setAuthed(true); }} />;
  if (onboarding) return <Onboarding initialName={signupName} onDone={() => setOnboarding(false)} />;
  return <AuraApp onSignOut={() => { setOnboarding(false); setAuthed(false); }} />;
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.canvas },
  center: { alignItems: "center", justifyContent: "center" },
});
