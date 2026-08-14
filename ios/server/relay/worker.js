/**
 * Aura relay — Cloudflare Worker
 *
 * Sits between the Aura iOS app and Google Gemini's OpenAI-compatible endpoint.
 * The client authenticates with a StoreKit 2 `jwsRepresentation` (a signed JWS
 * proving an active aura.plus.yearly or aura.pro.yearly subscription). The
 * Worker verifies the JWS end-to-end against the pinned Apple Root CA-G3,
 * enforces a per-subscriber daily rate limit via KV, then forwards the chat
 * request to Gemini with the server-side API key. The Gemini API key never
 * ships in the app binary.
 *
 * Routes:
 *   POST /v1/chat   OpenAI-chat-format body {messages, max_tokens, temperature,
 *                   response_format}. Everything else: 401 / 404 / 405.
 *
 * Privacy: message content is never logged anywhere in this file. Keep it that
 * way if you edit it.
 */

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

const EXPECTED_BUNDLE_ID = "com.danish.aura";
const ALLOWED_PRODUCT_IDS = new Set(["aura.plus.yearly", "aura.pro.yearly"]);
// each chat message costs two requests (reply + extraction). the base plan's
// cap allows ~100 messages a day; "unlimited" is marketed as unlimited and the
// high ceiling exists purely as an abuse brake, real users never see it.
const DAILY_LIMITS = { "aura.plus.yearly": 200, "aura.pro.yearly": 2000 };
const DAILY_REQUEST_LIMIT = 200; // fallback when productId is somehow absent
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
// StoreKit keeps a subscriber entitled through Apple's Billing Grace Period
// while their card retries, and the device may hold the old JWS briefly at the
// renewal boundary. Honor the same window instead of cutting paid users off.
const BILLING_GRACE_MS = 16 * 24 * 60 * 60 * 1000;
// The relay is the trust boundary: re-enforce the app's own request shape so a
// stolen-but-valid JWS cannot turn one subscription into an unbounded bill.
const MAX_TOKENS_CEILING = 512;
const MAX_BODY_CHARS = 64 * 1024;
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/**
 * Apple Root CA - G3, DER, base64. This is the trust anchor: the x5c chain in
 * every StoreKit 2 JWS must terminate at exactly this certificate.
 * Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * SHA-256: 63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179
 * Valid until 2039-04-30.
 */
const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9v" +
  "dCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UE" +
  "CgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2" +
  "WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmlj" +
  "YXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqG" +
  "SM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxE" +
  "tX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNC" +
  "MEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0P" +
  "AQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3m" +
  "eoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkL" +
  "F1vLUagM6BgD56KyKA==";

// ASN.1 OIDs (content bytes, hex) for the two signature algorithms Apple's
// chain uses: leaf/intermediate are ecdsa-with-SHA256, root signs the
// intermediate with ecdsa-with-SHA384.
const OID_ECDSA_SHA256 = "2a8648ce3d040302";
const OID_ECDSA_SHA384 = "2a8648ce3d040303";

// ---------------------------------------------------------------------------
// Small binary / base64 helpers
// ---------------------------------------------------------------------------

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlToBytes(b64url) {
  let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return base64ToBytes(s);
}

function bytesToHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Hex(str) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  return bytesToHex(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Minimal DER (ASN.1) reader — just enough to walk an X.509 certificate.
// ---------------------------------------------------------------------------

/** Read one TLV element starting at `offset`. Returns tag, content bounds. */
function derRead(bytes, offset) {
  if (offset >= bytes.length) throw new Error("DER: out of bounds");
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let headerLen = 2;
  if (length & 0x80) {
    const numBytes = length & 0x7f;
    if (numBytes === 0 || numBytes > 4) throw new Error("DER: bad length");
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = length * 256 + bytes[offset + 2 + i];
    }
    headerLen = 2 + numBytes;
  }
  const contentStart = offset + headerLen;
  const end = contentStart + length;
  if (end > bytes.length) throw new Error("DER: truncated element");
  return { tag, start: offset, contentStart, end };
}

/** All direct children of a constructed element. */
function derChildren(bytes, node) {
  const children = [];
  let off = node.contentStart;
  while (off < node.end) {
    const child = derRead(bytes, off);
    children.push(child);
    off = child.end;
  }
  return children;
}

