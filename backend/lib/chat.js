// Per-pairing text chat: the auto-sent warm introduction, conversation
// starters on shift day, and the contact-info guard (no phone numbers,
// emails or social handles until both people opt in inside the app).
const db = require('../db');
const clock = require('./clock');
const { safeParseArray } = require('../matching/engine');
const { weekdayName } = require('./time');

function post(pairingId, { kind, body, senderUserId = null, visibleTo = null }) {
  const info = db.prepare(`
    INSERT INTO messages (pairing_id, sender_user_id, kind, body, visible_to_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(pairingId, senderUserId, kind, body, visibleTo, clock.isoNow());
  return info.lastInsertRowid;
}

function article(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

// "You've been paired with Jordan for Saturday's shift at Humane Society!
// Jordan is a nurse who has volunteered in animal welfare before and is into
// hiking." Built only from the partner's own profile fields and cause-level
// history — never names past orgs.
function introFor(partner, shift) {
  const name = partner.display_name;
  const pieces = [`You've been paired with ${name} for ${weekdayName(shift.starts_at, shift.timezone)}'s shift at ${shift.org.name}!`];
  const occupation = partner.occupation?.trim();
  const experienced = safeParseArray(partner.cause_tags_experienced);
  const interests = safeParseArray(partner.interest_tags).slice(0, 2);
  let sentence = occupation ? `${name} is ${article(occupation)} ${occupation.toLowerCase()}` : `${name}`;
  sentence += experienced.length
    ? ` who has volunteered in ${experienced.slice(0, 2).join(' and ').toLowerCase()} before`
    : ' and this is one of their first shifts with us';
  if (interests.length) sentence += `, and is into ${interests.join(' and ').toLowerCase()}`;
  pieces.push(`${sentence}.`);
  if (partner.bio) pieces.push(`In their words: "${partner.bio}"`);
  return pieces.join(' ');
}

function sendIntros(pairing, shift, userA, userB) {
  post(pairing.id, { kind: 'intro', body: introFor(userB, shift), visibleTo: userA.id });
  post(pairing.id, { kind: 'intro', body: introFor(userA, shift), visibleTo: userB.id });
}

// Contact details: emails, phone numbers, @handles, social-profile links and
// "insta: name"-style mentions. Deliberately broad — a false positive just
// asks the sender to opt in first.
const CONTACT_PATTERNS = [
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  /(?:\+?\d[\s().-]?){7,}/,
  /(^|\s)@[a-z0-9_.]{2,}/i,
  /\b(instagram|insta|ig|snapchat|snap|whatsapp|telegram|tiktok|discord|facebook|fb|twitter|linkedin)\b\s*[:\-]?\s*@?[a-z0-9_.]{2,}/i,
  /\b(instagram|snapchat|tiktok|facebook|twitter|x|linkedin|t)\.(com|me)\/\S+/i,
];

function containsContactInfo(text) {
  return CONTACT_PATTERNS.some((re) => re.test(text));
}

// Cause-tied prompts, delivered into the thread across the shift.
const STARTERS = {
  default: [
    'Ask how they first heard about today\'s org.',
    'Which part of today do you think will stick with you?',
    "What's one thing from today you'd tell a friend about?",
  ],
  'Animal welfare': [
    'Ask whether they have (or grew up with) any animals.',
    "Which of today's animals would you each take home?",
    'What do you think makes a shelter animal more likely to get adopted?',
  ],
  'Food banks & shelters': [
    'Ask whether they cook — and what their go-to dish is.',
    "What's a meal that reminds you of home?",
    'What surprised you most about how a food bank runs?',
  ],
  'Environmental cleanups': [
    "Ask about their favorite outdoor spot around here.",
    "What's the strangest thing you've found on a cleanup?",
    "What's one small habit you'd like to change after today?",
  ],
  'Youth mentorship': [
    'Ask who mentored them when they were younger.',
    'What do you wish someone had told you at that age?',
    "What's a skill you'd love to pass on to a kid?",
  ],
  'Elder care': [
    'Ask about the best advice an older relative ever gave them.',
    'What do you hope life looks like at 80?',
    "What's a story you heard today that stuck with you?",
  ],
  'Community organizing': [
    'Ask what local issue they care about most.',
    "What's one change in this neighborhood you'd love to see?",
    'Have you ever been to a city council meeting?',
  ],
};

function starterFor(shift, index) {
  const cause = shift.cause_tags.find((tag) => STARTERS[tag]);
  const list = STARTERS[cause] ?? STARTERS.default;
  return list[index % list.length];
}

module.exports = { post, introFor, sendIntros, containsContactInfo, starterFor };
