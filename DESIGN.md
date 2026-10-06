---
name: RE;light Hub
description: Education’s visual system applied to direct website, game and Mac download links.
colors:
  ink: "#070b17"
  ink-deep: "#03050b"
  cream: "#f5f0e7"
  paper: "#fbfbfa"
  text: "#101522"
  text-soft: "#606878"
  white: "#f8f6f0"
  gold: "#f2c978"
  blue: "#0f7598"
  line-dark: "rgba(255, 255, 255, 0.14)"
  line-light: "rgba(7, 11, 23, 0.13)"
typography:
  display:
    fontFamily: "\"LINE Seed Sans TH\", -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Thonburi\", \"Noto Sans Thai\", \"Leelawadee UI\", sans-serif"
    fontSize: "clamp(56px, 7.5vw, 108px)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "\"LINE Seed Sans TH\", -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Thonburi\", \"Noto Sans Thai\", \"Leelawadee UI\", sans-serif"
    fontSize: "clamp(36px, 4.6vw, 60px)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "\"LINE Seed Sans TH\", -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Thonburi\", \"Noto Sans Thai\", \"Leelawadee UI\", sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  body:
    fontFamily: "\"LINE Seed Sans TH\", -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Thonburi\", \"Noto Sans Thai\", \"Leelawadee UI\", sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  action:
    fontFamily: "\"LINE Seed Sans TH\", -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Thonburi\", \"Noto Sans Thai\", \"Leelawadee UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  pill: "999px"
  cover: "12px"
  cover-mobile: "8px"
spacing:
  page-x: "clamp(22px, 5vw, 84px)"
  button-inline: "22px"
  row: "30px"
  mobile-gap: "16px"
components:
  button-light:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.pill}"
    padding: "13px 22px"
  button-light-hover:
    backgroundColor: "{colors.gold}"
  button-outline:
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "13px 22px"
  button-zip:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  button-native:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "13px 22px"
---

# Design System: RE;light Hub

## Overview

**Creative North Star: "The Education site’s direct-link entrance"**

The hub inherits the actual RE;light Education stylesheet, loaded before the hub’s layout overrides. Its visual authority is the Education site: deep navy, ivory and cream surfaces, soft gold, LINE Seed Sans TH and pill-shaped navigation and actions. The brand uses the gold semicolon in RE;light.

The opening is centered, text-only and immediately offers a website-directory link and a direct Mac DMG download. Light website rows, dark game rows and a cream Mac section provide the main rhythm. Project imagery appears only as screenshot-derived covers within rows; the homepage has no room photograph, film player or decorative project-card grid.

**Key Characteristics:**

- Education’s actual CSS palette, type and controls.
- Centered text-only heading with two direct actions.
- Alternating light, dark and cream directory sections.
- Real project screens in unified navy, ivory and gold cover frames.

## Colors

Frontmatter preserves the active Education CSS values. The hub uses a restrained subset of that broader stylesheet; unrelated coral, mint and learning-widget tokens do not define this portal.

### Primary

- **Soft gold** (`gold`): semicolon, second hero line, dark-section open links, hover emphasis and dark-surface focus.

### Secondary

- **Education blue** (`blue`): light-section open links, Education sublinks and installation-summary focus.

### Neutral

- **Navy ink** (`ink`): hero/game surfaces and native download button.
- **Deep navy** (`ink-deep`): hero gradient and footer.
- **Ivory white** (`white`): dark-section text and light hero/navigation controls.
- **Cream** (`cream`): Mac section, outline-action text and ZIP hover surface.
- **Near-white paper** (`paper`): website section.
- **Dark text** (`text`): light/cream section headings.
- **Soft text** (`text-soft`): light-section metadata and disclosures.
- **Dark/light dividers** (`line-dark`, `line-light`): section-appropriate row boundaries.

## Typography

**Font:** LINE Seed Sans TH with the exact fallback stack in frontmatter. Local WOFF2 files provide 400, 700 and 800 with `font-display: swap`.

The inherited family handles both Thai and Latin names. Headings use negative tracking and pretty wrapping. The display is weight 800; other headings and actions are weight 700.

- **Display:** frontmatter role, changing below 620px to `clamp(44px, 10vw, 60px)` / 1.15.
- **Headline:** section role, fixed at 36px below 620px.
- **Title:** rows use the title role; 22px below 900px, then 20px below 620px. The native title is 28px on desktop and 23px on mobile.
- **Body:** inherited 17px / 1.65. Hero lead uses `clamp(17px, 1.45vw, 22px)` / 1.8, max-width 720px; mobile is 16px and max-width 290px. Row descriptions use 14px / 1.8, then 12px on mobile.
- **Action:** inherited button role. ZIP labels are 13px, then 12px on mobile; open links are 14px, then 13px below 900px.
- **Brand:** 20px, weight 700, tracking −0.045em with a gold semicolon. The header topic is 13px bold and disappears on mobile.

## Layout

The inherited page gutter is the frontmatter `page-x` value and section children are limited to 1280px. The fixed header is centered, 18px from the top, at most 1180px wide and 32px narrower than the viewport. It has a minimum height of 58px; mobile places it at 12px and tightens navigation spacing.