/**
 * Parse an X.509 certificate (DER) into the pieces we need:
 *  - tbsBytes:  the full DER of TBSCertificate (the signed portion)
 *  - sigAlgOid: hex of the signatureAlgorithm OID content bytes
 *  - sigDer:    the ECDSA signature (DER SEQUENCE of r,s) from the BIT STRING
 *  - spki:      full DER of SubjectPublicKeyInfo (importable by WebCrypto)
 */
function parseCertificate(der) {
  const cert = derRead(der, 0); // Certificate ::= SEQUENCE
  const [tbs, sigAlg, sigVal] = derChildren(der, cert);
  if (!tbs || !sigAlg || !sigVal) throw new Error("cert: malformed");

  const tbsBytes = der.slice(tbs.start, tbs.end);

  // signatureAlgorithm ::= SEQUENCE { algorithm OID, parameters ANY OPTIONAL }
  const oidNode = derChildren(der, sigAlg)[0];
  if (!oidNode || oidNode.tag !== 0x06) throw new Error("cert: no sig OID");
  const sigAlgOid = bytesToHex(der.slice(oidNode.contentStart, oidNode.end));

  // signatureValue ::= BIT STRING; first content byte = unused-bit count (0)
  const sigDer = der.slice(sigVal.contentStart + 1, sigVal.end);

  // TBSCertificate ::= SEQUENCE { [0] version OPTIONAL, serialNumber,
  //   signature, issuer, validity, subject, subjectPublicKeyInfo, ... }
  const tbsChildren = derChildren(der, tbs);
  let idx = tbsChildren[0] && tbsChildren[0].tag === 0xa0 ? 1 : 0; // skip version
  const spkiNode = tbsChildren[idx + 5];
  if (!spkiNode || spkiNode.tag !== 0x30) throw new Error("cert: no SPKI");
  const spki = der.slice(spkiNode.start, spkiNode.end);

  return { tbsBytes, sigAlgOid, sigDer, spki };
}

/**
 * Convert a DER-encoded ECDSA signature (SEQUENCE { INTEGER r, INTEGER s })
 * to the raw r||s form WebCrypto expects, padded to `size` bytes per integer
 * (32 for P-256, 48 for P-384).
 */
function ecdsaDerToRaw(sigDer, size) {
  const seq = derRead(sigDer, 0);
  const [r, s] = derChildren(sigDer, seq);
  const pad = (node) => {
    let v = sigDer.slice(node.contentStart, node.end);
    while (v.length > 0 && v[0] === 0x00) v = v.slice(1); // strip sign byte
    if (v.length > size) throw new Error("ECDSA: integer too long");
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const raw = new Uint8Array(size * 2);
  raw.set(pad(r), 0);
  raw.set(pad(s), size);
  return raw;
}

/**
 * Import an SPKI as an ECDSA verification key. Apple's leaf/intermediate are
 * P-256, the root is P-384; try both curves and let WebCrypto reject the
 * wrong one.
 */
async function importEcdsaKey(spki) {
  for (const namedCurve of ["P-256", "P-384"]) {
    try {
      const key = await crypto.subtle.importKey(
        "spki",
        spki,
        { name: "ECDSA", namedCurve },
        false,
        ["verify"]
      );
      return { key, coordSize: namedCurve === "P-256" ? 32 : 48 };
    } catch (_) {
      // wrong curve; try the next one
    }
  }
  throw new Error("unsupported public key");
}

/** Verify `certParsed` was signed by the holder of `issuerSpki`. */
async function verifyCertSignedBy(certParsed, issuerSpki) {
  let hash;
  if (certParsed.sigAlgOid === OID_ECDSA_SHA256) hash = "SHA-256";
  else if (certParsed.sigAlgOid === OID_ECDSA_SHA384) hash = "SHA-384";
  else throw new Error("unsupported signature algorithm");

  const issuer = await importEcdsaKey(issuerSpki);
  const rawSig = ecdsaDerToRaw(certParsed.sigDer, issuer.coordSize);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash },
    issuer.key,
    rawSig,
    certParsed.tbsBytes
  );
  if (!ok) throw new Error("certificate signature invalid");
}

