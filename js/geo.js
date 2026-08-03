// geo.js — one-shot geolocation and a single compass heading.
// Both are best-effort: they reject with a human-readable message so the app
// can degrade gracefully instead of crashing.

// ---------- Location ----------
export function getPosition(
  options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
) {
  if (!("geolocation" in navigator)) {
    return Promise.reject(new Error("Geolocation isn't available here."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy, // metres
        }),
      (err) => reject(new Error(describeGeoError(err))),
      options
    );
  });
}

function describeGeoError(err) {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission denied.";
    case err.POSITION_UNAVAILABLE:
      return "Location unavailable right now.";
    case err.TIMEOUT:
      return "Timed out getting your location.";
    default:
      return "Couldn't get your location.";
  }
}

// ---------- Compass heading ----------
// Cross-browser this is genuinely messy:
//   • iOS 13+ requires a permission request on a user gesture, and exposes the
//     ready-to-use `webkitCompassHeading` (degrees clockwise from north).
//   • Chromium/others fire an *absolute* orientation event; we derive heading
//     from `alpha`. Some browsers use `deviceorientationabsolute` for this.
// If nothing usable arrives before the timeout, we reject (no magnetometer).
export async function getHeading({ timeout = 3000 } = {}) {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const state = await DeviceOrientationEvent.requestPermission(); // iOS gate
    if (state !== "granted") throw new Error("Compass permission denied.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const onOrient = (e) => {
      let heading;
      if (typeof e.webkitCompassHeading === "number") {
        heading = e.webkitCompassHeading; // iOS
      } else if (e.absolute && typeof e.alpha === "number") {
        heading = (360 - e.alpha) % 360; // convert absolute alpha to heading
      } else {
        return; // this event has no usable heading; wait for another
      }
      finish(heading);
    };

    const finish = (h) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Math.round(h));
    };
    const cleanup = () => {
      window.removeEventListener("deviceorientationabsolute", onOrient);
      window.removeEventListener("deviceorientation", onOrient);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      if (!settled) reject(new Error("No compass data on this device."));
    }, timeout);

    window.addEventListener("deviceorientationabsolute", onOrient);
    window.addEventListener("deviceorientation", onOrient);
  });
}
