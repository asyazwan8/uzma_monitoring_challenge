---
name: Geospatial AI
tagline: "See better. See the bigger picture. See the unseen."
parent: An Uzma Company
version: 1.0
source: Derived from the Geospatial AI brochure (Feb 2026) and Employee Onboarding deck (Sep 2026)

colors:
  # Brand
  primary: "#F26522"          # Uzma Signal Orange: headings, accents, CTAs, the [EO] brackets
  primary-hover: "#D9561A"
  primary-tint: "#FDE3D5"     # soft orange fills (org-chart cards, highlights)
  # Dark / space
  space-950: "#091926"        # deep orbit navy: covers, hero backgrounds, footers
  space-900: "#182942"        # secondary navy panels
  steel-700: "#3E606F"        # steel teal: section labels, rotated side titles, large numerals
  slate-600: "#636B7D"        # cool slate for secondary UI
  # Neutrals
  ink: "#231F20"              # body text on light
  graphite: "#404040"         # sub-headings, captions
  grey-500: "#646466"         # meta text, dividers' labels
  grey-300: "#B5B7BD"         # muted labels on dark, disabled
  grey-100: "#F5F5F5"         # page surface
  white: "#FFFFFF"
  # Data / map semantics (use only inside maps & charts)
  vegetation: "#71B84D"
  stress: "#E53935"
  water: "#2E86C1"
  uplift: "#2E86C1"
  subsidence: "#D7301F"

typography:
  font-family:
    display: "'Montserrat', 'Segoe UI', Arial, sans-serif"
    body: "'Montserrat', 'Segoe UI', Arial, sans-serif"
    office-fallback: "Calibri, Aptos, Arial, sans-serif"   # PowerPoint / Word when Montserrat unavailable
  scale:
    hero:      { size: 56px, weight: 800, tracking: 0.04em, case: upper }
    h1:        { size: 36px, weight: 800, tracking: 0.02em, case: upper }
    h2:        { size: 24px, weight: 800, tracking: 0.01em, case: upper }
    h3:        { size: 16px, weight: 700, tracking: 0, case: upper }
    stat:      { size: 48px, weight: 800, tracking: -0.01em }
    body:      { size: 15px, weight: 400, line-height: 1.6 }
    small:     { size: 13px, weight: 400, line-height: 1.5 }
    caption:   { size: 11px, weight: 600, tracking: 0.04em }

spacing: [4, 8, 12, 16, 24, 32, 48, 64, 96]
radius:
  none: 0px
  sm: 4px
  md: 8px
  lg: 16px
  pill: 999px
shadow:
  card: "0 2px 8px rgba(9, 25, 38, 0.08)"
  raised: "0 8px 24px rgba(9, 25, 38, 0.16)"
---

# Geospatial AI — Design System

## 1. Brand essence

Geospatial AI turns satellite data into decisions. The look pairs **the darkness of orbit** (deep navy, satellite photography, night-side Earth) with **one hot signal colour** (Uzma orange) that marks what matters. Everything else stays quiet: white or near-white surfaces, black text, generous imagery.

Three words: **orbital, precise, confident.**

The tagline pattern "See better. See the bigger picture. See the unseen." is a recurring device. When used, the repeated word "See" stays white or ink, and the key phrase after it turns orange.

## 2. Logo

- Wordmark: **G[EO]SPATIAL** with a superscript **AI**. The brackets and "EO" are the brand's signature; in colour versions the `[EO]` is orange, the rest white (on dark) or ink (on light).
- Always set "An Uzma Company" beneath in a light serif-style or small regular weight.
- Clear space: at least the height of the "G" on all sides.
- Never recolour the wordmark in non-brand colours, stretch it, or place it on busy imagery without a dark scrim.

## 3. Colour

| Role | Token | Hex | Use |
|---|---|---|---|
| Signal | `primary` | `#F26522` | Section titles, key words in headings, CTA buttons, accent bars, icons, numbered markers |
| Orbit | `space-950` | `#091926` | Covers, hero sections, closing pages, dark UI |
| Panel | `space-900` | `#182942` | Cards and bands on dark backgrounds |
| Steel | `steel-700` | `#3E606F` | Vertical side labels ("ABOUT US", "WHAT WE DO"), large statistics |
| Ink | `ink` | `#231F20` | Body text |
| Surface | `grey-100` | `#F5F5F5` | Default page background on light layouts |

**Ratio:** roughly 60% neutral (white/grey-100), 25% imagery or navy, 10% ink text, **≤5% orange**. Orange is a highlighter, not a fill. Large orange areas are reserved for a single CTA, a thin vertical accent bar, or a small badge.

**Map and chart colours** (`vegetation`, `stress`, `subsidence`, etc.) belong only inside data views. Never use them for UI chrome, so that a red pixel always means data, not decoration. For InSAR deformation use a diverging blue → white → red ramp (uplift → stable → subsidence) with a labelled mm/yr legend.

## 4. Typography

**Montserrat** is the brand face across print and web. ExtraBold (800) for headings, Bold (700) for sub-heads and labels, Regular (400) for body, Italic sparingly for captions and roles.

- Headings are **UPPERCASE**, ExtraBold, slightly tracked. Example: `ENVIRONMENTAL MONITORING`.
- A common heading move: split the title into two colours. In slides, the first word in navy/ink and the second in orange ("Organization **Chart**", "OUR **SERVICES**", "Vision & *Mission*").
- Sub-section kickers sit above body copy in orange ExtraBold caps: `KEY FEATURES & BENEFITS`.
- Body copy is sentence case, Regular, 1.6 line-height, left-aligned (the brochure justifies; avoid justification on screen).
- Statistics are huge and ExtraBold in `steel-700` or white: **1,270,637** Hectares Analysed.
- In Office documents where Montserrat isn't installed, fall back to Calibri/Aptos and keep the same weight hierarchy.