// ---------------------------------------------------------------------------
// StoreKit 2 JWS verification
// ---------------------------------------------------------------------------

/**
 * Fully verify a StoreKit 2 jwsRepresentation and return its payload.
 * Steps:
 *   1. Decode the JWS header; require alg ES256 and an x5c chain.
 *   2. Verify each cert in the chain is signed by the next one.
 *   3. Require the chain to terminate at the pinned Apple Root CA-G3
 *      (byte-identical, or — if the root was omitted — directly signed by it).
 *   4. Verify the JWS signature with the leaf certificate's public key.
 * Throws on any failure.
 */
async function verifyAppleJws(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWS: not three parts");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(headerB64))
  );
  if (header.alg !== "ES256") throw new Error("JWS: alg must be ES256");
  if (!Array.isArray(header.x5c) || header.x5c.length === 0) {
    throw new Error("JWS: missing x5c chain");
  }

  // Decode and parse every certificate in the chain (leaf first).
  const certsDer = header.x5c.map((b64) => base64ToBytes(b64));
  const certs = certsDer.map((der) => parseCertificate(der));
  const appleRootDer = base64ToBytes(APPLE_ROOT_CA_G3_B64);
  const appleRoot = parseCertificate(appleRootDer);

  // Each cert must be signed by its successor in the chain.
  for (let i = 0; i < certs.length - 1; i++) {
    await verifyCertSignedBy(certs[i], certs[i + 1].spki);
  }

  // The chain must anchor at the pinned Apple root. Apple normally includes
  // the root itself as the last x5c entry; accept that (byte-identical), or a
  // chain that omits the root but whose last cert is signed directly by it.
  const last = certsDer[certsDer.length - 1];
  if (bytesEqual(last, appleRootDer)) {
    if (certsDer.length < 2) throw new Error("JWS: chain is only the root");
  } else {
    await verifyCertSignedBy(certs[certs.length - 1], appleRoot.spki);
  }

  // Verify the JWS signature itself with the leaf public key. JWS ES256
  // signatures are already raw r||s (64 bytes) — no DER conversion needed.
  const leafKey = await importEcdsaKey(certs[0].spki);
  if (leafKey.coordSize !== 32) throw new Error("JWS: leaf key must be P-256");
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(signatureB64);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    leafKey.key,
    signature,
    signingInput
  );
  if (!ok) throw new Error("JWS: signature invalid");

  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
}

/**
 * Business checks on the verified transaction payload. Throws if the
 * subscription does not grant access. Re-run on every request (including
 * cache hits) because expiry is time-dependent.
 */
function checkEntitlement(payload) {
  if (payload.bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error("entitlement: wrong bundleId");
  }
  if (!ALLOWED_PRODUCT_IDS.has(payload.productId)) {
    throw new Error("entitlement: unknown productId");
  }
  if (
    typeof payload.expiresDate !== "number" ||
    payload.expiresDate + BILLING_GRACE_MS <= Date.now()
  ) {
    throw new Error("entitlement: subscription expired");
  }
  if (payload.revocationDate !== undefined && payload.revocationDate !== null) {
    throw new Error("entitlement: transaction revoked");
  }
  if (!payload.originalTransactionId) {
    throw new Error("entitlement: missing originalTransactionId");
  }
}

// ---------------------------------------------------------------------------
// In-memory verification cache (per Worker isolate)
// ---------------------------------------------------------------------------

// Keyed by SHA-256 of the raw token; value is the verified payload. Signature
// and chain checks are pure functions of the token, so a hit lets us skip the
// crypto — but checkEntitlement (expiry!) still runs on every request.
// Isolates are ephemeral, so this is best-effort; cap size to stay tidy.
const verifiedTokens = new Map();
const VERIFIED_CACHE_MAX = 512;

async function verifyTokenCached(token) {
  const cacheKey = await sha256Hex(token);
  let payload = verifiedTokens.get(cacheKey);
  if (!payload) {
    payload = await verifyAppleJws(token);
    if (verifiedTokens.size >= VERIFIED_CACHE_MAX) {
      // Evict the oldest entry (Map preserves insertion order).
      verifiedTokens.delete(verifiedTokens.keys().next().value);
    }
    verifiedTokens.set(cacheKey, payload);
  }
  checkEntitlement(payload);
  return payload;
}

