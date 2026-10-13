// Aura backend client. Every request carries the user's JWT; the backend derives the
// user from the token (ctx.user.id) and enforces per-user RLS. No hardcoded user.
import * as SecureStore from "expo-secure-store";
import { AuraLook, DEFAULT_LOOK, normalizeLook } from "./faces";

const APP = "app_6nromeez40uq";
export const API = `https://api.butterbase.ai/v1/${APP}/fn`;
const AUTH = `https://api.butterbase.ai/auth/${APP}`;

export type Card = {
  id: string;
  type: "suggestion" | "proactive" | "draft_held" | "urgent" | "reminder";
  title: string;
  body: string;
  status: "pending" | "approved" | "declined" | "dismissed" | "done";
  action_id: string | null;
  memory_refs: string[] | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  role: "user" | "aura" | "system" | "agent";
  content: string;
  kind: string;
  card_id: string | null;
  created_at: string;
  attachments?: Attachment[] | null;
};

// Rich results the agent attaches to a reply: what it found, shown as UI instead of a wall of text.
export type Place = { id: string; name: string; address: string; kind: string; rating: number | null; reviews: number | null; price: string | null; open_now: boolean | null; phone: string; website: string | null; maps_url: string | null; summary: string | null; links: { label: string; url: string }[] };
export type FlightSlice = { from: string; to: string; depart: string; arrive: string; minutes: number; stops: number; flights: string[] };
export type FlightOffer = { id: string; total: string; currency: string; airline: string; airline_code: string; expires_at: string; slices: FlightSlice[] };
export type TripDay = { date?: string; title?: string; items?: { time?: string; text: string }[] };
export type Trip = { id: string; title: string; destination: string | null; start_date: string | null; end_date: string | null; summary: string | null; plan: TripDay[]; bookings?: any[]; status?: string };
export type MoneySummary = { month: string; total: number; last_month: number; categories: { category: string; spent: number; count: number; budget: number | null }[]; top_merchants: { merchant: string; spent: number }[]; recurring: { merchant: string; amount: number; months: number; last: string }[] };
export type Attachment =
  | { type: "places"; query: string; near: string | null; party: number | null; when: string | null; items: Place[] }
  | { type: "flights"; from: string; to: string; depart: string; return: string | null; offers: FlightOffer[]; search_url: string }
  | { type: "links"; query: string; items: { title: string; url: string; source: string; snippet: string }[] }
  | { type: "trip"; trip: Trip }
  | { type: "money"; summary: MoneySummary }
  | { type: "notes"; title: string; summary: string; decisions: string[]; action_items: { text: string; owner: string }[] }
  | { type: "routine"; title: string }
  | { type: "agent"; from: string; kid: string; kind: "tell" | "ask" };

export type Memory = { id: string; text: string; kind: string; source: string; created_at: string };
export type Ctx = { in_meeting: boolean; location: any; status: string | null } | null;
export type Feed = {
  messages: Message[];
  cards: Card[];
  memories: Memory[];
  context: Ctx;
  connections: { toolkit: string; status: string }[];
  entitlement?: { tier: string; status?: string };
};

