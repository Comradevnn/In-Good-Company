import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { font, radii, touch, type } from './tokens';

// Post-onboarding screens (home, waiting, pairing, chat, rating, buddies, org side) in direction B
// ("Overprint"): design-candidates/B/direction.md. Cards are tinted, rounded and flat; lists are
// separate rows with 8 gaps; there are no hairlines and no kickers.
const bodyBold = { ...type.bodyS, fontFamily: font.textBold };
const underlinedLink = {
  fontFamily: font.textBold,
  fontSize: 16,
  lineHeight: 22,
  textDecorationLine: 'underline',
  textAlign: 'center',
  paddingVertical: 13,
};

export const app = StyleSheet.create({
  sectionTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    minHeight: touch.link, marginTop: 24, marginBottom: 4,
  },
  sectionTitle: { ...type.titleL, color: colors.ink, flexShrink: 1 },
  sectionLink: { fontFamily: font.textBold, fontSize: 16, lineHeight: 22, color: colors.ink, textDecorationLine: 'underline' },

  partnerCard: { borderRadius: radii.card, padding: 20, marginTop: 16, backgroundColor: colors.person1Tint },
  partnerTop: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.person1, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: font.black, fontSize: 24, color: colors.ink },
  h3: { ...type.titleS, color: colors.ink },
  partnerMeta: { ...type.bodyS, color: colors.ink2, marginTop: 2 },
  badgeVerified: {
    height: touch.tag, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.surface,
    borderWidth: 2, borderColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 12, marginTop: 8,
  },
  badgeVerifiedText: { ...type.label, color: colors.ink },
  blurb: { ...type.body, fontFamily: font.textSemiBold, color: colors.ink, marginTop: 12 },
  historyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tagPill: {
    height: touch.tag, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface,
    borderWidth: 2, borderColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 12,
  },
  tagPillText: { ...type.label, color: colors.ink },

  shiftCard: { marginTop: 16, borderRadius: radii.card, padding: 20, backgroundColor: colors.tint },
  shiftTags: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  shiftEyebrow: {
    ...type.label, color: colors.onInk, backgroundColor: colors.ink, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, overflow: 'hidden',
  },
  shiftTitle: { ...type.titleL, color: colors.ink, marginTop: 16, marginBottom: 8 },
  shiftRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 8 },
  shiftRowFirst: { paddingTop: 0 },
  shiftRowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  shiftRowText: { flex: 1 },
  shiftRowLabel: { fontFamily: font.textBold, fontSize: 14, lineHeight: 18, color: colors.ink2 },
  shiftRowValue: { fontFamily: font.textSemiBold, fontSize: 16, lineHeight: 22, color: colors.ink },

  statusCard: { marginTop: 16, borderRadius: radii.hero, padding: 20, backgroundColor: colors.field, overflow: 'hidden' },
  statusCardWaiting: { backgroundColor: colors.tint },
  statusEyebrow: {
    ...type.label, color: colors.ink, backgroundColor: colors.surface, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, overflow: 'hidden', marginBottom: 12,
  },
  statusEyebrowWaiting: { backgroundColor: colors.surface },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  statusTitle: { ...type.titleM, color: colors.ink },
  statusBody: { ...type.body, fontFamily: font.textSemiBold, color: colors.ink, marginTop: 6 },
  statusBodyWaiting: { color: colors.ink },
  statusArrow: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },

  safetyCard: { marginTop: 16, borderRadius: radii.notice, padding: 20, backgroundColor: colors.tint },
  safetyCardOk: { backgroundColor: colors.successTint },
  safetyCardWarn: { backgroundColor: colors.fieldTint },
  safetyTitle: { ...type.subtitle, color: colors.ink },
  safetyTitleOk: { color: colors.ink },
  safetyTitleWarn: { color: colors.ink },
  safetyBody: { ...type.bodyS, color: colors.ink2, marginTop: 4 },
  safetyBodyOk: { color: colors.ink },
  safetyBodyWarn: { color: colors.ink },

  depositBox: { marginTop: 16, borderRadius: radii.card, padding: 20, backgroundColor: colors.tint },
  depositLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  depositLabel: { ...type.bodyS, color: colors.ink2 },
  depositTotal: { fontFamily: font.textBold, fontSize: 16, lineHeight: 22, color: colors.ink },
  depositTotalRow: { marginTop: 8, paddingTop: 8 },
  finetext: { fontFamily: font.textMedium, fontSize: 14, lineHeight: 20, color: colors.ink2, marginTop: 8 },

  ctaInline: { marginTop: 24, borderRadius: radii.card, padding: 20, alignItems: 'center', backgroundColor: colors.tint },
  ctaInlineText: { ...type.bodyS, color: colors.ink, marginBottom: 12, textAlign: 'center' },

  pillBtn: {
    minHeight: touch.button, borderRadius: radii.pill, paddingVertical: 12, paddingHorizontal: 24,
    backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  pillBtnText: { ...type.button, color: colors.onInk },
  ghostBtn: {
    minHeight: touch.button, borderRadius: radii.pill, paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnText: { ...type.button, color: colors.ink },
  dangerLink: { ...underlinedLink, color: colors.danger },
  quietLink: { ...underlinedLink, color: colors.ink },
  yesNoRow: { flexDirection: 'row', gap: 12, marginTop: 12 },

  statRow: { flexDirection: 'row', marginTop: 16, borderRadius: radii.card, paddingVertical: 20, paddingHorizontal: 8, backgroundColor: colors.tint },
  statBox: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statNum: { ...type.display, color: colors.ink, textAlign: 'center' },
  statLbl: { ...type.label, color: colors.ink2, textAlign: 'center', marginTop: 4 },

  buddyMini: {
    minHeight: touch.navRow, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.notice,
    paddingVertical: 12, paddingHorizontal: 16, marginTop: 8, backgroundColor: colors.tint,
  },
  buddyName: { ...type.subtitle, color: colors.ink },
  buddySub: { ...type.bodyS, color: colors.ink2 },
  miniBtn: {
    minHeight: touch.back, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink,
    borderRadius: radii.pill, paddingHorizontal: 16,
  },
  miniBtnText: { ...type.label, color: colors.ink },

  discoverCard: { borderRadius: radii.card, padding: 20, marginTop: 12, backgroundColor: colors.tint },
  discoverTitle: { ...type.titleS, color: colors.ink },
  discoverOrg: { ...type.bodyS, color: colors.ink2, marginTop: 2 },
  discoverMeta: { ...type.bodyS, color: colors.ink2, marginTop: 8 },

  waitWrap: { alignItems: 'center', paddingTop: 12 },
  waitStatus: { ...type.titleL, color: colors.ink, textAlign: 'center', marginTop: 24 },
  waitSub: { ...type.body, color: colors.ink2, textAlign: 'center', marginTop: 8, maxWidth: 320 },

  msgSystem: { alignSelf: 'center', maxWidth: '92%', backgroundColor: colors.accentTint, borderRadius: radii.notice, paddingVertical: 12, paddingHorizontal: 16 },
  msgSystemText: { ...type.bodyS, color: colors.ink, textAlign: 'center' },
  msgThem: {
    alignSelf: 'flex-start', maxWidth: '78%', backgroundColor: colors.tint, borderRadius: radii.notice,
    borderBottomLeftRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
  },
  msgMe: {
    alignSelf: 'flex-end', maxWidth: '78%', backgroundColor: colors.you, borderRadius: radii.notice,
    borderBottomRightRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
  },
  msgText: { ...type.body, color: colors.ink },
  msgTextMe: { color: colors.onYou },
  starterChip: {
    alignSelf: 'center', minHeight: touch.chip, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink,
    borderRadius: radii.pill, paddingHorizontal: 16, maxWidth: '92%',
  },
  starterChipText: { ...type.label, color: colors.ink, textAlign: 'center' },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: touch.pageMargin, paddingTop: 16, paddingBottom: 24,
    backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.tint,
  },
  chatInput: {
    flex: 1, minHeight: touch.field, borderWidth: 2, borderColor: colors.edge, borderRadius: radii.field, paddingHorizontal: 16,
    fontFamily: font.textSemiBold, fontSize: 17, color: colors.ink, backgroundColor: colors.surface,
  },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: colors.onInk, fontSize: 16 },

  iconRateRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  iconRateBtn: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  iconRateBtnSelected: { backgroundColor: colors.selected, borderColor: colors.ink },
  iconRateText: { fontFamily: font.black, fontSize: 22, lineHeight: 28, color: colors.ink },
  iconRateLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, width: 312 },
  iconRateLabel: { ...type.caption, color: colors.ink2 },
  thumbRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  thumbBtn: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbBtnUp: { backgroundColor: colors.successTint, borderColor: colors.success },
  thumbBtnDown: { backgroundColor: colors.dangerTint, borderColor: colors.danger },
  privateNote: { fontFamily: font.textMedium, fontSize: 14, lineHeight: 20, color: colors.ink2, marginTop: 8 },
  divider: { height: 0, marginVertical: 12 },

  doneWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  doneBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  doneBadgeText: { fontSize: 28, color: colors.onSuccess },

  upgradeCard: { marginTop: 24, borderRadius: radii.card, padding: 20, backgroundColor: colors.fieldTint },
  upgradeTitle: { ...type.titleS, color: colors.ink, marginTop: 8 },
  upgradeBody: { ...type.bodyS, color: colors.ink2, marginTop: 6 },

  settingsRow: {
    minHeight: touch.navRow, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.notice, marginTop: 8, backgroundColor: colors.tint,
  },
  settingsRowText: { ...type.subtitle, color: colors.ink },
  settingsArrow: { ...type.titleS, color: colors.ink },
});

// 1 to 5 rating scale. The choice buttons now show the number (see RatingIcons); icon names refer to
// components/Icon.js and colour is a role token.
export const RATING_SCALE = [
  { value: 1, icon: 'close', color: colors.danger, label: 'bad' },
  { value: 2, icon: 'edit', color: colors.danger, label: 'leaning bad' },
  { value: 3, icon: 'minus', color: colors.ink2, label: 'neutral' },
  { value: 4, icon: 'check', color: colors.success, label: 'leaning good' },
  { value: 5, icon: 'arrow-up', color: colors.success, label: 'good' },
];
