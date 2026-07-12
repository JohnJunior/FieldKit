# FieldKit

An offline-first Progressive Web App for capturing geotagged field notes, photos, and audio.

FieldKit is the companion project for an article series exploring what modern PWAs can really do, with an honest look at browser support and how each capability compares to Electron. Related capabilities are grouped into a single article where it makes sense, so the number of articles isn't fixed.

## Capabilities

| Capability | State |
|------------|-------|
| Offline-first & background sync | ✅ built |
| Installable (manifest + install prompt) | ✅ built |
| Capture photos, video & audio | ⬜ planned |
| Push notifications | ⬜ planned |
| Open, edit & save files | ⬜ planned |
| Location-based experiences | ⬜ planned |
| Native sharing | ⬜ planned |
| Passkeys & biometric auth | ⬜ planned |
| Payments | ⬜ planned |
| Sensors & rich media | ⬜ planned |

## Run it

FieldKit is plain HTML/CSS/JS with no build step. Serve it over `localhost` (service workers require a secure context):

```bash
git clone https://github.com/JohnJunior/FieldKit.git
cd FieldKit
npx serve .
# then open http://localhost:3000
```

To test offline: open DevTools → Application → Service Workers → tick **Offline**, add some notes, and refresh. Untick to watch them sync.

## Tech

- Vanilla JS (ES modules) — no framework, so the code maps 1:1 to the articles
- Service Worker + Cache API for the offline app shell
- IndexedDB for local entry storage
- Background Sync (Chromium) with an `online`-event fallback (Safari/Firefox)

## License

MIT — use it, learn from it, send PRs.
