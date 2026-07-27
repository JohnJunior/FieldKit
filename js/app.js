// FieldKit app shell — wires up offline storage, the entry composer,
// service-worker registration, install prompt, and background sync.
// Per-feature modules (camera, geolocation, push, etc.) get added in
// later milestones and imported here.

import { addEntry, getEntries, getUnsynced, markSynced } from "/js/db.js";
import { capturePhoto, startAudio, stopAudio, isRecording } from "/js/media.js";

const els = {
  entries: document.getElementById("entries"),
  form: document.getElementById("entry-form"),
  text: document.getElementById("entry-text"),
  netStatus: document.getElementById("net-status"),
  installBtn: document.getElementById("install-btn"),
  iosHint: document.getElementById("ios-hint"),
  iosHintClose: document.getElementById("ios-hint-close"),
  addPhoto: document.getElementById("add-photo"),
  addAudio: document.getElementById("add-audio"),
  attachChip: document.getElementById("attach-chip"),
  attachLabel: document.getElementById("attach-label"),
  attachRemove: document.getElementById("attach-remove"),
  toast: document.getElementById("toast"),
};

// Media the user attached but hasn't submitted yet: { type, blob } | null
let pendingMedia = null;
// Object URLs created for the current render, revoked before the next one.
let objectUrls = [];

// ---------- Rendering ----------
function entryTemplate(e) {
  const when = new Date(e.createdAt).toLocaleString();
  const sync = e.synced ? "" : `<span class="badge badge--warn">queued</span>`;
  const loc =
    e.lat != null ? `<span class="entry__loc">📍 ${e.lat.toFixed(3)}, ${e.lng.toFixed(3)}</span>` : "";
  return `<article class="entry">
    <p class="entry__text"></p>
    <div class="entry__media"></div>
    <footer class="entry__meta"><time>${when}</time> ${loc} ${sync}</footer>
  </article>`;
}

// Turn a stored media Blob into a playable element. We create an object URL
// per render and revoke the previous batch first, so we don't leak memory.
function renderMedia(box, media) {
  const url = URL.createObjectURL(media.blob);
  objectUrls.push(url);
  if (media.type === "image") {
    const img = document.createElement("img");
    img.className = "entry__img";
    img.src = url;
    img.alt = "Attached photo";
    box.appendChild(img);
  } else if (media.type === "audio") {
    const audio = document.createElement("audio");
    audio.className = "entry__audio";
    audio.controls = true;
    audio.src = url;
    box.appendChild(audio);
  }
}

async function render() {
  objectUrls.forEach(URL.revokeObjectURL); // free last render's URLs
  objectUrls = [];

  const entries = await getEntries();
  if (!entries.length) {
    els.entries.innerHTML = `<p class="empty">No notes yet. Add your first field note below.</p>`;
    return;
  }
  els.entries.innerHTML = entries.map(entryTemplate).join("");

  els.entries.querySelectorAll(".entry").forEach((node, i) => {
    // Set text via textContent to avoid HTML injection from user input.
    node.querySelector(".entry__text").textContent = entries[i].text;
    if (entries[i].media) renderMedia(node.querySelector(".entry__media"), entries[i].media);
  });
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (els.toast.hidden = true), 2600);
}

// ---------- Compose ----------
els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.text.value.trim();
  if (!text && !pendingMedia) return; // need at least text or an attachment

  const entry = {
    id: crypto.randomUUID(),
    text,
    media: pendingMedia, // { type, blob } | null — Blobs live happily in IndexedDB
    createdAt: Date.now(),
    synced: false,
  };
  await addEntry(entry);
  els.text.value = "";
  clearAttachment();
  await render();
  await requestSync();
});

// ---------- Media capture ----------
function showAttachment(type) {
  els.attachLabel.textContent = type === "image" ? "📷 photo attached" : "🎙️ audio attached";
  els.attachChip.hidden = false;
}
function clearAttachment() {
  pendingMedia = null;
  els.attachChip.hidden = true;
}
els.attachRemove.addEventListener("click", clearAttachment);

els.addPhoto.addEventListener("click", async () => {
  try {
    const blob = await capturePhoto();
    pendingMedia = { type: "image", blob };
    showAttachment("image");
  } catch (err) {
    if (err.message !== "cancelled") toast(err.message);
  }
});

els.addAudio.addEventListener("click", async () => {
  try {
    if (!isRecording()) {
      await startAudio();
      els.addAudio.classList.add("btn--recording");
      els.addAudio.textContent = "⏺";
      toast("Recording… tap again to stop");
    } else {
      const blob = await stopAudio();
      els.addAudio.classList.remove("btn--recording");
      els.addAudio.textContent = "🎙️";
      pendingMedia = { type: "audio", blob };
      showAttachment("audio");
    }
  } catch (err) {
    toast(err.message || "Couldn't record audio");
  }
});

// ---------- Connectivity ----------
function updateNetStatus() {
  const online = navigator.onLine;
  els.netStatus.textContent = online ? "online" : "offline";
  els.netStatus.classList.toggle("badge--warn", !online);
  if (online) flushQueue();
}
window.addEventListener("online", updateNetStatus);
window.addEventListener("offline", updateNetStatus);

// ---------- Background sync ----------
async function requestSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    try {
      await reg.sync.register("sync-entries");
      return;
    } catch {
      /* fall through to manual flush */
    }
  }
  // Fallback for browsers without Background Sync (e.g. Safari): try now.
  if (navigator.onLine) flushQueue();
}

// Pretend "sync" = POST to a server. Here we just mark entries synced so the
// demo is self-contained; swap fakeUpload() for a real fetch() in production.
async function flushQueue() {
  const pending = await getUnsynced();
  for (const entry of pending) {
    const ok = await fakeUpload(entry);
    if (ok) await markSynced(entry.id);
  }
  if (pending.length) {
    await render();
    toast(`Synced ${pending.length} note${pending.length > 1 ? "s" : ""}`);
  }
}

function fakeUpload() {
  return new Promise((resolve) => setTimeout(() => resolve(true), 300));
}

navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_SYNC_QUEUE") flushQueue();
});

// ---------- Install ----------
// Is the app already running as an installed PWA? Then there's nothing to
// install — hide all install UI. (iOS exposes the legacy navigator.standalone.)
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

let deferredPrompt = null;

// Chromium fires this instead of showing its own mini-infobar. We stash the
// event and reveal our own button, so install happens on the user's terms.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (!isStandalone()) els.installBtn.hidden = false;
});

els.installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice; // "accepted" | "dismissed"
  deferredPrompt = null;            // the event can only be used once
  els.installBtn.hidden = true;
  if (outcome === "dismissed") toast("No worries — install anytime from the menu");
});

// Fired after a successful install (from our button OR the browser UI).
window.addEventListener("appinstalled", () => {
  els.installBtn.hidden = true;
  els.iosHint.hidden = true;
  deferredPrompt = null;
  toast("FieldKit installed");
});

// iOS/iPadOS never fire beforeinstallprompt, so guide the user by hand.
els.iosHintClose.addEventListener("click", () => (els.iosHint.hidden = true));
function maybeShowIosHint() {
  els.iosHint.hidden = !(isIOS() && !isStandalone());
}

// ---------- Boot ----------
async function boot() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch (err) {
      console.warn("SW registration failed:", err);
    }
  }
  updateNetStatus();
  maybeShowIosHint();
  await render();
}
boot();
