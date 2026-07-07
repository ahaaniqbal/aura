// Aura backend client. Every request carries the user's JWT; the backend derives the
// user from the token (ctx.user.id) and enforces per-user RLS. No hardcoded user.
import * as SecureStore from "expo-secure-store";

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
  role: "user" | "aura" | "system";
  content: string;
  kind: string;
  card_id: string | null;
  created_at: string;
};

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
export const setLocation = (lat: number, lng: number, place: string) => post("set_location", { lat, lng, place });
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
export const closePromise = (text: string) => post("graph", { op: "close_promise", text });
export const registerDevice = (token: string, platform: string) => post("register_device", { token, platform });

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
