// files.js — get data OUT of FieldKit (export to a file, share a note) and
// back IN (import a file). Uses the File System Access API where available and
// falls back to the classic download / <input type=file> everywhere else.

// ---------- Export ----------
export async function exportEntries(entries) {
  const payload = await serialize(entries);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const filename = `fieldkit-${new Date().toISOString().slice(0, 10)}.json`;

  // Modern path: a real "Save As" dialog that returns a writable file handle.
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          { description: "FieldKit export", accept: { "application/json": [".json"] } },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err) {
      if (err.name === "AbortError") return "cancelled"; // user closed the dialog
      // any other error: fall through to the download fallback
    }
  }

  // Fallback: trigger a download via a temporary <a>.
  downloadBlob(blob, filename);
  return "downloaded";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Import ----------
export async function importEntries() {
  let file;

  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          { description: "FieldKit export", accept: { "application/json": [".json"] } },
        ],
        multiple: false,
      });
      file = await handle.getFile();
    } catch (err) {
      if (err.name === "AbortError") return null;
      throw err;
    }
  } else {
    file = await pickFileFallback();
    if (!file) return null;
  }

  const raw = JSON.parse(await file.text());
  return raw.map(deserialize);
}

function pickFileFallback() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

// ---------- Share (Web Share API) ----------
export async function shareEntry(entry) {
  if (!navigator.share) {
    throw new Error("Sharing isn't supported in this browser.");
  }
  const data = { title: "FieldKit note", text: entry.text || "A field note" };

  // Attach the photo as a file when the platform allows sharing files.
  if (entry.media?.type === "image" && navigator.canShare) {
    const file = new File([entry.media.blob], "fieldkit-photo.jpg", {
      type: entry.media.blob.type || "image/jpeg",
    });
    if (navigator.canShare({ files: [file] })) data.files = [file];
  }

  try {
    await navigator.share(data);
  } catch (err) {
    if (err.name !== "AbortError") throw err; // ignore the user cancelling
  }
}

// ---------- (de)serialisation ----------
// Media is stored as a Blob; JSON can't hold Blobs, so we base64 it on the way
// out and rebuild the Blob on the way in. Keeps exports self-contained.
async function serialize(entries) {
  return Promise.all(
    entries.map(async (e) => ({
      ...e,
      media: e.media
        ? { type: e.media.type, dataUrl: await blobToDataURL(e.media.blob) }
        : null,
    }))
  );
}

function deserialize(e) {
  return {
    ...e,
    media: e.media?.dataUrl
      ? { type: e.media.type, blob: dataURLToBlob(e.media.dataUrl) }
      : null,
  };
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
