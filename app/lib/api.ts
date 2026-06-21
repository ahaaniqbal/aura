// Aura backend client — all traffic goes through auth:none Butterbase functions.
const APP = "app_6nromeez40uq";
export const API = `https://api.butterbase.ai/v1/${APP}/fn`;
// Aura's user id == the Butterbase app-user the integrations (Gmail, etc.) are connected under.
export const USER = "70268b41-7e66-4d80-a248-dcc0c004b197";

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

export type Memory = {
  id: string;
  text: string;
  kind: string;
  source: string;
  created_at: string;
};

export type Ctx = { in_meeting: boolean; location: any; status: string | null } | null;

export type Feed = {
  messages: Message[];
  cards: Card[];
  memories: Memory[];
  context: Ctx;
  connections: { toolkit: string; status: string }[];
};

async function post(path: string, body: any) {
  const r = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER, ...body }),
  });
  return r.json();
}

export async function getFeed(): Promise<Feed> {
  const r = await fetch(`${API}/feed?user_id=${USER}`);
  return r.json();
}

export const capture = (text: string, source = "chat") => post("capture", { text, source });
export const approve = (action_id: string, decision: "approve" | "decline" = "approve", edited_body?: string) =>
  post("approve", { action_id, decision, edited_body });
export const simulate = (scenario: string, extra: any = {}) => post("simulate", { scenario, ...extra });
export const addNote = (text: string) => post("note", { text });
export const syncEmail = () => post("sync_email", {});
export const setLocation = (lat: number, lng: number, place: string) => post("set_location", { lat, lng, place });
export const transcribe = async (audio_base64: string, mime = "audio/m4a"): Promise<string> => {
  try {
    const r = await fetch(`${API}/transcribe`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_base64, mime }),
    });
    const d = await r.json();
    return d.text || "";
  } catch (e) { return ""; }
};
export const connect = (toolkit: string) => post("connect", { toolkit });
export const getConnections = async (): Promise<string[]> => {
  try {
    const r = await fetch(`${API}/connections?user_id=${USER}`);
    const d = await r.json();
    return d.connected || [];
  } catch (e) { return []; }
};