## 5. Layout

- **Grid:** 12-column on web (max width 1200px, 24px gutters); 2-column on A4 print with 15mm margins; 16:9 slides with a 64px safe margin.
- **Hero bands:** every major section opens with a full-bleed photographic band (satellite, aerial, city or farmland) darkened with a navy gradient, title in white ExtraBold caps bottom-left.
- **Side labels:** long-form pages use rotated vertical section labels in `steel-700` caps along the left margin, separated by thin rules.
- **Orange accent bar:** a 6–8px vertical orange bar on the left edge of slides or callout cards signals the start of a section.
- **Imagery first:** each content section pairs text with at least one image grid (2–4 tiles, captioned beneath in small bold).
- Whitespace is generous; never crowd more than ~120 words beside an image on a print page.

## 6. Imagery

- **Primary subjects:** satellites in orbit (UZMASAT-1), Earth from space, nighttime city lights, high-resolution optical tiles, SAR/InSAR interferograms, NDVI and change-detection maps.
- **Treatment:** high contrast, cool and slightly desaturated for scenery; data overlays stay fully saturated so they pop.
- Map tiles carry a small caption with sensor and date, e.g. *"Sentinel-2 · 12 Mar 2026"*.
- People photos (team, training) appear in rounded or circular crops on light surfaces only, never on the dark hero bands.
- Avoid generic stock (handshakes, glowing brains, abstract circuitry). Show real Earth data.

## 7. Iconography & graphics

- Line icons, 2px stroke, rounded joins, in `primary` orange or `steel-700`. Icons sit in a 40px circle (orange fill + white glyph, or light grey fill + orange glyph).
- Numbered markers: orange circles with white numerals ("01", "02").
- Radial / segmented diagrams are an established pattern: a central orange-titled hub with image-filled wedges for each use case (Agriculture, Coastal & Maritime, Disaster Management…).
- Connector lines in org charts and flows: 1.5px orange.

## 8. Components

**Buttons**
- Primary: orange fill, white Bold caps label, `radius.sm`, 12×24px padding; hover darkens to `primary-hover`.
- Secondary: transparent with 1.5px white (on dark) or ink (on light) border.
- Text link: orange, Bold, with a → arrow.

**Cards**
- Light surface: white, `radius.md`, `shadow.card`, optional 4px orange top or left border.
- Org/person cards: white with thin orange-tint border, circular photo, name in Bold, role in Italic grey.
- Dark surface: `space-900` with white text and orange kicker.

**Feature list ("Key Features & Benefits")**
- Orange caps kicker → bold ink feature title → one-to-two-line description in Regular. Repeat; no bullets needed.

**Stat block**
- Huge number + small caps label beneath; optional mini world/regional map beside it showing coverage.

**Spec table** (e.g. satellite specs)
- Header row in orange caps text on white, values in ink; thin grey-300 row dividers; no vertical rules.

**Data panels / dashboards**
- Dark theme by default (`space-950` background, `space-900` panels) so map imagery reads clearly. Legends bottom-left, white text, 11px caption style.

**Footer / closing page**
- Navy space background with satellite image, centred wordmark, "WANT TO REACH US FAST? SCAN HERE" in white caps with orange accent, QR code in a white rounded square.

## 9. Voice & copy

- Confident, outcome-led, short. Lead with the benefit: "Monitor ground movement to the millimetre."
- Use the brand's own vocabulary: *actionable insights, high temporal & high spatial resolution, AI-driven, satellite-based*.
- Headings are statements, not questions — except for explainers ("WHAT IS INSAR?", "WHY SHOULD WE CARE?").
- British/Malaysian spelling (organisation, colour, metre).

## 10. Do / Don't

**Do**
- Keep orange to accents and one CTA per view.
- Put real satellite or map imagery in every section.
- Use uppercase ExtraBold Montserrat for all titles.
- Label every map with sensor, date, and units.

**Don't**
- Fill large areas with orange or use orange body text.
- Mix in additional brand colours (purples, greens) outside data views.
- Use rounded "bubbly" fonts or thin light weights for headings.
- Place body text directly on unscrimmed imagery.

## 11. CSS starter

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,700;0,800;1,400&display=swap');

:root {
  --geo-orange: #F26522;
  --geo-orange-hover: #D9561A;
  --geo-orange-tint: #FDE3D5;
  --geo-space-950: #091926;
  --geo-space-900: #182942;
  --geo-steel: #3E606F;
  --geo-ink: #231F20;
  --geo-graphite: #404040;
  --geo-grey-300: #B5B7BD;
  --geo-surface: #F5F5F5;
  --geo-font: 'Montserrat', 'Segoe UI', Arial, sans-serif;
}

body { font-family: var(--geo-font); color: var(--geo-ink); background: var(--geo-surface); line-height: 1.6; }
h1, h2, h3 { font-weight: 800; text-transform: uppercase; letter-spacing: .02em; }
.kicker { color: var(--geo-orange); font-weight: 800; text-transform: uppercase; font-size: 13px; letter-spacing: .04em; }
.accent { color: var(--geo-orange); }
.hero { background: linear-gradient(180deg, rgba(9,25,38,.2), rgba(9,25,38,.9)), var(--hero-img) center/cover; color: #fff; }
.btn-primary { background: var(--geo-orange); color: #fff; font-weight: 700; text-transform: uppercase; border-radius: 4px; padding: 12px 24px; }
.card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(9,25,38,.08); border-left: 4px solid var(--geo-orange); }
```
