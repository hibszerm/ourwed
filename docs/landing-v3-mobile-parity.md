# Landing V3 — Desktop ↔ Mobile Parity Spec

**Route:** `/landing-v3` (review only). Production `/` untouched.  
**Desktop freeze:** ≥1100px — no visual/DOM/animation/copy changes.  
**Mobile canvas:** viewport 390 → content column 358px (`100vw − 32px` padding).  
**Principle:** Mobile must be recognizable as the same composition as desktop without reading the heading.

Baselines:

| Capture | Path |
|---|---|
| Desktop 1440×1000 | `docs/landing-v3-parity/desktop/baseline-1440x1000.png` |
| Desktop 1280×900 | `docs/landing-v3-parity/desktop/baseline-1280x900.png` |
| Mobile current 390 | `docs/landing-v3-parity/mobile/current-390-*.png` |
| Comparison sheets | `docs/landing-v3-parity/comparison/*.png` |

---

## Why previous dedicated artboards diverged

Previous Pattern-B artboards were **independently redesigned mini-infographics**:

- Import became three equal step chips + tiny sheet/doc + small result (reads as a diagram, not the desktop two-panel product).
- Assignment scaled a hub but at too-small visual scale / lost connector presence.
- QC became two equal mini panels instead of asymmetric form→document story.
- Finance collapsed into a dark summary stack rather than the 12-col bento.
- Wedding Day fused into one itinerary card, losing questionnaire→plan transfer.
- Brief lost rear-page depth.
- Sessions became two identical cards (lost editorial asymmetry).
- Overall: headings dwarfed tiny artboards (~320–420px tall miniatures).

---

## Hero

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-hero.png` |
| Current mobile | `mobile/section-hero.png` |
| Dominant object | Nearest-assignment product card inside dashboard shell |
| Secondary | CTAs, capability line |
| Relationship | Editorial headline → full product preview |
| Required mobile | Preserve current hero; assignment card ~100% content column; 16px side margin; 16–24px breathing after card |
| May remove | Desktop sidebar chrome detail |
| Must remain | Heading, CTAs, nearest-assignment card, names/date/location |
| Target height | ~760–920px section @390 |

---

## Import

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-import.png` |
| Current mobile | `mobile/section-import.png` |
| Dominant object | Large **prepared assignment result** card (right panel on desktop) |
| Secondary | Spreadsheet panel, attached contract PDF, 3 process steps above |
| Relationship | Steps → sources (sheet + contract) → verified assignment |
| Required mobile | Same hierarchy on 358px: steps row → side-by-side sources → **dominant result (~88–94% width)** |
| May remove | Extra spreadsheet rows beyond 3; deposit/location meta rows |
| Must remain | Steps labels; sheet filename; PDF mark; Julia i Adrian; date; Film + Foto; 12 900 zł; Gotowe do zatwierdzenia; surface/radius/shadow language |
| Target artboard | **358 × 500–570px** |

---

## Assignment overview

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-assignment.png` |
| Current mobile | `mobile/section-assignment.png` |
| Dominant object | Central graphite assignment hub |
| Secondary | Six modules (Dane pary / Umowa / Płatności / Ankieta / Plan dnia / Brief) + connector lines |
| Relationship | Hub radiates to six capability modules |
| Required mobile | Dominant hub + 2×3 module grid + subtle connectors; not a vertical feature list |
| May remove | Long module copy; calendar sixth can replace “Dane pary” with Kalendarz per prior brief if needed — prefer desktop six titles condensed |
| Must remain | Hub name/date/package/status; six modules with status; connector hint |
| Target artboard | **358 × 500–590px** |

---

## Questionnaire / contract (QC)

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-qc.png` |
| Current mobile | `mobile/section-qc.png` |
| Dominant object | Contract document surface |
| Secondary | Questionnaire form; mapping chips |
| Relationship | Form → mapping chips → generated contract (asymmetric) |
| Required mobile | Overlapping/asymmetric: form ~47% / doc ~59%; chips between; both visible from frame 0 |
| May remove | Address/notes fields; legal paragraphs |
| Must remain | Key fields (Julia, phone, date, package); mapping labels; document status “Umowa wygenerowana” |
| Target artboard | **358 × 520–650px** |
| Animation | ≤1.8s; once; final persists |

---

## Finances

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-finance.png` |
| Current mobile | `mobile/section-finance.png` |
| Dominant object | Large assignment finance card (Card A) |
| Secondary | Season card with month bars; next payment; month focus |
| Relationship | 12-col bento: A spans left tall; B top-right; C/D bottom-right |
| Required mobile | Bento grid: full A → Paid/Remaining pair → season bars → next/active pair |
| May remove | Full payment list rows inside A |
| Must remain | 12 900 / 5 500 / 7 400; progress; season totals; Jan–Jun bars; 18 active |
| Target artboard | **358 × 520–620px** |

---

## Wedding Day (graphite)

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-day.png` |
| Current mobile | `mobile/section-day.png` |
| Dominant object | Itinerary plan card |
| Secondary | Questionnaire answers card; route totals |
| Relationship | Answers applied → organized itinerary + totals |
| Required mobile | Distinct questionnaire card + larger itinerary + footer totals; status “Zastosowano odpowiedzi” |
| May remove | Some questionnaire fields |
| Must remain | Two surfaces; 5 stops; 57 km · 1 godz. 20 min; graphite field |
| Target artboard | **358 × 570–680px** |
| Animation | ≤2s |

