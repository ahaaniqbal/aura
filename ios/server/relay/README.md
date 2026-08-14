# Aura relay

A single Cloudflare Worker that sits between the Aura iOS app and Google
Gemini's OpenAI-compatible endpoint. The app never sees the Gemini API key;
instead it authenticates each request with a StoreKit 2 `jwsRepresentation`,
which the Worker verifies cryptographically against the pinned Apple Root
CA-G3 before forwarding the chat request.

```
Aura app ──(JWS + OpenAI chat body)──▶ aura-relay ──(GEMINI_API_KEY)──▶ Gemini
```

## What the Worker enforces

- **Route**: only `POST /v1/chat`. Anything else gets 401/404/405.
- **Auth**: `Authorization: Bearer <jwsRepresentation>`. The JWS is verified
  for real — ES256 signature by the leaf certificate, issuer signatures up
  the x5c chain, chain anchored at the embedded Apple Root CA-G3 bytes.
- **Entitlement**: `bundleId == com.danish.aura`, `productId` is
  `aura.plus.yearly` or `aura.pro.yearly`, `expiresDate` in the future,
  no `revocationDate`.
- **Rate limit**: 300 requests per subscriber (`originalTransactionId`) per
  UTC day, tracked in the `AURA_KV` namespace. Over the limit → 429.
- **Model pinning**: any client-supplied `model` is stripped; the Worker
  always sends `MODEL` (default `gemini-3.1-flash-lite`).
- **Privacy**: message content is never logged.

## Deploy

```sh
# 1. Install and log in to Cloudflare
npm i -g wrangler
wrangler login

# 2. Create the KV namespace for rate limiting, then paste the printed id
#    into wrangler.toml (replace REPLACE_WITH_YOUR_KV_NAMESPACE_ID)
wrangler kv namespace create AURA_KV

# 3. Store the Gemini API key as a secret (from https://aistudio.google.com)
wrangler secret put GEMINI_API_KEY

# 4. Ship it
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://aura-relay.<your-subdomain>.workers.dev`. Paste it into
`Aura/Config.swift` as `relayURL` (the app appends `/v1/chat`).

## Smoke test

Grab a real `jwsRepresentation` from a device with an active subscription
(e.g. print `verificationResult.jwsRepresentation` in the Aura purchase flow,
or copy it from the Xcode console), then:

```sh
JWS="eyJhbGciOiJFUzI1NiIsIng1YyI6...paste the whole token..."

curl -s https://aura-relay.<your-subdomain>.workers.dev/v1/chat \
  -H "Authorization: Bearer $JWS" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are Aura, a warm ambient assistant."},
      {"role": "user", "content": "Kal Ammi ka birthday hai, kya gift theek rahega?"}
    ],
    "max_tokens": 256,
    "temperature": 0.7
  }'
```

Expected results:

- Valid subscription → Gemini's JSON completion, passed through unchanged.
- No/garbage token → `401 {"error":{"message":"Invalid or expired subscription token."}}`
- 301st request of the day → `429`.
- Sandbox tokens (from TestFlight / StoreKit testing in Xcode) are signed by
  the same Apple root, so they verify too — convenient for testing, see
  hardening notes if you want to lock that down.

## Cost notes

- **Cloudflare**: the Workers free tier (100k requests/day) and the KV free
  tier comfortably cover this workload at launch. The Worker itself costs
  nothing until Aura has serious traffic.
- **Gemini**: use a **paid-tier** Gemini API key from day one, not the free
  tier. Google's terms allow them to train on free-tier API data — Aura
  relays users' personal conversations (people, birthdays, promises), so
  that is not acceptable for even the first real user. `gemini-3.1-flash-lite`
  on the paid tier is cheap enough that 300 requests/day per subscriber is a
  rounding error against the 2000/5000 INR yearly price.

## Hardening (honest notes before real scale)

This Worker does proper cryptographic verification, but a production billing
system should go further:

- **Revocation freshness.** The JWS proves the subscription was valid when
  Apple signed it; a refunded/revoked subscription remains "valid" here until
  its `expiresDate`. For real-time revocation, run
  [Apple's `app-store-server-library`](https://github.com/apple/app-store-server-library-node)
  (Node — pair it with a small server or scheduled Worker) and subscribe to
  **App Store Server Notifications V2** (`REFUND`, `EXPIRED`, `DID_RENEW`,
  `REVOKE`), maintaining a denylist of revoked `originalTransactionId`s in KV
  that this Worker checks.
- **Environment check.** The payload's `environment` field distinguishes
  `Production` from `Sandbox`/`Xcode`. Reject non-production tokens once the
  app ships, or route them to a lower rate limit.
- **Certificate lifetimes & OCSP.** This Worker validates signatures and the
  pinned root but does not check `notBefore`/`notAfter` on chain certs or
  OCSP revocation of Apple's intermediates. Apple's server library handles
  this correctly.
- **Rate-limit precision.** KV is eventually consistent, so a rapid burst can
  slip a few requests past 300/day. If that ever matters, move the counter to
  a Durable Object (strongly consistent) — for abuse control at this scale,
  KV is fine.
- **Request caps.** Consider rejecting bodies over ~64 KB and clamping
  `max_tokens` server-side so a modified client can't run up your Gemini
  bill within its 300 requests.
- **Token replay.** Anyone holding a valid JWS can use it until expiry —
  that's inherent to this design and acceptable (it only grants metered chat
  for a paid subscription). The daily per-subscriber cap bounds the damage
  from a leaked token.
