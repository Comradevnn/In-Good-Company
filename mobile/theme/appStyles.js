import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { font, radii, touch, type } from './tokens';

// Post-onboarding screens (home, waiting, pairing, chat, rating, buddies, org side) in direction B
// ("Overprint"): design-candidates/B/direction.md. Cards are tinted, rounded and flat; lists are
// separate rows with 8 gaps; there are no hairlines and no kickers.
export const app = StyleSheet.create({
  partnerCard: { borderRadius: radii.card, padding: 20, marginTop: 16, backgroundColor: colors.person1Tint },
  partnerTop: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  partnerMeta: { ...type.bodyS, color: colors.ink2, marginTop: 2 },
  blurb: { ...type.body, fontFamily: font.textSemiBold, color: colors.ink, marginTop: 12 },
  historyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  // Its own row under the top row: Verified tag, or the quiet checking pill (static, no spinner), or the fallback line.
  partnerBadgeRow: { alignSelf: 'flex-start', marginTop: 12 },
  badgeChecking: { width: 112, height: touch.tag, borderRadius: radii.pill, backgroundColor: colors.surface },

  shiftCard: { marginTop: 16, borderRadius: radii.card, padding: 20, backgroundColor: colors.tint },
  shiftTags: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  shiftTitle: { ...type.titleL, color: colors.ink, marginTop: 16, marginBottom: 8 },
  shiftRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 8 },
  shiftRowFirst: { paddingTop: 0 },
  shiftRowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  shiftRowText: { flex: 1 },
  shiftRowLabel: { fontFamily: font.textBold, fontSize: 14, lineHeight: 18, color: colors.ink2 },
  shiftRowValue: { fontFamily: font.textSemiBold, fontSize: 16, lineHeight: 22, color: colors.ink },
  shiftDescription: { ...type.bodyS, color: colors.ink, marginTop: 18 },

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

  safetyCard: { marginTop: 16, borderRadius: radii.notice, padding: 20, backgroundColor: colors.accentTint },
  safetyCardOk: { backgroundColor: colors.successTint },
  safetyCardWarn: { backgroundColor: colors.fieldTint },
  safetyTitle: { ...type.subtitle, color: colors.ink },
  safetyTitleOk: { color: colors.ink },
  safetyTitleWarn: { color: colors.ink },
  safetyBody: { ...type.bodyS, color: colors.ink2, marginTop: 4 },
  safetyBodyOk: { color: colors.ink },
  safetyBodyWarn: { color: colors.ink },

  finetext: { fontFamily: font.textMedium, fontSize: 14, lineHeight: 20, color: colors.ink2, marginTop: 8 },

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

  // 6px dot centred on the first line of Body S (22 line height); the text column gives the hanging indent.
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink, marginTop: 8 },
  bulletText: { ...type.bodyS, color: colors.ink, flex: 1 },

  deedsBadge: {
    minWidth: 72, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accent, borderRadius: radii.pill, paddingHorizontal: 16,
  },
  deedsBadgeText: { fontFamily: font.black, fontSize: 22, lineHeight: 26, color: colors.ink },

  discoverTitle: { ...type.titleS, color: colors.ink },
  discoverOrg: { ...type.bodyS, color: colors.ink2, marginTop: 2 },
  discoverMeta: { ...type.bodyS, color: colors.ink2, marginTop: 8 },

  // Five 56 circles with 8 gaps need 312; below that the buttons shrink evenly (48 at 320dp), above it they stop at 56.
  iconRateRow: { flexDirection: 'row', gap: 8, marginTop: 12, maxWidth: 312 },
  iconRateBtn: {
    flex: 1, maxWidth: 56, aspectRatio: 1, borderRadius: 28, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  iconRateBtnSelected: { backgroundColor: colors.selected, borderColor: colors.ink },
  iconRateText: { fontFamily: font.black, fontSize: 22, lineHeight: 28, color: colors.ink },
  iconRateLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, maxWidth: 312 },
  iconRateLabel: { ...type.caption, color: colors.ink2 },

  upgradeTitle: { ...type.titleS, color: colors.ink, marginTop: 8 },
  upgradeBody: { ...type.bodyS, color: colors.ink2, marginTop: 6 },
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