---

## Mobile phones

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-phones.png` |
| Current mobile | `mobile/section-phones.png` |
| Dominant object | Primary iPhone (assignment → nav → Brief) |
| Secondary | Rear itinerary phone; benefit rows |
| Relationship | Dual-device product story |
| Required mobile | Preserve geometry/route/Brief; +36–44px copy→phones; more rear phone peek; benefits 28–36px below |
| May remove | None of route logic |
| Must remain | Apartamenty Stary Rynek → Hotel Liberté, 21 min, 16 km; final Brief |
| Target group | ≤340×590 |

---

## Security

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-security.png` |
| Current mobile | `mobile/section-security.png` |
| Dominant object | Classic vertical padlock |
| Secondary | Protected data records converging |
| Relationship | Records → package → lock closes |
| Required mobile | Full lock inside 358×360–420 artboard; records visible initially; copy 32–40px below |
| May remove | 2 of 6 records |
| Must remain | Classic lock body/shackle/keyhole; status; no blank stage; no crop |
| Animation | ≤1.75s |

---

## Calendar

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-calendar.png` |
| Current mobile | `mobile/section-calendar.png` |
| Dominant object | Full June 2027 month surface |
| Secondary | Integration footer (OurWed / Google / Apple) |
| Relationship | Large month card with sync strip |
| Required mobile | Same month structure, padding 10–14px, event chips readable |
| May remove | Empty-cell metadata |
| Must remain | Header, DOW, full grid, 3–4 events, integrations, radius/shadow |
| Target artboard | **358 × 440–510px** |

---

## Brief

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-brief.png` |
| Current mobile | `mobile/section-brief.png` |
| Dominant object | Primary brief document page |
| Secondary | Rear/back page depth; numbered benefits |
| Relationship | Layered document + benefits column |
| Required mobile | Rear page offset 10–14px; primary 310–330px wide; complete page; 3 benefit rows below |
| May remove | Dense legal lines; 4th benefit |
| Must remain | Couple, date, plan, contacts, notes; second-page depth |
| Target artboard | **358 × 620–720px** |

---

## Weddings / sessions

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-sessions.png` |
| Current mobile | `mobile/section-sessions.png` |
| Dominant object | Wedding card (Julia i Adrian) |
| Secondary | Session card (Marta i Jakub); divider |
| Relationship | Editorial wide split; wedding typographically larger |
| Required mobile | Larger wedding + smaller session + offset/divider; not twin equal cards |
| May remove | Process line detail |
| Must remain | Asymmetry; kinds ŚLUB/SESJA; key meta |
| Target artboard | **358 × 370–460px** |

---

## Pricing

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-pricing.png` |
| Current mobile | `mobile/section-pricing.png` |
| Dominant object | Annual recommended card |
| Secondary | Trial, Monthly |
| Relationship | Three plans; annual strongest |
| Required mobile | Order Trial → Annual → Monthly; padding 22–26px; ≤4–5 features; no min-height |
| May remove | Repeated full Pro feature lists |
| Must remain | Prices/offer logic; annual emphasis |
| Target | Cards ~330–440px each |

---

## Final CTA

| Field | Spec |
|---|---|
| Desktop screenshot | `desktop/section-cta.png` |
| Current mobile | `mobile/section-cta.png` |
| Dominant object | Completion focus card |
| Secondary | Stacked CTAs |
| Required mobile | Slightly larger completion card; compact; no overflow |
| Must remain | Checklist states; CTAs |

---

## Global mobile rules

1. Artboard `width: 100%; max-width: 358px; margin-inline: auto`.
2. Dominant surface ≥72% artboard width; artboard ≥94% content column; no product artboard visually <310px @390.
3. Essential text ≥11px; secondary ≥9.5px.
4. Wrapper height − composition ≤8px (excl. shadows).
5. Activate on artboard (not tall section): top ~72% viewport; once; fallback 700ms.
6. Phone: activate when ≥80% of primary device visible.
7. Security: records before activation; never blank.

---

## Implementation status

- [x] Spec written (this file)
- [x] Artboards rebuilt to match compositions (parity pass)
- [x] Desktop baseline 1440×1000 captured
- [ ] Comparison sheets fully exported for every section (partial — see mobile QA frames)
- [x] Desktop regression checked (0 mobile artboards @ ≥1100)
- [x] Tests updated

### Measured artboard sizes @390×844 (post-parity)

| Artboard | W×H | Target |
|---|---|---|
| Import | 358×539 | 500–570 |
| Assignment | 358×546 | 500–590 |
| QC | 358×540 | 520–650 |
| Finance | 358×609 | 520–620 |
| Wedding Day | 358×614 | 570–680 |
| Security | 358×400 | 360–420 |
| Calendar | 358×450 | 440–510 |
| Brief | 358×640 | 620–720 |
| Sessions | 358×400 | 370–460 |
| Pricing stack | 358×1016 | 3 cards |

Geometry: `scrollWidth === clientWidth` at 390.