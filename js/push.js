// push.js — notification permission, Web Push subscription (VAPID), and a
// local-notification helper. FieldKit has no backend, so the working demo uses
// showNotification() directly; subscribeToPush() shows the real subscription
// code you'd wire to a server that holds the VAPID *private* key.

// Public half of a VAPID key pair. DEMO VALUE — generate your own with
// `npx web-push generate-vapid-keys` and keep the private half on your server.
const VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8";

export function pushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Must be called from a user gesture. Resolves true only if granted.
export async function enableNotifications() {
  if (!("Notification" in window)) {
    throw new Error("Notifications aren't supported in this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`Notification permission ${permission}.`);
  }
  return true;
}

// Works offline, no server needed — the service worker shows it locally.
export async function showLocalNotification(title, body) {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "fieldkit-reminder",
  });
}

// Create (or reuse) a push subscription. In production you'd POST the returned
// subscription to your server so it can push to this device later.
export async function subscribeToPush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // browsers require every push to be user-visible
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  // await fetch("/api/subscribe", { method: "POST", body: JSON.stringify(sub) });
  return sub;
}

// VAPID keys are URL-safe base64; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
