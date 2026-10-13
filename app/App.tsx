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
import { AdultSheet, AgentSheet, ReplySheet, ConfirmSheet, EditDraftSheet, McpSheet, MoneySheet, ProSheet, RoutineSheet, ScenarioKey, ScenarioSheet, TripSheet } from "./components/Sheets";
import Personalize from "./components/Personalize";
import { open as openUrl } from "./components/Results";
import { LookProvider } from "./components/look";
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
  simulate, subscribe, syncEmail, getProfile, forgetFact, ProfileGroup, getRoutines, updateRoutine, runRoutine, deleteRoutine, Routine,
  getMcpServers, addMcpServer, removeMcpServer, McpServer, getAgents, makeAgentCode, revokeAgent, replyAgent, PairedAgent, getMoney, MoneySummary, getTrips, Trip, deleteAccount,
} from "./lib/api";
import { AuraLook, DEFAULT_LOOK } from "./lib/auras";

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

function AuraApp({ onSignOut, onLook }: { onSignOut: () => void; onLook: (l: AuraLook) => void }) {
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
  const [profile, setProfile] = useState<ProfileGroup[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineOpen, setRoutineOpen] = useState<Routine | null>(null);
  const [routineRunning, setRoutineRunning] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripOpen, setTripOpen] = useState<Trip | null>(null);
  const [money, setMoney] = useState<MoneySummary | null>(null);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [mcp, setMcp] = useState<McpServer[]>([]);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [agents, setAgents] = useState<PairedAgent[]>([]);
  const [pairing, setPairing] = useState<{ code: string; endpoint: string } | null>(null);
  const [lookOpen, setLookOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ kid: string; from: string; question: string } | null>(null);
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
        else if (decision === "approve") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (res?.result?.open_url) openUrl(res.result.open_url); // a table: finish booking on the restaurant's page
        }
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

  // ---------- what Aura has learned, routines, trips, money ----------
  const loadExtras = useCallback(() => {
    getProfile().then(setProfile).catch(() => {});
    getRoutines().then(setRoutines).catch(() => {});
    getTrips().then(setTrips).catch(() => {});
    getMoney().then(setMoney).catch(() => {});
  }, []);
  const forgetLearned = (id: string) => {
    const prev = profile;
    ease();
    setProfile(prev.map((g) => ({ ...g, items: g.items.filter((x) => x.id !== id) })));
    withUndo("Forgotten", async () => {
      try { await forgetFact(id); } catch (e) { setProfile(prev); flash("Couldn't forget that. Try again."); }
    }, () => setProfile(prev));
  };
  const toggleRoutine = async (r: Routine, on: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const next = { ...r, active: on };
    // keep the sheet in step only if it's the one open; a switch on Today never opens it
    const sync = (v: Routine) => { setRoutines((xs) => xs.map((x) => (x.id === r.id ? v : x))); setRoutineOpen((cur) => (cur && cur.id === r.id ? v : cur)); };
    sync(next);
    const res: any = await updateRoutine(r.id, { active: on });
    if (!res?.routine) { sync(r); flash("Couldn't change that. Try again."); }
    else { sync(res.routine); flash(on ? `${r.title} is on.` : `${r.title} is off.`); }
  };
  const runRoutineNow = async (r: Routine) => {
    setRoutineRunning(true);
    try { await runRoutine(r.id); setRoutineOpen(null); setTab("aura"); await refresh(); }
    catch (e) { flash("Couldn't run it just now. Try again."); }
    finally { setRoutineRunning(false); }
  };
  const editRoutine = (r: Routine) => { setRoutineOpen(null); setDraft(`Change my ${r.title.toLowerCase()} routine: `); openChat(); };
  const removeRoutine = (r: Routine) => setConfirm({
    title: `Delete ${r.title}?`, body: "Aura stops doing this. You can always ask for it again.", confirm: "Delete routine",
    run: async () => { setRoutineOpen(null); setRoutines((xs) => xs.filter((x) => x.id !== r.id)); await deleteRoutine(r.id).catch(() => {}); },
  });
  const addMcp = async (url: string, token: string): Promise<string | null> => {
    const res = await addMcpServer(url, token || undefined);
    if (!res.ok) return res.error || "Couldn't connect.";
    setMcpOpen(false); setMcp(await getMcpServers()); flash(`${res.server?.name || "Server"} is connected.`);
    return null;
  };
  const removeMcp = (m: McpServer) => setConfirm({
    title: `Disconnect ${m.name}?`, body: "Aura won't be able to use its tools anymore.", confirm: "Disconnect",
    run: async () => { setMcp((xs) => xs.filter((x) => x.id !== m.id)); await removeMcpServer(m.id).catch(() => {}); },
  });
  const pairAgent = async () => {
    Haptics.selectionAsync().catch(() => {});
    const p = await makeAgentCode();
    if (p) setPairing(p); else flash("Couldn't make a code. Try again.");
  };
  const unpairAgent = (a: PairedAgent) => setConfirm({
    title: `Remove ${a.label}?`, body: "It loses access right away, including any permission you gave it.", confirm: "Remove agent",
    run: async () => { setAgents((xs) => xs.filter((x) => x.id !== a.id)); await revokeAgent(a.id).catch(() => {}); },
  });
  const saveLook = async (look: AuraLook) => {
    const prev = settings.look;
    setLookOpen(false); onLook(look); setSettings({ ...settings, look });
    const res = await saveSettings({ look });
    if (!res.ok) { onLook(prev); setSettings({ ...settings, look: prev }); flash("Couldn't save the new look. Try again."); }
  };
  const deleteAccountFlow = () => setConfirm({
    title: "Delete your account?", body: "Aura erases everything it knows about you: your conversation, memory, people, routines, trips, money and connected agents. This can't be undone.", confirm: "Delete everything",
    run: async () => {
      const ok = await deleteAccount();
      if (!ok) { flash("Couldn't delete your account. Try again."); return; }
      try { await logout(); } catch (e) {}
      onSignOut();
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
    getSettings().then((st) => { setSettings(st); onLook(st.look); }).catch(() => {});
    getConnections().then(setServerConnected).catch(() => {});
    loadExtras();
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

  useEffect(() => { if (tab === "today" || tab === "memory") { loadGraph(); loadRemember(); loadExtras(); } }, [tab, loadGraph, loadRemember]);
  useEffect(() => {
    if (tab !== "you") return;
    getConnections().then(setServerConnected).catch(() => {});
    getSettings().then(setSettings).catch(() => {});
    getMcpServers().then(setMcp).catch(() => {});
    getAgents().then(setAgents).catch(() => {});
  }, [tab]);

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
    const msg = text.trim(); if (!msg || sendingRef.current) return;
    sendingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const tempId = "t" + Date.now();
    setTab("aura"); setPending((p) => [...p, { id: tempId, content: msg }]);
    setBusy(true); setThinking(true); setNotice(null);
    try { await agent(msg); await refresh(); await loadGraph(); }
    catch (e) { setNotice(OFFLINE); }
    finally { sendingRef.current = false; setPending((p) => p.filter((x) => x.id !== tempId)); setThinking(false); setBusy(false); }
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
            onSend={send} onAsk={askAura} onReplyAgent={setReplyTo} onAct={act} onEdit={setEditCard} hidden={hidden} onClear={clearChatFlow} onDemo={() => setDemoOpen(true)}
            markState={working ? "thinking" : "idle"} subtitle={subtitle} focusKey={askFocus} />
        )}
        {tab === "today" && (
          <TodayScreen loaded={graphLoaded && rememberLoaded && !!feed} approvals={approvals} onAct={act} onEdit={setEditCard} busy={busy}
            scheduled={remember.scheduled} places={remember.places} onReminderDone={onReminderDone}
            promises={graph.promises} people={graph.people} onDone={donePromise} onOpenPerson={openPerson}
            onAsk={openChat} onRecord={() => setRecOpen(true)} onBrief={briefFlow} status={status} statusTone={statusTone}
            routines={routines} connected={serverConnected} onRoutine={setRoutineOpen} onToggleRoutine={toggleRoutine} onConnect={connectFlow}
            trips={trips} onTrip={setTripOpen} money={money} onMoney={() => setMoneyOpen(true)} />
        )}
        {tab === "memory" && (
          <MemoryScreen loaded={graphLoaded && rememberLoaded && !!feed} memories={memories} profile={profile} people={graph.people} scheduled={remember.scheduled} places={remember.places}
            onTeach={captureNote} onForget={forget} onForgetFact={forgetLearned} onForgetAll={forgetAll} onOpenPerson={openPerson} onReminderDone={onReminderDone} />
        )}
        {tab === "you" && (
          <YouScreen settings={settings} onSettings={changeSettings} onUnfiltered={toggleUnfiltered} serverConnected={serverConnected}
            onConnect={connectFlow} isPro={isPro} onUpgrade={() => setPayOpen(true)} onSignOut={signOut} onPersonalize={() => setLookOpen(true)}
            mcp={mcp} onAddMcp={() => setMcpOpen(true)} onRemoveMcp={removeMcp} agents={agents} onPairAgent={pairAgent} onRevokeAgent={unpairAgent} onDeleteAccount={deleteAccountFlow} />
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
      <RoutineSheet routine={routineOpen} onClose={() => setRoutineOpen(null)} onToggle={toggleRoutine} onRun={runRoutineNow} onEdit={editRoutine} onDelete={removeRoutine} running={routineRunning} />
      <TripSheet trip={tripOpen} onClose={() => setTripOpen(null)} onAsk={(x) => { setTripOpen(null); setDraft(x); openChat(); }} />
      <MoneySheet money={moneyOpen ? money : null} onClose={() => setMoneyOpen(false)} onAsk={(x) => { setMoneyOpen(false); if (x.endsWith(" ")) { setDraft(x); openChat(); } else askAura(x); }} />
      <McpSheet visible={mcpOpen} onClose={() => setMcpOpen(false)} onAdd={addMcp} />
      <ReplySheet to={replyTo} onClose={() => setReplyTo(null)} onSend={async (b) => { const ok = replyTo ? await replyAgent(replyTo.kid, b) : false; flash(ok ? `Sent to ${replyTo?.from}.` : "That didn't send. Try again."); return ok; }} />
      <AgentSheet pairing={pairing} onClose={() => { setPairing(null); getAgents().then(setAgents).catch(() => {}); }} />
      {lookOpen ? <Personalize visible={lookOpen} initial={settings.look} onSave={saveLook} onClose={() => setLookOpen(false)} /> : null}
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
  const [look, setLook] = useState<AuraLook>(DEFAULT_LOOK);
  useEffect(() => { loadSession().then((ok) => setAuthed(ok)).catch(() => setAuthed(false)); }, []);
  let screen: React.ReactNode;
  if (!fontsLoaded || authed === null) screen = <Splash />;
  else if (!authed) screen = <AuthScreen onAuthed={(isNew, name) => { setSignupName(name); setOnboarding(isNew); setAuthed(true); }} />;
  else if (onboarding) screen = <Onboarding initialName={signupName} onLook={setLook} onDone={() => setOnboarding(false)} />;
  else screen = <AuraApp onLook={setLook} onSignOut={() => { setOnboarding(false); setAuthed(false); setLook(DEFAULT_LOOK); }} />;
  return <LookProvider value={look}>{screen}</LookProvider>;
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.canvas },
  center: { alignItems: "center", justifyContent: "center" },
});
