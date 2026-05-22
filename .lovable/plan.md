
# DJ Mixer Pro — Windows Desktop App (Electron)

A professional dual-deck DJ mixing desktop app, packaged as a Windows `.exe` via Electron. Built on Web Audio API with universal input support (mouse, keyboard, touch, pen — important for Surface devices).

## Delivery format

- Built as an Electron app (Chromium runtime under the hood, so Web Audio API and Pointer Events work identically to Edge).
- Packaged with `@electron/packager` cross-compiled from Linux → `--platform=win32 --arch=x64`.
- Output: `DJMixerPro-win32-x64.zip` in `/mnt/documents/` — unzip and run `DJMixerPro.exe`. No installer (electron-builder's NSIS installer needs Windows-only tools the sandbox can't run).
- Local-first: tracks loaded from the user's disk, recordings saved to disk, no network required.

## Scope for v1

### In this build
- Dual deck audio engine (Web Audio API): load, play/pause/stop, seek, pitch ±8%, gain
- File loading via drag-drop + browse (MP3/WAV/OGG/M4A), in-session library
- HiDPI canvas waveform with playhead + click/touch scrub
- 3-band EQ per deck (low/mid/high biquad) with kill switches
- Crossfader (equal-power curve) + master volume
- 4 hot cues per deck (set + trigger)
- Beat-synced loops (1/4, 1/2, 1, 2, 4, 8 beats) from detected BPM
- BPM detection in a Web Worker
- Sync (match BPMs between decks)
- Per-deck FX: filter (LP/HP sweep), delay, reverb (convolver) with wet/dry
- Master recording → downloadable WAV via native Save dialog
- Universal input via Pointer Events (mouse, touch, pen); wheel for fine adjust; right-click → reset
- Keyboard shortcuts (Space, Tab, 1–4, C, L, arrows, Enter, Ctrl+S/O)
- Adaptive layout (works on Surface portrait through 4K desktop)
- Dark techno aesthetic with neon cyan/magenta deck accents; design tokens in `src/styles.css`

### Deferred
- Surface Dial (requires WinRT bridge, not feasible from Electron without native module)
- IndexedDB persistent library (in-memory per session for v1)
- Headphone cueing (needs multi-output routing)
- Beat-grid overlay (BPM number only for v1)
- Code-signed installer / Microsoft Store package

## Architecture

```text
/dev-server
├── electron/
│   └── main.cjs              # BrowserWindow, file dialogs, single-instance lock
├── src/
│   ├── routes/index.tsx      # Main mixer UI
│   ├── lib/
│   │   ├── audio/{engine,deck,bpm.worker,waveform,wav-encoder}.ts
│   │   ├── input/{use-pointer-drag,use-keyboard,capabilities}.ts
│   │   └── store.ts          # Zustand (UI state only)
│   └── components/
│       ├── Deck.tsx, Waveform.tsx, Crossfader.tsx
│       ├── MasterBar.tsx, Library.tsx
│       └── Fader.tsx, Knob.tsx
└── vite.config.ts            # base: './' (required for Electron file://)
```

Audio nodes live in refs, not React state — no re-renders on the audio path. UI subscribes to playhead/meters via rAF.

## Packaging steps (automated at end of build)

1. `npm install --save-dev electron @electron/packager` (~150MB, one-time)
2. `vite build`
3. `npx @electron/packager . "DJMixerPro" --platform=win32 --arch=x64 --out=electron-release --overwrite`
4. `zip` the output to `/mnt/documents/DJMixerPro-win32-x64.zip`

User downloads the zip, extracts, double-clicks `DJMixerPro.exe`.

## Notes & caveats

- Electron on Windows runs Chromium → all Web Audio, Pointer Events, and pressure APIs work as specified.
- The .exe is **unsigned**. On first launch Windows SmartScreen will show "Windows protected your PC" → user clicks "More info" → "Run anyway". Code signing requires a paid cert.
- Cross-compiled from Linux, so I cannot run the .exe to test it. I will smoke-test the web build in the preview to validate the audio engine and UI before packaging.
- Lovable Cloud not needed (fully local).

Ready to build on approval.
