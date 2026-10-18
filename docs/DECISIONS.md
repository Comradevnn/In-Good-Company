# Product decisions log

Decisions the owner has made that aren't (or aren't yet) in the private
specs, with what was built for each. Newest first. The private specs
remain the source of truth for everything else (see README "Specs").

## 2026-10-18 — Matching iteration 2

### Early bookings wait for a better match (built)

- Matching no longer pairs people the moment a search starts. A pairing
  forms only when its fit score reaches a **match bar**. While the shift is
  a week or more away the bar is 0.95 (on the 0–1 fit score); it then
  falls in a straight line to nothing 48 hours before the shift. It also
  falls as a search uses up its allowed time, so nobody's search runs out
  without a chance to be matched.
- Intent: people should feel we are taking time to find them the best
  match, and booking early should get a better match. Future weight
  tuning should optimise for this.
- A pair needs the higher of the two people's bars. Rematches, solo RSVPs
  and mutual buddy requests skip the bar.
- Held searches show "We're taking our time to find you a really good
  match…" on the waiting screen.
- Note on the 0.95 starting value: with the current weights a strong,
  realistic pair scores roughly 0.8–0.9, so a week out almost nobody is
  matched and pairings form as the bar falls. That is intended for now;
  revisit with real data.
- Code: `backend/matching/config.js` (`matchBar`), `assign.js`
  (`personalBar`, `matchBar`).

### "Match me with anyone" toggle (built)

- Some people want a partner they'll click with; others just want someone
  to go with. Searches carry a `match_preference`: `best` (default, waits
  for the bar) or `anyone` (skips it).
- The toggle is only offered when we predict a partner is likely: someone
  compatible is already searching on overlapping dates. Only a yes/no
  leaves the server.
- It can be switched on from the waiting screen too.
- We collect data on both options (admin metrics:
  `searches_by_match_preference`, with outcomes and average pairing score)
  so one option can later be dropped and the other optimised.

### Org ratings shape matching (built)

- Orgs' ratings of a volunteer (attendance and contribution) give them a
  standing. Highly rated volunteers are preferentially paired together.
  Someone no org has rated yet counts as neutral, never as low.
- Volunteers' public ratings of how well an org runs its shifts are part
  of how well a shift fits.
- Both are pulled toward neutral until there are a few ratings.

### Repeated safety reports pause matching (built)

- Open safety reports from **two different past partners** pause the
  reported person's matching until staff review it. One report alone still
  only blocks the two from being paired again, so a single bad-faith
  report can't pause someone.
- The person is told neutrally ("a person on our team is reviewing your
  account"), with nothing about who reported them or why. Staff see the
  reason on the admin page; clearing the review lifts the pause.

### Cause adjacency (built)

- Youth mentorship and Elder care are now "close" causes (people-facing
  care work with similar screening). The other pairs are unchanged.
- The table will need redoing if the cause list grows beyond the app's
  six labels.

### Score breakdowns are kept until account deletion (no change needed)

- Every pairing's fit score and breakdown is kept for weight tuning and
  support, until the account is deleted.
- Account deletion itself is not built; see the proposal below.

### Proposed, awaiting decision: closing an account without erasing its record

The problem: deleting an account must not erase bad reviews, reliability
history or a ban, or let someone come back clean. Recryption's duplicate
detection can already recognise the same ID document on a new signup.

Proposal — **close, don't erase**:

1. **Closing an account** removes everything personal: name, photo, bio,
   hobbies, values, occupation, location, contact details, availability,
   notifications and sessions. Chat messages they sent are replaced with
   "message removed" for the other person. Pairings, bookings and ratings
   stay as rows (so orgs' and partners' histories still add up) but point
   at an anonymised user.
2. **What is kept**, as a staff-only *integrity record* tied to the
   duplicate-detection key for their ID document (a non-reversible, salted
   fingerprint, not the document itself): orgs' ratings of them, their
   reliability record (no-shows, late cancels), safety reports about them
   and their outcomes, any ban or account review, and who they may never be
   paired with again. Nothing in it identifies them by name or contact.
3. **If they sign up again** and verify the same ID, duplicate detection
   matches the closed record and the new account inherits it: standing,
   reliability, blocks and any open review. If the record carries a ban,
   verification is refused with a neutral "contact support" message.
   Honest users get their good standing back too.
4. **Never-verified accounts** are erased completely. They could never be
   matched, so there's nothing to evade.
5. **Retention**: keep integrity records for a fixed period after closure
   (suggest 3 years), and for bans or serious safety outcomes for longer,
   subject to legal review. The privacy policy and terms must say this up
   front. Data-protection laws generally allow keeping data needed for
   fraud prevention and safety, but this needs a lawyer's sign-off.
6. **Score breakdowns** stay with the anonymised pairings for weight
   tuning (they hold ids, not names).

Open questions: the retention periods, what happens to unspent Deeds and
Premium on closure, and whether a closed account can be reopened (rather
than re-registered) within a grace period.

### Not decided yet / conflicts

- **Search time limit vs. early booking.** A search still ends after the
  waiting cap (a rule from the private spec), so someone booking two weeks
  ahead has their bar lowered over the cap rather than over the time until
  the shift. Recommendation: for early bookings, run the search until
  shortly before the shift instead of stopping at the cap. Needs an owner
  decision, since it changes the spec's waiting rule.
- **Matching guarantees on planned dates** beyond the "anyone" toggle are
  not built.

### Future ideas (not scheduled)

- **Simulated pair interactions** (low priority): use chatbots to simulate
  two people and how they'd get on, in the spirit of Ditto, as an extra
  signal for the fit score.
- Calibrate weights against outcomes (shows up, "volunteer again" answers)
  once real data exists, optimising for early bookings.
