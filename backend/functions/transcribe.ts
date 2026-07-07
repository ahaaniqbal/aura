function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    if (!ctx.user?.id) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const b64 = body.audio_base64;
    if (!b64) return json({ error: "audio_base64 required" }, 400);
    const mime = body.mime || "audio/m4a";
    const fname = body.filename || "audio.m4a";
    const key = ctx.env.OPENAI_API_KEY;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const form = new FormData();
    form.append("file", blob, fname);
    form.append("model", "whisper-1");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    const d = await r.json();
    if (!r.ok) { console.error("whisper error:", JSON.stringify(d)); return json({ error: d?.error?.message || "transcription failed" }, r.status); }
    return json({ text: (d.text || "").trim() });
  } catch (e: any) {
    console.error("transcribe error:", String(e));
    return json({ error: String(e) }, 500);
  }
}