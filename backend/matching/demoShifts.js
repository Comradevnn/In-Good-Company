// DEMO STUB — stands in for the real shifts/orgs data model, which doesn't
// exist yet (org accounts + shift listings are an explicitly deferred
// deliverable, master prompt section 2). Step 1b needs *something* concrete
// to score alignment against; these are hardcoded, clearly-fake shifts
// covering the cause categories a test user can actually pick in
// CausesScreen.js, all in the the launch market launch market (master
// prompt 6.1) so travel-radius checks have realistic numbers to work with.
// date/time are fixed demo values (not computed from "today"), same
// deliberately-fake spirit as everything else here — just enough for the
// match screen to show a real "when/where" instead of nothing.
// None of this is persisted or queryable — it's a constant, not a table.
const DEMO_SHIFTS = [
  {
    id: 'demo-shift-food',
    cause_tags: ['Food banks & shelters'],
    location: { lat: 37.3541, lng: -121.9552 }, // San Jose
    location_label: 'San Jose, CA',
    date: 'Sat, Jul 11',
    time: '9:00–11:30 AM',
    org: {
      id: 'demo-org-food',
      name: 'Second Harvest of Silicon Valley (demo)',
      verified: true,
      mission_tags: ['Food banks & shelters', 'Community organizing'],
    },
  },
  {
    id: 'demo-shift-animal',
    cause_tags: ['Animal welfare'],
    location: { lat: 37.3382, lng: -121.8863 }, // West San Jose
    location_label: 'West San Jose, CA',
    date: 'Sat, Jul 11',
    time: '2:00–4:00 PM',
    org: {
      id: 'demo-org-animal',
      name: 'Humane Society Silicon Valley (demo)',
      verified: true,
      mission_tags: ['Animal welfare', 'Environmental cleanups'],
    },
  },
  {
    id: 'demo-shift-youth',
    cause_tags: ['Youth mentorship'],
    location: { lat: 37.3382, lng: -121.8863 },
    location_label: 'San Jose, CA',
    date: 'Sun, Jul 12',
    time: '10:00 AM–12:00 PM',
    org: {
      id: 'demo-org-youth',
      name: 'Bill Wilson Center (demo)',
      verified: true,
      mission_tags: ['Youth mentorship'],
    },
  },
  {
    id: 'demo-shift-elder',
    cause_tags: ['Elder care'],
    location: { lat: 37.4419, lng: -122.1430 }, // Palo Alto
    location_label: 'Palo Alto, CA',
    date: 'Sun, Jul 12',
    time: '1:00–3:00 PM',
    org: {
      id: 'demo-org-elder',
      name: 'Villages Silicon Valley (demo)',
      verified: true,
      mission_tags: ['Elder care'],
    },
  },
  {
    id: 'demo-shift-cleanup',
    cause_tags: ['Environmental cleanups'],
    location: { lat: 37.3382, lng: -121.8863 },
    location_label: 'West San Jose, CA',
    date: 'Sat, Jul 18',
    time: '8:00–10:00 AM',
    org: {
      id: 'demo-org-cleanup',
      name: 'Guadalupe River Park Conservancy (demo)',
      verified: true,
      mission_tags: ['Environmental cleanups', 'Animal welfare'],
    },
  },
];

module.exports = { DEMO_SHIFTS };
