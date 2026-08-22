# MomentoBooth — Product Context

## What
MomentoBooth is a premium photo booth PWA for events (weddings, birthdays, parties). The host runs the app on an iPad/tablet at the venue, guests take selfies through the app, and every shot is instantly available in a shared gallery that the couple/guests can download or share via QR code.

## Who
- **Lévy** (14 y/o, Halluin FR, founder/dev) — owner, designer, dev. Built the whole app solo. Goes to school in Mouscron BE.
- **Event hosts (the "organisateur")** — runs the app on iPad, configures event, monitors photos live.
- **Guests (the "invité")** — takes photos, browses gallery, downloads/shares.
- **The remote interface (téléphone/tablette extérieur)** — separate device, lets Lévy (or the host) control everything from a distance: change filters, take photos, activate modes, change music, view the gallery from across the room.

## Why
A real photo booth costs €1500-3000 to rent. Web-based photo booth apps exist but they all (a) send photos to a cloud server (privacy risk), (b) have generic "AI-vibe" designs, (c) are slow on iPhone cameras. MomentoBooth is private-by-default (no cloud, no account), has a hand-crafted dark/gold/teal aesthetic, and is optimized for iPhone 11 + Huawei tablet real-world use.

## The two real differentiators
1. **No cloud, no account** — every photo stays local. Privacy is the product.
2. **Premium aesthetic** — Lévy is allergic to "AI-vibe" designs. Every animation, every pixel has to feel hand-crafted, intentional, with a real identity (not generic Tailwind, not generic Anime.js boings).

## Platform
- **Web PWA** (PWA manifest, installable on iPad/iPhone).
- **Target devices**: iPhone 11 (camera, primary photographer), Huawei tablet / Chrome Android (gallery, host interface), Safari iOS (fallback).
- **Deployment**: Modal.com (https://shhsjdbjk--momentobooth-serve.modal.run), systemd service on the host machine (port 8787).

## Where we are (Aug 2026)
- v127 deployed, 162 atomic commits since v0.
- Features shipped: photo capture, filters (roulette + live preview), frames, masks, 3D effects, gallery (grid + carousel), QR sharing, idle/wallpaper mode, remote camera pairing (HTTP polling + WebRTC), donate panel, settings, telemetry.
- **Currently being polished** (Aug 2026 P0 audit):
  - 5 bugs fixed (gallery toggle, idle tap, settings wrap).
  - Safari performance: 9 rAF + 21 setInterval + 67 setTimeout + 125 addEventListener — 119 leak.
  - AI-tells (6 bounce-easing cubic-beziers, 2 side-tab borders, em-dash overuse, layout transitions).
- **Production aspiration**: handed to event hosts for real weddings/birthdays by Sep 2026.

## The aesthetic (HARD RULES from Lévy)
- **Palette**: dark mode base (#0a0a0f or similar near-black), gold/teal accents. NOT warm cream/sand/beige.
- **Typography**: distinctive, not generic. Serif/grotesque contrast, NOT two similar sans-serifs.
- **Motion**: ease-out-quart/expo, NOT bounce/elastic. Intentional reveals, not uniform reflex.
- **No gradient text**. **No glassmorphism as default**. **No eyebrow tracked uppercase** above every section. **No identical card grids**. **No 32px+ border-radius on cards**.
- **No generic AI-vibe tells** (the small star, the gradient overlay, the scale 1.2 bounce on hover).

## Distribution
- Direct to event hosts (no app store yet).
- Lévy's personal network in Halluin FR (where he lives) and Mouscron BE (where he studies) — premium wedding/birthday clients.
- A future public download is planned once the design + Safari perf are nailed.
