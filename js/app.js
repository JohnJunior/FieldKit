// FieldKit app shell — wires up offline storage, the entry composer,
// service-worker registration, install prompt, and background sync.
// Per-feature modules (camera, geolocation, push, etc.) get added in
// later milestones and imported here.

import { addEntry, getEntries, getUnsynced, markSynced } from "/js/db.js";

const els = {
  entries: document.getElementById("entries"),
  form: document.getElementById("entry-form"),
  text: document.getElementById("entry-text"),
  netStatus: document.getElementById("net-status"),
  installBtn: document.getElementById("install-btn"),
  toast: document.getElementById("toast"),
};

// ---------- Rendering ----------
function entryTemplate(e) {
  const when = new Date(e.createdAt).toLocaleString();
  const sync = e.synced ? "" : `<span class="badge badge--warn">queued</span>`;
  const loc =
    e.lat != null ? `<span class="entry__loc">📍 ${e.lat.toFixed(3)}, ${e.lng.toFixed(3)}</span>` : "";
  return `<article class="entry">
    <p class="entry__text"></p>
    <footer class="entry__meta"><time>${when}</time> ${loc} ${sync}</footer>
  </article>`;
}

async function render() {
  const entries = await getEntries();
  if (!entries.length) {
    els.entries.innerHTML = `<p class="empty">No notes yet. Add your first field note below.</p>`;
    return;
  }
  els.entries.innerHTML = entries.map(entryTemplate).join("");
  // Set text via textContent to avoid HTML injection from user input.
  els.entries.querySelectorAll(".entry__text").forEach((node, i) => {
    node.textContent = entries[i].text;
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
  if (!text) return;

  const entry = {
    id: crypto.randomUUID(),
    text,
    createdAt: Date.now(),
    synced: false,
  };
  await addEntry(entry);
  els.text.value = "";
  await render();
  await requestSync();
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

// ---------- Install prompt ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); // stop Chrome's default mini-infobar
  deferredPrompt = event;
  els.installBtn.hidden = false;
});
els.installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.hidden = true;
});
window.addEventListener("appinstalled", () => toast("FieldKit installed 🎉"));

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
  await render();
}
boot();