// ---------------- session / tokens ----------------
const AT_KEY = "aura_at", RT_KEY = "aura_rt";
let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadSession(): Promise<boolean> {
  try {
    accessToken = await SecureStore.getItemAsync(AT_KEY);
    refreshToken = await SecureStore.getItemAsync(RT_KEY);
  } catch (e) {}
  return !!accessToken;
}
export function isAuthed(): boolean { return !!accessToken; }
async function saveTokens(at: string, rt: string) {
  accessToken = at; refreshToken = rt;
  try { await SecureStore.setItemAsync(AT_KEY, at); await SecureStore.setItemAsync(RT_KEY, rt); } catch (e) {}
}
export async function logout(): Promise<void> {
  try { if (accessToken) await fetch(`${AUTH}/logout`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
  accessToken = null; refreshToken = null;
  try { await SecureStore.deleteItemAsync(AT_KEY); await SecureStore.deleteItemAsync(RT_KEY); } catch (e) {}
}
async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const r = await fetch(`${AUTH}/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
    if (!r.ok) return false;
    const d = await r.json();
    if (d.access_token) { await saveTokens(d.access_token, d.refresh_token || refreshToken); return true; }
  } catch (e) {}
  return false;
}

// ---------------- auth ----------------
export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${AUTH}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.access_token) { await saveTokens(d.access_token, d.refresh_token); return { ok: true }; }
    return { ok: false, error: d.error || d.message || "couldn't sign in, check your details." };
  } catch (e) { return { ok: false, error: "network error, try again." }; }
}
export async function signup(email: string, password: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${AUTH}/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, display_name: name || undefined }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 201 || r.ok) return await login(email, password);
    return { ok: false, error: d.error || d.message || "couldn't create your account." };
  } catch (e) { return { ok: false, error: "network error, try again." }; }
}

// ---------------- authed requests ----------------
function withAuth(h?: Record<string, string>): Record<string, string> {
  const base = { ...(h || {}) };
  if (accessToken) base.Authorization = `Bearer ${accessToken}`;
  return base;
}
async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  let r = await fetch(url, { ...init, headers: withAuth(init.headers as any) });
  if (r.status === 401 && (await tryRefresh())) r = await fetch(url, { ...init, headers: withAuth(init.headers as any) });
  return r;
}
async function post(path: string, body: any) {
  const r = await authedFetch(`${API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  return r.json().catch(() => ({}));
}

export async function getFeed(): Promise<Feed> {
  const r = await authedFetch(`${API}/feed`, { method: "GET" });
  return r.json();
}
export const agent = (text: string, source = "chat") => post("agent", { text, source });
export const approve = (action_id: string, decision: "approve" | "decline" = "approve", edited_body?: string) =>
  post("approve", { action_id, decision, edited_body });
export const simulate = (scenario: string, extra: any = {}) => post("simulate", { scenario, ...extra });
export const addNote = (text: string) => post("note", { text });
export const syncEmail = () => post("sync_email", {});
export const clearChat = () => post("reset", { keep_memories: true });
export const setLocation = async (lat: number, lng: number, place: string): Promise<{ surfaced: any[] }> => {
  try { const d = await post("set_location", { lat, lng, place }); return { surfaced: d?.surfaced || [] }; }
  catch (e) { return { surfaced: [] }; }
};
export const setTimezone = (timezone: string) => post("set_timezone", { timezone });
export const transcribe = async (audio_base64: string, mime = "audio/m4a"): Promise<string> => {
  try {
    const r = await authedFetch(`${API}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio_base64, mime }) });
    const d = await r.json();
    return d.text || "";
  } catch (e) { return ""; }
};
export const connect = (toolkit: string) => post("connect", { toolkit });
export const getConnections = async (): Promise<string[]> => {
  try {
    const r = await authedFetch(`${API}/connections`, { method: "GET" });
    const d = await r.json();
    return d.connected || [];
  } catch (e) { return []; }
};

// ---------------- relationship graph (Neo4j) ----------------
export type GraphPerson = { person: string; org: string | null; relation: string | null; birthday: string | null; care: string | null; care_at: number | null; wants: string[]; updated_at: number | null; touch_count: number; touches: number[]; topics: string[]; open_promises: string[] };
export type PromiseItem = { text: string; person: string | null; direction: string | null; due: string | null };
export const getGraph = async (): Promise<{ people: GraphPerson[]; promises: PromiseItem[] }> => {
  try {
    const [g, p] = await Promise.all([post("graph", { op: "graph" }), post("graph", { op: "promises" })]);
    return { people: g?.nodes || [], promises: p?.promises || [] };
  } catch (e) { return { people: [], promises: [] }; }
};
export const getBrief = () => post("brief", {});
// emotional pulse: the user's own state over time (one-tap check-ins + self-mentions in capture)
export type PulseDay = { day: string; valence: number | null };
export type Pulse = { entries: any[]; days: PulseDay[]; todayLogged: boolean; avg7: number | null; reflection: string; count: number };
export const getPulse = async (): Promise<Pulse> => {
  try { const d = await post("pulse", { op: "recent" }); return { entries: d?.entries || [], days: d?.days || [], todayLogged: !!d?.todayLogged, avg7: d?.avg7 ?? null, reflection: d?.reflection || "", count: d?.count || 0 }; }
  catch (e) { return { entries: [], days: [], todayLogged: false, avg7: null, reflection: "", count: 0 }; }
};
export const logPulse = (valence: number, mood: string) => post("pulse", { op: "log", valence, mood, source: "app" });
// ambient capture: a conversation transcript -> people + promises + emotional weight -> graph + warm summary
export const capture = (text: string) => post("capture", { text });
// notepad: a quick captured thought -> parsed + filed + scheduled, with "here's what i caught" chips
export type Chip = { label: string; tone: string };
export type CaptureResult = { summary: string; chips: Chip[]; reminders: number; people: number; promises: number };
export const captureThought = async (text: string): Promise<CaptureResult> => {
  const d = await post("capture", { text, quick: true });
  return { summary: d?.summary || "got it, i've remembered that.", chips: d?.chips || [], reminders: d?.reminders || 0, people: d?.people || 0, promises: d?.promises || 0 };
};
export type Reminder = { id: string; text: string; due_at: string; day: string | null; label: string; bucket: string };
export type PlaceReminder = { id: string; text: string; place: string };
export type Remembered = { id: string; text: string; created_at: string };
export const getRemember = async (): Promise<{ scheduled: Reminder[]; places: PlaceReminder[]; remembered: Remembered[] }> => {
  try { const d = await post("remember", { op: "list" }); return { scheduled: d?.scheduled || [], places: d?.places || [], remembered: d?.remembered || [] }; }
  catch (e) { return { scheduled: [], places: [], remembered: [] }; }
};
export const rememberDone = (id: string) => post("remember", { op: "done", id });
export const closePromise = (text: string) => post("graph", { op: "close_promise", text });
export const registerDevice = (token: string, platform: string) => post("register_device", { token, platform });

// ---------------- assistant settings: personality, unfiltered mode, instructions ----------------
export type Personality = "witty" | "warm" | "blunt" | "chill";
export type Settings = { personality: Personality; unfiltered: boolean; adult_confirmed: boolean; instructions: string; unfiltered_available: boolean; look: AuraLook };
export const DEFAULT_SETTINGS: Settings = { personality: "witty", unfiltered: false, adult_confirmed: false, instructions: "", unfiltered_available: false, look: DEFAULT_LOOK };
const withLook = (x: Settings): Settings => ({ ...x, look: normalizeLook(x.look) });
export const getSettings = async (): Promise<Settings> => {
  try { const d = await post("settings", { op: "get" }); return withLook({ ...DEFAULT_SETTINGS, ...(d?.settings || {}) }); }
  catch (e) { return DEFAULT_SETTINGS; }
};
export const saveSettings = async (patch: { personality?: Personality; unfiltered?: boolean; confirm_adult?: boolean; instructions?: string; look?: AuraLook }): Promise<{ ok: boolean; settings?: Settings; error?: string }> => {
  try { const d = await post("settings", { op: "set", ...patch }); return d?.ok ? { ok: true, settings: withLook({ ...DEFAULT_SETTINGS, ...d.settings }) } : { ok: false, error: d?.error || "failed" }; }
  catch (e) { return { ok: false, error: "network" }; }
};
export const forgetMemory = (id: string) => post("settings", { op: "forget", id });
export const forgetAllMemories = () => post("settings", { op: "forget_all" });

// ---------------- payments (Butterbase Stripe Connect) ----------------
const BILLING = `https://api.butterbase.ai/v1/${APP}/billing`;
export type Plan = { id: string; name: string; priceCents: number; interval: string; features?: string[] };
export type Subscription = { status: string; planId?: string; currentPeriodEnd?: string } | null;
export const getPlans = async (): Promise<Plan[]> => {
  try { const r = await fetch(`${BILLING}/plans`); const d = await r.json(); return (Array.isArray(d) ? d : d?.plans) || []; } catch (e) { return []; }
};
export const getSubscription = async (): Promise<Subscription> => {
  try { const r = await authedFetch(`${BILLING}/subscription`, { method: "GET" }); const d = await r.json(); return (d?.subscription ?? d) || null; } catch (e) { return null; }
};
export const subscribe = async (planId: string, successUrl?: string, cancelUrl?: string): Promise<{ url?: string; error?: string }> => {
  try {
    const r = await authedFetch(`${BILLING}/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, successUrl, cancelUrl }) });
    const d = await r.json();
    if (r.ok && d?.url) return { url: d.url };
    return { error: d?.error?.message || d?.error || "could not start checkout" };
  } catch (e) { return { error: "network error" }; }
};
export const cancelSub = async (): Promise<boolean> => {
  try { const r = await authedFetch(`${BILLING}/cancel`, { method: "POST" }); return r.ok; } catch (e) { return false; }
};

// ---------------- memory graph (Kaeva port): what Aura knows, grouped ----------------
export type ProfileGroup = { key: string; label: string; items: { id: string; text: string; target: string | null; relation?: string; context: string | null; detail?: string | null }[] };
export const getProfile = async (): Promise<ProfileGroup[]> => {
  try { const d = await post("memory", { op: "profile" }); return d?.groups || []; } catch (e) { return []; }
};
export const forgetFact = (id: string) => post("memory", { op: "forget", id });

// ---------------- routines ----------------
export type Routine = { id: string; kind: string; title: string; blurb: string | null; prompt: string; cadence: string; at: string; weekday: number | null; needs: string | null; active: boolean; last_run_at: string | null; next_run_at: string | null; last_result: string | null };
export const getRoutines = async (): Promise<Routine[]> => {
  try { const d = await post("routines", { op: "list" }); return d?.routines || []; } catch (e) { return []; }
};
export const updateRoutine = (id: string, patch: Partial<Pick<Routine, "active" | "at" | "cadence" | "title" | "prompt" | "weekday">>) => post("routines", { op: "update", id, ...patch });
export const createRoutine = (r: { title: string; prompt: string; cadence: string; at: string; weekday?: number }) => post("routines", { op: "create", ...r });
export const runRoutine = (id: string) => post("routines", { op: "run", id });
export const deleteRoutine = (id: string) => post("routines", { op: "delete", id });

// ---------------- apps over MCP ----------------
export type McpServer = { id: string; name: string; url: string; status: string; last_error: string | null; tools: { name: string; description: string; read_only: boolean }[]; has_token: boolean };
export const getMcpServers = async (): Promise<McpServer[]> => {
  try { const d = await post("mcp", { op: "list" }); return d?.servers || []; } catch (e) { return []; }
};
export const addMcpServer = async (url: string, token?: string, name?: string): Promise<{ ok: boolean; server?: McpServer; error?: string }> => {
  try { const d = await post("mcp", { op: "add", url, token, name }); return d?.ok ? { ok: true, server: d.server } : { ok: false, error: d?.error || "Couldn't connect." }; }
  catch (e) { return { ok: false, error: "Can't reach Aura right now." }; }
};
export const removeMcpServer = (id: string) => post("mcp", { op: "remove", id });

// ---------------- agents (Kaeva A2A over MCP) ----------------
export type PairedAgent = { id: string; label: string; created_at: string; last_seen: string | null; recall_until: string | null };
export const getAgents = async (): Promise<PairedAgent[]> => {
  try { const d = await post("a2a", { op: "agents" }); return d?.agents || []; } catch (e) { return []; }
};
export const makeAgentCode = async (label?: string): Promise<{ code: string; endpoint: string } | null> => {
  try { const d = await post("a2a", { op: "code", label }); return d?.code ? { code: d.code, endpoint: d.endpoint } : null; } catch (e) { return null; }
};
export const revokeAgent = (id: string) => post("a2a", { op: "revoke", id });
export const replyAgent = async (id: string, body: string): Promise<boolean> => {
  try { const d = await post("a2a", { op: "reply", id, body }); return !!d?.ok; } catch (e) { return false; }
};

// ---------------- money and trips ----------------
export const getMoney = async (): Promise<MoneySummary | null> => {
  try { const d = await post("money", { op: "summary" }); return d?.ok ? d : null; } catch (e) { return null; }
};
export const getTrips = async (): Promise<Trip[]> => {
  try { const d = await post("travel", { op: "trips" }); return d?.trips || []; } catch (e) { return []; }
};

export const deleteAccount = async (): Promise<boolean> => {
  try { const d = await post("settings", { op: "delete_account", confirm: "delete" }); return !!d?.ok; } catch (e) { return false; }
};
