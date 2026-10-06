# RE:Light Engine design system

The active operator reference is `operator-status-concept.png`; the audience reference is `audience-record-concept.png`.

## Operator shell

- Native macOS title bar and application menu. No simulated traffic-light controls.
- A centered horizontal navigation capsule is the single Liquid Glass region. It contains Status, Setup, Test Flow, Settings, and Diagnostics in that order.
- Production/Test is a clearly labeled two-value mode control in the persistent command layer. Mode is never communicated by tint alone, never changes during a session, and always states whether physical readiness or Test substitutions apply.
- Main content remains opaque and information-dense. Status uses open rows and separators rather than a card grid.
- Color tokens follow Apple Dark Mode semantics: background `#1c1c1e`, recessed `#151516`, elevated `#2c2c2e`, foreground `#ffffff`, secondary `rgba(235,235,245,.60)`, separator `rgba(84,84,88,.65)`, selection/focus `#0a84ff`, confirmed `#30d158`, fault `#ff453a`. RE:Light amber `#ffb340` is reserved for the brand and Start action.
- Type uses the macOS system stack. Page title 52/1.05 at normal zoom; body and controls 15–17px; labels 13px minimum.
- Glass is limited to navigation and compact command chrome, with a readable opaque fallback for Reduce Transparency and Increased Contrast.
- Primary controls use 8px radii; the navigation capsule uses a 22px radius. Status is always communicated with text plus a symbol, never color alone.
- Device Setup follows System Settings and Audio MIDI Setup conventions: dense labeled rows, real device names, role, availability, identity quality, last test, and one contextual Assign/Test action. Assignment uses a focused sheet rather than exposing raw HID fields in the main view.
- Input Monitoring receives an in-context privacy explanation before the macOS prompt. Denial, restart-required, no-serial USB-port fallback, and disconnected states each have a direct recovery action.

## Audience canvas

- True black 16:9 canvas, LINE Seed Sans TH, projector-safe type, generous title-safe margins.
- Warm amber atmospheric field is a CSS visual layer, not a remote asset. It is never placed behind privacy text at a contrast-reducing opacity.
- No cursor, controls, state IDs, timing, or technical errors outside developer mode.
- All interaction prompts name button purpose as well as color.
- Test presentation is deliberately text-only: it presents the current authored scene name with calm typography instead of imitating unfinished film content. A persistent Test label prevents it from being mistaken for Production output.

## Motion and scale

- State changes use 220ms opacity and transform cues. Reduce Motion converts these to immediate opacity changes.
- Operator reflows at 200% text zoom: navigation scrolls horizontally, command controls wrap, and every content region scrolls vertically.
- Visible `:focus-visible` rings use macOS system blue and remain visible against glass.

## Implemented visual-fidelity ledger

The latest real Electron captures are `operator-status.png` and `audience-record-prompt.png` in the release QA output. They were compared directly with both accepted concept images at the target window sizes.

1. The centered five-destination navigation preserves the reference capsule geometry, selective blur, thin light edge, and blue selected state.
2. The operator palette preserves graphite surfaces, Apple label hierarchy, blue focus/selection, amber Start, green confirmation, and red emergency semantics.
3. Status keeps the reference hierarchy: large page title, explicit readiness, one horizontal command row, then open Activity Monitor-style information rows.
4. The implementation adds scene transport and video telemetry below the reference fold; these are deliberate functional additions and do not introduce a card dashboard.
5. The audience preserves the reference true-black canvas, warm horizon, restrained particles, title-safe centered Thai type, amber purpose line, and quiet privacy copy.
6. The implementation keeps glass limited to navigation; content remains opaque under Reduce Transparency and Increased Contrast.
7. At 200% text zoom, navigation scrolls, controls wrap, and settings/diagnostics remain vertically scrollable rather than clipping.
8. Production/Test mode, USB identity quality, and physical versus Test evidence remain legible with VoiceOver, Increased Contrast, Reduce Transparency, and color filters.

Copy comparison is exact for the release-critical audience strings:

- `RE:LIGHT` / `พรุ่งนี้ดีได้ เพราะฉันเลือกเอง`
- `เสียงของคุณจะใช้เฉพาะในประสบการณ์นี้ และจะถูกลบทันทีเมื่อจบ`
- `กดปุ่มบันทึกเสียงสีแดง แล้วบอกความฝันของคุณ`
- `กดปุ่มเลือกใหม่สีขาว — เอาพรุ่งนี้ของฉันคืนมา`
- `บันทึกความฝัน / RECORD`
- `เลือกอีกครั้ง / CHOOSE AGAIN`
