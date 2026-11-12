# FINDORA upgrade notes

This package preserves the existing app structure and adds:

- A local similarity score that remains available when AI is disabled, unavailable, or returns a weak score.
- Browser matching that displays the stronger of the AI score and deterministic local score.
- Match alerts for both the lost-item owner and the finder, without exposing private contact details.
- Match alerts are written to the FINDORA inbox immediately using local matching; AI can enhance results later but cannot delay inbox delivery.
- Claim submission and claim-received alerts are also saved to both users' FINDORA inboxes.
- Inbox messages stay unread until the user explicitly marks them as read; WhatsApp delivery failure does not delete the inbox message.
- Safer photo uploads with actual JPEG/PNG/WEBP signature checks, plus additional response security headers.
- AI re-check access is limited to the report owner or Security Desk, with a per-user cooldown.
- Startup output showing LAN URLs so other devices on the same Wi-Fi can use one shared server/database.
- A visual refresh for the hero, cards, buttons, forms, report matches, and navigation.
- `npm test` for basic matching regression checks.

## Update safely

1. Stop the current FINDORA server with Ctrl+C.
2. Back up your existing `.env` file and `data` folder.
3. Extract this ZIP and copy the contents of its `findora-app` folder over your existing project folder, allowing source files to be replaced.
4. Keep your existing `.env` and `data` folder. They are intentionally not included in this ZIP.
5. In the project terminal, run `npm install`, then `npm test`, then `npm start`.
6. For another device on the same Wi-Fi, open the `Same Wi-Fi/LAN devices` URL printed by the server. Do not use `localhost` on the other device.

## Notifications and WhatsApp

FINDORA's in-app inbox is the reliable default: match alerts and claim updates are saved to the user's account and appear under **My activity → Inbox & notifications**. The app checks for new inbox items every few seconds while open. Users can mark messages read manually.

Automatic WhatsApp delivery is optional and requires valid Twilio WhatsApp or Meta WhatsApp Cloud API credentials in `.env`. This ZIP does not contain credentials. If WhatsApp is not configured or delivery fails, the inbox notification remains saved. The Security Desk can use the manual WhatsApp link from its WhatsApp tab.