// ---------------------------------------------------------------------------
// Rate limiting via KV (per subscriber, per UTC day)
// ---------------------------------------------------------------------------

// KV's get-then-put is not atomic, so a parallel burst carrying one JWS could
// blow far past the daily cap if KV were the only counter. This in-memory
// counter is atomic within an isolate and catches exactly that burst shape;
// KV remains the cross-isolate daily floor. Strict global limiting would need
// a Durable Object (see README hardening notes).
const burstCounts = new Map(); // `${id}:${utcDay}` -> count seen by this isolate

/** Returns true if the request is allowed, false if over the daily limit. */
async function checkAndCountRateLimit(env, originalTransactionId, limit) {
  const utcDay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `rl:${originalTransactionId}:${utcDay}`;

  const local = (burstCounts.get(key) || 0) + 1;
  burstCounts.set(key, local);
  if (burstCounts.size > 4096) burstCounts.clear(); // day rollover housekeeping
  if (local > limit) return false;

  const count = parseInt((await env.AURA_KV.get(key)) || "0", 10);
  if (count >= limit) return false;
  await env.AURA_KV.put(key, String(count + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function jsonError(status, message, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/v1/chat") {
      return jsonError(404, "Not found.");
    }
    if (request.method !== "POST") {
      return jsonError(405, "Method not allowed.", { Allow: "POST" });
    }

    // --- Authenticate: Bearer <StoreKit 2 jwsRepresentation> ---------------
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return jsonError(401, "Missing bearer token.");
    }
    const token = auth.slice("Bearer ".length).trim();

    let payload;
    try {
      payload = await verifyTokenCached(token);
    } catch (_) {
      // Deliberately generic: don't leak which verification step failed.
      return jsonError(401, "Invalid or expired subscription token.");
    }

    // --- Rate limit --------------------------------------------------------
    let allowed;
    try {
      const limit = DAILY_LIMITS[payload.productId] || DAILY_REQUEST_LIMIT;
      allowed = await checkAndCountRateLimit(env, payload.originalTransactionId, limit);
    } catch (_) {
      return jsonError(503, "Rate limiter unavailable, try again shortly.");
    }
    if (!allowed) {
      return jsonError(429, "Daily request limit reached. Resets at midnight UTC.", {
        "Retry-After": "3600",
      });
    }

    // --- Parse and sanitize the client body --------------------------------
    let clientBody;
    try {
      clientBody = await request.json();
    } catch (_) {
      return jsonError(400, "Body must be valid JSON.");
    }
    if (!Array.isArray(clientBody.messages) || clientBody.messages.length === 0) {
      return jsonError(400, "Body must include a non-empty messages array.");
    }
    // Bound the payload before it can become a token bill.
    if (JSON.stringify(clientBody.messages).length > MAX_BODY_CHARS) {
      return jsonError(413, "Message payload too large.");
    }

    // Whitelist, never spread: the server decides the model, caps max_tokens,
    // clamps temperature, and drops every other client-supplied knob (n, tools,
    // streaming options, ...).
    const forwardBody = {
      model: env.MODEL || DEFAULT_MODEL,
      messages: clientBody.messages,
      max_tokens: Math.min(
        Number.isFinite(clientBody.max_tokens) ? clientBody.max_tokens : MAX_TOKENS_CEILING,
        MAX_TOKENS_CEILING
      ),
      temperature: Math.min(Math.max(Number(clientBody.temperature) || 0, 0), 1),
    };
    if (clientBody.response_format && clientBody.response_format.type === "json_object") {
      forwardBody.response_format = { type: "json_object" };
    }

    // --- Forward to Gemini's OpenAI-compatible endpoint ---------------------
    // NOTE: never log messages or the upstream response body here.
    let upstream;
    try {
      upstream = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(forwardBody),
      });
    } catch (_) {
      return jsonError(502, "Upstream model unavailable.");
    }

    // Pass Gemini's response straight through with its status (works for
    // both plain JSON and SSE streaming bodies).
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
      },
    });
  },
};
