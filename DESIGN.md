---
name: RE:Light Hub
description: A Thai-first portal for RE:Light websites, games and the native Mac download.
colors:
  yellow: "#f2d374"
  yellow-hover: "#ffe49a"
  night: "#101723"
  deep: "#090f19"
  paper: "#f5f3ed"
  muted: "#b8c0cc"
  line: "#35404d"
  ink: "#192332"
  open-surface: "#e1e5eb"
  zip-border: "#6c6450"
typography:
  display:
    fontFamily: "Seed, system-ui, sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Seed, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "Seed, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.35
  body:
    fontFamily: "Seed, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Seed, system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.65
  action:
    fontFamily: "Seed, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.65
rounded:
  control: "4px"
  app-icon: "13px"
spacing:
  small: "14px"
  medium: "20px"
  row: "23px"
  control-inline: "24px"
  large: "30px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "14px 24px"
  button-primary-hover:
    backgroundColor: "{colors.yellow-hover}"
  button-open:
    backgroundColor: "{colors.open-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-open-hover:
    backgroundColor: "{colors.yellow}"
  button-zip:
    textColor: "{colors.yellow}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
---

# Design System: RE:Light Hub

## Overview

**Creative North Star: "The cinematic room entrance"**

The existing RE:Light room artwork sets the atmosphere: midnight surfaces, warm projected light, pale Thai typography and the yellow colon in the wordmark. The portal carries that visual identity into a direct, compact link directory. This is a description of the implemented system, not a new identity proposal.

The opening has a large two-line Thai heading beside the room image. Below it, the native Mac download is a distinct yellow action, followed by seven website/game rows with paired open and ZIP links. Visual emphasis comes from type size, contrast and spacing rather than decorative panels.

**Key Characteristics:**

- Cinematic room imagery with dark blue surfaces.
- LINE Seed Thai typography with heavy, balanced headings.
- Warm yellow for the identity, primary actions and ZIP links.
- Flat directory rows with clear, paired actions.

## Colors

The palette combines cool midnight neutrals with one warm yellow accent. Frontmatter values are normative and preserve the CSS source values.

### Primary

- **Warm yellow** (`yellow`): wordmark colon, second hero line, primary buttons, ZIP labels and keyboard focus.
- **Light warm yellow** (`yellow-hover`): primary button hover state.

### Neutral

- **Midnight blue** (`night`): body and directory background.
- **Deep room blue** (`deep`): hero and footer, visually connecting the room photograph with the page.
- **Soft paper** (`paper`): default text and headings.
- **Cool muted gray** (`muted`): descriptions, compatibility, captions and installation guidance.
- **Slate divider** (`line`): section and row separators.
- **Dark ink** (`ink`): text on pale or yellow actions.
- **Pale action surface** (`open-surface`): open/play buttons.
- **Muted gold border** (`zip-border`): ZIP button outline.

The Education, Arcade and Storyboard thumbnails use local illustrative colors; they identify individual entries and are not a second global accent system.

## Typography

**Display and body font:** LINE Seed, registered locally as `Seed`, followed by `system-ui, sans-serif`. Local WOFF2 files provide regular 400, bold 700 and display 800; `font-display: swap` applies to all three.

The same family handles Thai headings, Latin project names and compact metadata. Heavy headings supply hierarchy while ordinary text remains light and readable. Headings use balanced wrapping.

- **Display:** hero heading uses the frontmatter display role; it becomes 58px at 900px and below, then 48px / 1.16 at 600px and below.
- **Headline:** directory heading uses the headline role, becoming 27px on mobile. The native app title is 25px, becoming 23px on mobile.
- **Title:** directory row headings use the title role, becoming 18px below 900px and 19px below 600px.
- **Body:** base role supplies inherited line height; hero supporting copy is 18px, becoming 15px on mobile. Directory descriptions are 13px on desktop and 12px below 900px.
- **Label:** open/ZIP controls and metadata use compact text; directory control labels become 12px on mobile. Primary download buttons keep the action role.
- **Wordmark:** 32px, weight 800, line height 1 and letter spacing −0.03em; 28px in the mobile header and 26px in the footer.

## Layout

Desktop surfaces share 7% horizontal gutters. At widths of at least 1500px, gutters become the larger of 7% or half the space outside a 1300px content width. Mobile gutters are 6%.

