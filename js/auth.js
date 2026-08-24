// auth.js — lock FieldKit behind a passkey (WebAuthn). This is a CLIENT-ONLY
// demo: the challenge is generated locally and there's no server verifying the
// signature. Real WebAuthn needs a server to issue the challenge and verify the
// assertion — see the article. Here it's enough to gate access with the device
// biometric / platform authenticator.

const STORE_KEY = "fieldkit.passkeyId";

export function passkeySupported() {
  return (
    typeof window.PublicKeyCredential !== "undefined" &&
    !!navigator.credentials
  );
}

export function hasPasskey() {
  return !!localStorage.getItem(STORE_KEY);
}

export async function registerPasskey() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32), // MUST come from your server in production
      rp: { name: "FieldKit" },
      user: {
        id: randomBytes(16),
        name: "field-user",
        displayName: "Field User",
      },
      // Accepted algorithms: ES256 (-7) and RS256 (-257).
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        userVerification: "preferred", // biometric / PIN when available
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });
  localStorage.setItem(STORE_KEY, bufToB64(cred.rawId));
  return true;
}

export async function authenticatePasskey() {
  const idB64 = localStorage.getItem(STORE_KEY);
  if (!idB64) throw new Error("No passkey registered.");

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32), // MUST come from your server in production
      allowCredentials: [{ type: "public-key", id: b64ToBuf(idB64) }],
      userVerification: "preferred",
      timeout: 60000,
    },
  });
  // A real app sends `assertion` to the server, which verifies the signature
  // against the stored public key. Client-side, a returned assertion is our cue.
  return !!assertion;
}

// ---------- helpers ----------
function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}
function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
