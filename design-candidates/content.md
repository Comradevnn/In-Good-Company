# Shared content for every candidate

Every candidate uses exactly this copy and demo data, so that only the
design differs. Copy is taken verbatim from the current app (mobile/screens,
mobile/components, and server strings the app displays). People,
organizations, addresses and dates are made up for the demo.

## Rules

- **Do not reword, shorten, add or drop any string below.** Typographic
  apostrophes and quotes (’ “ ”) and the en dash in "1–3" are fine in place
  of the straight ones; nothing else changes.
- **Eyebrow strings must appear**, verbatim, but the design skill bans a
  small label sitting above a heading as a kicker. Give each one a real job
  instead: the screen's top-bar title, a status chip or tag, or a section
  label inside a card. The candidate's direction.md says which.
- **Glyphs in the current code are not copy.** `←`, `›`, `✓`, `•`, `🪪`, `☀︎`
  and `🪙` are placeholders for icons: draw them as one consistent icon set
  (authored inline SVG), never as emoji or Unicode glyphs. "✓ Verified" is
  read as a verified icon plus the word "Verified".
- **Demo data is synthetic.** No real people, organizations, addresses or
  contact details. Don't add product claims, numbers or features that are
  not listed here.
- The dev-only bars (DevClockBar, "Backend says…") are not part of the
  design and are left out.

## Frames

Five phone frames, 390 × 844 pt, light mode, in this order:

1. **Sign in** (entry)
2. **Verify your ID** (form step with text inputs and two native date fields, showing a validation error)
3. **Home** (status card, lists, stats)
4. **Shift proposal** (detail and decision)
5. **Proposal expired** (the empty or ended state of screen 4)

Status bar: 9:41, with signal and battery drawn simply. Leave the home
indicator area (bottom 34 pt) clear of controls. On screens with a footer
button, the button sits above the home indicator.

