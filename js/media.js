// media.js — capture a photo (getUserMedia + canvas) and record audio
// (MediaRecorder). Both return a Blob you can store in IndexedDB and play
// back later. Kept framework-free so it maps 1:1 to the article.

// ---------- Photo ----------
// Opens the camera, shows a live preview in the modal, and resolves with a
// JPEG Blob when the user taps "Capture" (or rejects if they cancel).
export async function capturePhoto() {
  const modal = document.getElementById("camera");
  const video = document.getElementById("camera-video");

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }, // prefer the rear camera
      audio: false,
    });
  } catch (err) {
    throw new Error(describeMediaError(err, "camera"));
  }

  video.srcObject = stream;
  await video.play();
  modal.hidden = false;

  return new Promise((resolve, reject) => {
    const snap = document.getElementById("camera-snap");
    const cancel = document.getElementById("camera-cancel");

    const cleanup = () => {
      // ALWAYS stop the tracks, or the camera light stays on and the
      // device is left "in use" until the tab closes.
      stream.getTracks().forEach((t) => t.stop());
      modal.hidden = true;
      snap.onclick = cancel.onclick = null;
    };

    snap.onclick = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          cleanup();
          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    };
    cancel.onclick = () => {
      cleanup();
      reject(new Error("cancelled"));
    };
  });
}

// ---------- Audio ----------
let recorder = null;
let recStream = null;
let chunks = [];

export function isRecording() {
  return recorder !== null && recorder.state === "recording";
}

export async function startAudio() {
  recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickAudioMime();
  recorder = new MediaRecorder(recStream, mimeType ? { mimeType } : undefined);
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.start();
}

export function stopAudio() {
  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      recStream.getTracks().forEach((t) => t.stop()); // release the mic
      recorder = null;
      recStream = null;
      chunks = [];
      resolve(blob);
    };
    recorder.stop();
  });
}

// Browsers disagree on what MediaRecorder can produce. Pick the first
// container/codec this browser actually supports instead of assuming.
function pickAudioMime() {
  const candidates = [
    "audio/webm;codecs=opus", // Chromium/Firefox
    "audio/webm",
    "audio/mp4", // Safari
    "audio/aac",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

function describeMediaError(err, device) {
  if (err.name === "NotAllowedError") return `${device} permission denied.`;
  if (err.name === "NotFoundError") return `No ${device} found on this device.`;
  if (err.name === "NotReadableError") return `${device} is already in use.`;
  return `Couldn't access the ${device}: ${err.message}`;
}
