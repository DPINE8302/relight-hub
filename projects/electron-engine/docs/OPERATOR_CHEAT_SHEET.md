# RE:Light operator cheat sheet

> **Legacy Electron guide.** For the current native app, use [RE:Light Native quick start](../native-app/README.md). Native emergency action: **Stop & Clear (⌘.)**. The Test/Production workflow and shortcuts below apply only to the retained Electron app.

## Safe rule

If the audience picture, sound, recording, or controls are wrong, press **`⌘⇧R` Emergency Reset**. It immediately blanks and mutes the audience, stops the session, and deletes temporary visitor audio.

## Five-minute Test

1. Choose **Test** → **Setup**.
2. Choose **Run Test Checks** and allow Microphone access.
3. Choose **Use This Mac’s Microphone** (or select the built-in mic) → **Test Signal** → speak → confirm **Passed**.
4. Choose **Run Test Checks** again and answer any speaker confirmation honestly.
5. Open **Test Flow** → **Full Flow** → **4×** → **Start Full Test**.
6. At `WAITING_FOR_RECORD`: press/release `R`, then speak for up to six seconds.
7. At `WAITING_FOR_CHOICE`: press/release `W`.
8. Wait for `IDLE`. Run one more session and prove Emergency Reset.

If Start is disabled: return to **Setup** and fix the first required row that is not Passed or Test only.

## Test Flow keys

| Key | Action |
| --- | --- |
| `Space` | Start from Idle; pause/resume a passive scene |
| `R` | Start recording; a second press after one second stops early |
| `W` | Choose Again at the final choice gate |
| `←` / `→` | Previous / next scene for testing |
| `⌥R` | Restart the current scene |

Keys work only in foreground **Test Flow**, outside focused fields and buttons. Press and release; held and repeated input is ignored.

## Native menu shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘Return` | Start |
| `⌘⇧P` | Pause / Resume |
| `⌘⌥R` | Restart Scene |
| `⌘⇧→` | Skip Scene |
| `⌘⇧I` | Return to Idle |
| `⌘⇧R` | Emergency Reset |
| `⌘,` | Settings |
| `⌘0` / `⌘=` / `⌘-` | Actual Size / Zoom In / Zoom Out |

## Before each visitor in Production

- Mode says **Production** and every required Setup row says **Passed**.
- Projector is extended and showing the audience canvas.
- Selected microphone meter moves; intended speakers passed at visitor position.
- Both assigned USB controls are connected and freshly tested.
- Audience is at Idle; no old recording or warning remains.

**No-go:** placeholders, simulated evidence, keyboard input, one display, missing final media, battery power, untested speakers, or unverified USB controls never count as Production-ready.

## Physical labels

- `บันทึกความฝัน / RECORD`
- `เลือกอีกครั้ง / CHOOSE AGAIN`

Privacy sign:

> เสียงของคุณจะใช้เฉพาะในประสบการณ์นี้ และจะถูกลบทันทีเมื่อจบ

Full instructions: [Start here](START_HERE.md) · [Troubleshooting](TROUBLESHOOTING.md) · [Exhibition setup](EXHIBITION_SETUP.md)