Each frame shows its screen's first view, with as much of the scroll below as
fits; content that would scroll off may be cut by the frame bottom (show
that it scrolls, don't cram). Frames 3 and 4 may additionally be shown as a
second, taller "full scroll" frame if the candidate wants to show the
whole list. That's optional.

---

## 1. Sign in (EmailCaptureScreen, signed-out first screen)

- Eyebrow: Sign in or get started
- H2: What's your email?
- Rationale: We'll use this for shift confirmations, receipts, and getting back into your account.
- Field label: Email. Value (filled): `alex.m@example.com`
- Field label: Password. Value (filled, masked): 10 dots. Placeholder when
  empty: At least 8 characters
- Link: Have a referral code?
- Link: Signing up an organization? Tap here
- Footer primary button (enabled): Continue

App wordmark: the product name, **In Good Company**, may appear on this
screen (it is the app's first screen). No logo exists; a candidate may set the
name typographically. Do not invent a tagline.

## 2. Verify your ID (VerifyIdScreen, details step)

Top bar: back control (accessibility label "Back").

- Eyebrow: Verify your ID
- H2: Confirm it's really you
- Rationale: Checked instantly. We never receive or keep your ID photo, and we store only an irreversible check-value of your document number — never the number itself.
- Field label: What are you verifying with?
  Chips (single select): Driver's license (selected) · Passport · State ID
- Field label: Photo of your ID
  Upload card, captured state: [check icon] Photo captured / Deleted from this device as soon as verification completes — never uploaded.
  Link under it: or choose from your library
- Notice box: Prototype stage: we don't read the document automatically yet — type the details below exactly as printed. Automatic scanning replaces this step later.
- Field label: Full name, as printed on the ID. Value: `Alex Morgan`
  (placeholder when empty: Jordan Michael Smith)
- Two date fields side by side (native date picker fields; tapping opens the OS picker):
  - Date of birth. Value: `1997-06-03`
  - Expiry date. Value: `2025-09-30`, **in the error state**
- Two fields side by side:
  - Document number (wider). Value: `D4471 2093`
    (placeholder when empty: As printed on the document)
  - Issuing country (narrower). Value: `US`
- Helper: Sent securely to check that one document can't verify two accounts. We keep only a scrambled, irreversible check-value — never the number itself.
- Error message: This document is expired (or the date is invalid).
- Quiet link: Not now — go back
- Footer primary button: Review & submit

Also show one **empty** date field state somewhere in the candidate's
direction.md anatomy (placeholder text: Choose a date); the frame itself
shows the filled values above.

## 3. Home (HomeScreen)

Top area:
- Weekday: Thursday
- H2: Hi, Alex
- Notifications button (accessibility label "Notifications") with an unread dot
- Deeds balance badge (top right in the current app): coin icon + `12`

Status card (proposal state):
- Eyebrow: We found you a shift
- Title: Sat, Nov 8 · 9:00 AM, with Jordan
- Body: Take a look and confirm — it's held for you for 21 hours.
- The card is tappable and opens screen 4.

Section: **Upcoming**
- Card: Food bank sorting / Eastside Community Pantry · Wed, Nov 12 · 6:00 PM / With Sam

Section: **Your buddies** — link: See all
- Row: avatar (initial S) · Sam · 2 shifts together

Section: **Your impact** — link: Details
- Stats: Shifts `3` · Hours `9` · Orgs `2`

Plan card:
- Eyebrow: Free plan
- Title: 1 of 2 matched shifts used this month
- Body: 12 Deeds available · 5 held for upcoming shifts.

Navigation rows: Deeds · Premium & referrals · Safety & reporting · Your profile · Account settings

## 4. Shift proposal (PairingScreen, proposal state)

Top bar: back control; screen title: Shift proposal

- Eyebrow: We found you a shift
- H2: Sat, Nov 8 · 9:00 AM – 12:00 PM
- Rationale: Here's exactly where you'd go and who with. Nothing is held until you confirm. Respond within 21 hours.

Shift card:
- Eyebrow: The shift  ·  [sun icon] Daytime
- Title: Northside Animal Rescue
- Rows:
  - Cause: Animal welfare
  - When: Sat, Nov 8 · 9:00 AM – 12:00 PM
  - Where: 412 Alder St, Northside
  - Task: Dog walking & kennel care
- Description: Walk the long-stay dogs, refresh kennels, and help with the 11 AM feeding round. Closed-toe shoes, please.

Partner card:
- Avatar (initial J)
- Name line: Jordan, 29
- Meta: Nurse · Female
- Badge: [verified icon] Verified
- Bio (quoted): "Night shifts mean my Saturdays are free, and I'd rather spend them outside with a few dogs."
- Tags: 4 shifts · Animal welfare · Food insecurity

Deposit box:
- Held from your Deeds when you confirm — `5`
- You have available — `12`
- Fine print: Show up and they all come back. Change your mind shortly after confirming and they're released, no questions asked. After that, backing out or not showing up means they go to the org. If Jordan cancels, you never pay for it.

Safety notice (required before a first shift):
- Title: Before your first shift
- Bullets:
  - You'll always meet at the org's own site, with their staff around — shifts are never at someone's home.
  - Where we can, we point out shifts that happen in daylight.
  - Your phone number, email and socials stay hidden until you both switch on contact sharing in chat.
  - Tap "Share my plans" to send someone you trust the time, the place and your partner's verified first name.
  - If anything feels off, report it from the app — a real person reads every report.
  - A verified badge means we've checked who someone is. It doesn't vouch for anything else, so go with your gut and lean on the org's staff.
- Toggle (off): I've read this

Quiet link: Not this one — keep looking

Footer primary button: Confirm & hold 5 Deeds. **Disabled** in this frame,
because "I've read this" is still off. Show the disabled style clearly.

## 5. Proposal expired (PairingScreen, ended state)

Top bar: back control; screen title: Your shift

- H2: This proposal expired
- Rationale: Any Deeds you had on hold for it are back in your balance.
- Button: Back to home

This is the thinnest screen in the app. Design it as a real ended or empty
state (composition, an illustration or icon from the candidate's own
icon set, spacing), without adding copy.
