# Aura — your ambient AI, with taste

**One line:** Aura is a notes + chat app with an ambient brain — it remembers everything (HydraDB), works in the background, and only ever interrupts you to approve the things that matter.

Built at "Agents you Love" (Jun 21, 2026). Aiming: **Best Overall** (Memory/Context + Workflow + People-Love).

## The 90-second demo (on the iPhone)

1. **Connect tab** — show the orb + "connect your world" (Gmail, Calendar, Notion, Slack, WhatsApp, Bank). Tap a couple to connect. *"Aura plugs into your life."*
2. **Chat** — type: *"Sam's birthday is June 28th — he's obsessed with chocolate cake."* Aura replies in-voice and quietly stores it.
3. **Memory tab** — point at the stored memory: *"this lives in HydraDB — recalled the moment it's useful."*
4. **`✦ demo` → "Walk past the bakery."** Aura proactively: *"you're right by Tartine, and Sam's birthday's coming up — want me to grab a chocolate cake?"* with a 🧠 **from memory** chip. → **Approve** → *"ordered ✨ paid on your Aura card."* (memory → proactive → approval → action, end to end)
5. **`✦ demo` → "Urgent email."** Phone **buzzes (local notification)**; an URGENT card holds a reply drafted *in your voice*. → Approve → sent. *"It protects your attention — handles the rest, interrupts only when it counts."*

> Everything is one engine: `capture → remember → recall → decide → propose → approve → execute → learn`. The three flows are just config on it.

## Architecture

- **Expo (React Native)** app on iPhone — chat/notes/connect, animated "aura" orb, local-notification interrupt, live via 2s feed poll.
- **Butterbase** backend — Postgres (memories, cards, actions, context), serverless functions (`capture`, `simulate`, `approve`, `feed`), Claude (`claude-sonnet-4.6`) via the AI gateway, realtime. App id `app_6nromeez40uq`.
- **HydraDB** — memory of record (per-user via tenant/sub-tenant; `context.ingest` + `query`). Postgres mirror is the never-fail fallback.
- **AgentCard** (test mode) — the "pays, with your ok" capability. **Composio (via Butterbase integrations)** — the connect-your-tools layer (gmail/calendar/notion/slack).

## Why it wins

- **Memory/Context:** recall is visible and undeniable (the 🧠 chips + Memory tab), backed by HydraDB.
- **Workflow:** automate-then-approve — Aura does the work, you just tap.
- **People-Love:** real character (Poke-supercharged) + an elite, calm, pastel identity that lives up to the name.