The desktop hero is 510px tall, with copy starting 140px from the top. Its room image occupies the right 60%, covers the available height and focuses at 53% vertically. The header overlays the hero. The mobile hero is 535px tall; copy begins at 100px and the image occupies a 355px band beginning at 180px, shifted 20% beyond the right edge.

The native app strip uses a two-column grid with a 14px row gap and 30px column gap. On mobile it becomes one column with 22px gaps and a full-width download button. Its compatibility and installation guidance remain directly below.

The directory uses 60px top and 65px bottom padding on desktop, changing to 45px and 48px on mobile. Rows have 23px vertical padding and a bottom divider. Desktop rows align thumbnail/title and paired actions horizontally. At 900px, the directory heading stacks and row spacing tightens. At 600px, each row stacks, with actions indented 96px beneath its title. At 360px and below, that indent disappears and action links wrap and share available width.

Thumbnails are 95×65px on desktop, 75×58px below 900px and 80×59px below 600px. The footer shifts from one horizontal line to a vertical layout on mobile. These responsive rules are grounded in the saved 1440px and 390px portal screenshots, not invented future layouts.

## Elevation & Depth

The interface uses no box shadows. Depth comes from the actual room image, a directional mask, a dark vertical gradient over the hero, and the tonal change between the main body and the hero/footer. The desktop image mask fades from transparent at the left to opaque at 25%; mobile uses a vertical mask and 0.8 image opacity. Buttons lift 2px on hover; they do not gain elevation shadows.

Background transitions last 0.2s and button transforms last 0.3s using the browser's default easing. Anchor scrolling is smooth with a 25px top offset. Reduced-motion preferences disable transitions and use ordinary anchor scrolling.

## Shapes

Actions and row thumbnails use the small control radius. The app icon has the larger icon radius, appearing as a compact cream app tile. Rows are flat, open surfaces divided by 1px lines. The hero clips imagery at its boundary; the photograph's curtain, projection and chair provide the expressive shape language.

## Components

- **Primary action:** yellow fill, dark text, 14px × 24px padding, minimum height 52px and a separated down-arrow. The hero action targets the directory; the native app action downloads the DMG. The mobile hero variant has 12px × 20px padding and minimum height 48px.
- **Open/play action:** pale filled link, bold dark text, minimum height 46px and minimum width 127px on desktop. It becomes yellow on hover. Mobile minimum height is 44px.
- **ZIP action:** transparent link with a muted gold 1px border and yellow text, minimum width 140px on desktop. Hover adds the source's translucent yellow background. Education is explicitly labeled Source ZIP.
- **Directory row:** thumbnail or symbol, project title, brief description and two actions. The seven entries are Education, PUFF//WORLD: INSIDE, Arcade, Mini Games, Production Progress, Teacher Storyboard and Pitch. The row itself is not an interactive card.
- **Navigation:** wordmark home link and GitHub link in the overlaid header; wordmark, GitHub and all-downloads link in the footer. Navigation links have minimum 44px hit areas where specified by the source. External links use `target="_blank"` with `rel="noopener"`.
- **Native download strip:** app icon, product name, version/platform requirements, yellow download link, measured size and installation details. JavaScript reads `assets/release.json` to update the displayed MB value; the HTML retains a fallback.
- **Installation disclosure:** semantic `details`/`summary`, an underlined 44px minimum-height summary and compact expanded instructions. On mobile, opening the disclosure stacks the surrounding note for readable text.
- **Keyboard entry:** a skip link moves into view on focus and targets the directory. Links and the disclosure summary receive a 3px yellow focus outline with a 5px offset.

No search input, chip system, film player or gallery is part of the current homepage.

## Do's and Don'ts

### Do:

- Do preserve the existing room artwork and yellow colon identity.
- Do use the loaded Seed weights for Thai and Latin text.
- Do keep open/play and ZIP actions together for every directory row.
- Do preserve the prominent, full-width Mac download action on mobile.
- Do retain visible focus, semantic links, installation disclosure and reduced-motion behavior.

### Don't:

- Don't add film playback, galleries or editorial sections to this narrowed portal.
- Don't replace the flat directory with raised cards or add shadows absent from the implementation.
- Don't disguise Education Source ZIP as a ready-to-open static website package.
- Don't hide device requirements or download instructions behind decorative interactions.
