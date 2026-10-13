// Per-user assistant settings: Aura's personality and look, unfiltered mode, and custom instructions.
// Unfiltered can only be switched on after the user confirms they are 18 or older; the
// confirmation time is stored. Also lets the user delete a memory. JWT-secured; filters by ctx.user.id.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

const PERSONALITIES = ["witty", "warm", "blunt", "chill"];
// Aura's look: which gradient avatar it wears, as the app's picker sets it. Stored after a shape check.
const LOOK_KEYS: Record<string, RegExp> = { avatar: /^[a-z]{2,12}$/ };
function cleanLook(x: any): any {
  if (!x || typeof x !== "object") return null;
  const out: any = {};
  for (const k of Object.keys(LOOK_KEYS)) if (typeof x[k] === "string" && LOOK_KEYS[k].test(x[k])) out[k] = x[k];
  return Object.keys(out).length ? out : null;
}

async function ensure(ctx: any) {
  await ctx.db.query(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id text PRIMARY KEY,
    personality text NOT NULL DEFAULT 'witty',
    unfiltered boolean NOT NULL DEFAULT false,
    adult_ack_at timestamptz,
    instructions text,
    updated_at timestamptz DEFAULT now()
  )`);
  await ctx.db.query("ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS look jsonb");
}

async function read(ctx: any, userId: string) {
  const r = await ctx.db.query("SELECT personality, unfiltered, adult_ack_at, instructions, look FROM user_settings WHERE user_id=$1", [userId]);
  const row = r.rows[0] || {};
  return {
    personality: PERSONALITIES.includes(row.personality) ? row.personality : "witty",
    unfiltered: !!row.unfiltered,
    adult_confirmed: !!row.adult_ack_at,
    instructions: row.instructions || "",
    look: row.look || null,
    unfiltered_available: !!(ctx.env.UNBLOCK_API_KEY && ctx.env.UNBLOCK_MODEL),
  };
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const op = body.op || "get";
    await ensure(ctx);

    if (op === "get") return json({ ok: true, settings: await read(ctx, userId) });

    if (op === "set") {
      const cur = await read(ctx, userId);
      const personality = PERSONALITIES.includes(body.personality) ? body.personality : cur.personality;
      const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 1500) : cur.instructions;
      const confirmAdult = body.confirm_adult === true;
      let unfiltered = typeof body.unfiltered === "boolean" ? body.unfiltered : cur.unfiltered;
      // unfiltered needs an explicit 18+ confirmation, either now or previously recorded
      if (unfiltered && !cur.adult_confirmed && !confirmAdult) return json({ ok: false, error: "adult_confirmation_required" }, 400);
      await ctx.db.query(
        `INSERT INTO user_settings (user_id, personality, unfiltered, adult_ack_at, instructions, updated_at)
         VALUES ($1,$2,$3,CASE WHEN $4 THEN now() ELSE NULL END,$5,now())
         ON CONFLICT (user_id) DO UPDATE SET personality=$2, unfiltered=$3,
           adult_ack_at=COALESCE(user_settings.adult_ack_at, CASE WHEN $4 THEN now() ELSE NULL END),
           instructions=$5, updated_at=now()`,
        [userId, personality, unfiltered, confirmAdult, instructions],
      );
      if (body.look !== undefined) {
        const look = cleanLook(body.look);
        if (look) await ctx.db.query("UPDATE user_settings SET look=$2, updated_at=now() WHERE user_id=$1", [userId, JSON.stringify(look)]);
      }
      return json({ ok: true, settings: await read(ctx, userId) });
    }

    if (op === "forget") {
      const id = String(body.id || "");
      if (!id) return json({ error: "id required" }, 400);
      const r = await ctx.db.query("DELETE FROM memories WHERE id=$1 AND user_id=$2 RETURNING id", [id, userId]);
      return json({ ok: true, deleted: r.rows.length });
    }

    if (op === "forget_all") {
      const r = await ctx.db.query("DELETE FROM memories WHERE user_id=$1 AND kind IS DISTINCT FROM 'task' RETURNING id", [userId]);
      // the memory graph too (memory.ts), when it exists
      await ctx.db.query("UPDATE mem_edges SET status='forgotten', valid_to=now() WHERE user_id=$1 AND status='live'", [userId]).catch(() => {});
      await ctx.db.query("DELETE FROM mem_chunks WHERE user_id=$1", [userId]).catch(() => {});
      return json({ ok: true, deleted: r.rows.length });
    }

    if (op === "delete_account") {
      // erase everything Aura holds for this person; the app signs them out afterwards
      if (body.confirm !== "delete") return json({ error: "confirmation required" }, 400);
      const tables = ["messages", "memories", "cards", "actions", "connections", "context_state", "devices", "mem_chunks", "mem_edges", "mem_nodes", "mem_contradictions",
        "expenses", "budgets", "trips", "routines", "mcp_servers", "a2a_codes", "a2a_agents", "a2a_consents", "a2a_messages", "a2a_receipts", "entitlements", "user_settings"];
      for (const t of tables) await ctx.db.query(`DELETE FROM ${t} WHERE user_id=$1`, [userId]).catch(() => {});
      await ctx.db.query("DELETE FROM profiles WHERE id=$1", [userId]).catch(() => {});
      return json({ ok: true });
    }

    return json({ error: "unknown op" }, 400);
  } catch (e: any) {
    console.error("settings error:", String(e), e?.stack);
    return json({ error: String(e) }, 500);
  }
}
