# RE;light console-style game selection

A scoped adaptation of the PS5 Games home pattern: a cover strip controls one large artwork stage and its game-specific launch action. Reference: Sony PS5 Quick Start Guide, page 8, https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000a/CFI-10XXA_PS5_Quick_Start_Guide%24en.pdf.

RE;light retains its navy, ivory, gold and LINE Seed Sans TH identity. SKYFRONT is selected on initial load, Puff World is the second cover, and older activities remain in a closed disclosure. No automatic rotation, fabricated game information, console accounts or decorative system controls.

## Artwork

The existing approved posters are the cover tiles. The original Puff World image is also its backdrop. Built-in Image Gen adapted the approved SKYFRONT art into a text-free backdrop with the same red-panda pilot, Rio, ivory/gold aircraft and coastal world. The original generated PNG is retained in skyfront-backdrop-source.png; public/games/skyfront-backdrop.webp is the optimized website asset.

## Interaction and responsive behavior

Semantic tabs with roving focus support click/tap, Left/Right, Home/End. Each tab controls a panel with its own real play destination. Hidden panels leave the active play action unambiguous. Reduced motion removes crossfade and focus transitions.

Desktop places the cover row at upper left, selected title and action below, artwork to the right. Phones place the artwork between cover selection and game information with edge fades. The game stage responds to viewport height on desktop. Homepage headings, section spacing and hero height use bounded fluid sizes, with readable Thai line heights.

## Verification

Production build, TypeScript, existing homepage render test, targeted ESLint (no errors, static-image advisory only), and diff checks passed. Mechanical detector flagged width animation, which was removed; the unrelated existing grid advisory was outside this section.

Browser checks: 320x740, 390x844, 768x1024, 1366x768 and 1920x1080. No document overflow or out-of-bounds visible text/controls. The screen-reader-only heading intentionally uses a visually clipped rectangle. Both game selections, keyboard focus, disclosure and image loading were verified. desktop-skyfront.jpg, desktop-puff.jpg, mobile-skyfront.jpg and mobile-learning.jpg capture the checked implementation.

Published and verified on 12 October 2026 at https://relight-web-two.vercel.app/#activities. Deployment dpl_JDwjgKWDvw5Cbu3ZaAqccvBKzuN4 is READY. Public image loading, default SKYFRONT selection, Puff World switching, keyboard selection and real play destinations passed. live-desktop.jpg records the deployed section.
