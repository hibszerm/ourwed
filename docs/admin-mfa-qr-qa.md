# MFA QR visual QA checklist (Phase 2)

Source: `src/admin/styles/admin.module.css` (`.qrWrap`)

## Requirements verified in CSS

- [x] Pure white quiet zone (`background: #ffffff`)
- [x] Desktop SVG min 240×240 (`min-width/height: 240px`)
- [x] Mobile ≤480px SVG min 220×220
- [x] `transform: none` (no scale)
- [x] No CSS blur / filter
- [x] No border overlay on the QR frame
- [x] Padding 1.5rem around SVG
- [x] Square aspect preserved (`width` = `height`)
- [x] Manual secret fallback retained on setup page

## Manual scan QA (owner session)

1. Open `/admin/mfa/setup` (or production admin host) with an unverified enroll flow.
2. Confirm QR sits on white background with visible quiet zone.
3. Scan with Google Authenticator and a second TOTP app.
4. Confirm code verifies; do not re-enroll unnecessarily.

Screenshot: capture after deploy when enrollment UI is reachable; do not commit live TOTP secrets.