The hero is one centered column with no image. Desktop padding is 145px horizontally following the page gutter and 90px at the bottom, with minimum height `min(680px, 90svh)`. At 900px and below minimum height is 580px; at 620px and below it is 500px with 120px 22px 62px padding. Below 350px, actions stack and minimum height is 540px.

Sections use 80px top / 90px bottom padding, changing to 65px at 900px and 50px 22px 55px at 620px. Section headings use a two-column grid, collapsing to one column on mobile.

Final desktop project rows use a 220px cover, flexible text and auto-sized actions, with 30px gaps and 30px vertical padding. Cover ratio is 16:10. At 1050px and below, covers become 170px and actions move beneath text. At 620px and below, covers become 110px, gaps become 16px and the action pair spans the full row. The Mac area follows the same grid and its mobile DMG action spans full width. These final cover-grid overrides supersede earlier two-column row declarations in the same stylesheet.

The current listing has three website rows and five game rows, plus the Mac app. Teacher Storyboard has been removed. The footer uses three columns on desktop and one on mobile.

## Elevation & Depth

Depth comes mainly from alternating navy, paper and cream sections, understated dividers and the Education hero’s low-opacity radial/linear gradients. The text-only hero retains CSS light, not a background photograph.

The fixed navigation pill uses the inherited `0 14px 50px rgba(0, 0, 0, 0.22)` shadow, translucent navy surface, 22px backdrop blur and 145% saturation. Reduced transparency removes the blur and uses an opaque navy background. Directory rows have no panel shadows.

Buttons transition transform, background and border over 180ms ease, lift 2px on hover and scale to 0.98 with 0.88 opacity on press. The down-arrow shifts 2px on hover. Hero copy rises in over 900ms using `cubic-bezier(0.2, 0.7, 0.2, 1)`. Reduced motion reduces animations/transitions to 0.001ms, limits iterations and disables smooth scrolling. Section anchors retain 110px scroll margin for the fixed header.

## Shapes

Buttons and navigation use the Education pill radius. The fixed header has a 1px translucent border. Project covers use a 12px radius, reduced to 8px on mobile, and 16:10 framing. Rows themselves remain open, flat surfaces separated by 1px lines.

Nine cover slots correspond to actual Education, Progress, Pitch, PUFF, Arcade, Mini Games, Scenario, Light Trail and Native screens. Their shared navy/ivory/gold screen frame belongs to the cover asset, rather than a new CSS card style. All nine covers are installed. Final browser verification at 1440px, 390px and 320px confirmed nine loaded images, no horizontal overflow, no Teacher Storyboard entry and no hero image. The final screenshots are `education-final-1440.png`, `education-final-390.png` and `education-final-320.png` under `output/playwright/relight-hub/`.

## Components

- **Fixed navigation:** RE;light wordmark, topic and website/game anchors, with a pale app-download pill. Header links provide 44px minimum dimensions. Mobile hides the topic; below 350px it hides the first directory anchor.
- **Hero actions:** a pale filled directory action and a translucent outlined direct DMG action. Base height is 54px and padding 13px 22px; mobile variants are 48px with 12px 17px padding.
- **Open/play link:** blue text on the website section, gold on the game section; minimum height 48px. Hover becomes navy on light surfaces and ivory on dark surfaces.
- **ZIP action:** pill outline with 46px minimum height and 12px 20px padding. Dark variants use ivory text and a slate border; hover adds navy fill and gold border. Education-linked games retain Source ZIP labeling.
- **Project row:** actual-screen cover, title, concise description and immediate open/ZIP pair. Education additionally links its answer wall and post-film page. Rows are not clickable cards.
- **Mac download:** actual app-screen cover, native title, version/device requirements, measured DMG size and dark filled download pill. The hero also provides a direct DMG link. The existing release JSON updates size through JavaScript.
- **Disclosures:** semantic installation and ZIP `details` with 44px summary height, plus/minus state indication and 13px / 1.8 explanatory text.
- **Accessibility:** a focus-revealed skip link targets websites. Inherited link/button focus is 3px blue on light surfaces and gold in dark sections/header, with 4px offset. Disclosure focus uses Education blue.

No input, search, chip system, film player or gallery belongs to this homepage.

## Do's and Don'ts

### Do:

- Do inherit Education’s visual tokens and LINE Seed Sans TH weights.
- Do keep the hero text-only and preserve its direct Mac DMG link.
- Do keep open/play and ZIP actions together in every project row.
- Do use actual website/game/app screenshots inside the shared cover frame.
- Do retain platform requirements, Source ZIP labels and installation disclosures.
- Do preserve keyboard focus and reduced-motion/reduced-transparency behavior.

### Don't:

- Don't restore the original room-image hero or cinematic room palette.
- Don't introduce book covers, generic generated art or decorative project-card grids.
- Don't restore Teacher Storyboard to the listing, hosted sites or release assets.
- Don't describe Education Source ZIP as a ready-to-open static website package.
- Don't add film playback, galleries or unrelated editorial sections to the portal.
