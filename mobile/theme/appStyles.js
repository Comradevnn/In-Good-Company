import { StyleSheet } from 'react-native';
import { colors } from './colors';

// Post-onboarding screens (home, waiting, pairing, chat, rating, buddies,
// org side). Values lifted from specs/plotline.html's card classes
// (.partner-card, .shift-card, .status-card, .safety-card, .msg, .stat-box,
// .buddy-mini, .cta-inline, .deposit-box, .icon-rate-btn …).
export const app = StyleSheet.create({
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 26, marginBottom: 2 },
  sectionTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 15, color: colors.ink },
  sectionLink: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.mossDark },

  partnerCard: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 18, padding: 18, marginTop: 16, backgroundColor: colors.surface },
  partnerTop: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.ochreTint, borderWidth: 2, borderColor: colors.ochre,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Fraunces_600SemiBold', fontSize: 20, color: colors.ochre },
  h3: { fontFamily: 'Fraunces_600SemiBold', fontSize: 18, color: colors.ink },
  partnerMeta: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  badgeVerified: {
    alignSelf: 'flex-start', backgroundColor: colors.tealTint, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, marginTop: 4,
  },
  badgeVerifiedText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: colors.teal },
  blurb: {
    marginTop: 12, fontFamily: 'Inter_400Regular', fontStyle: 'italic', fontSize: 14, lineHeight: 21, color: colors.ink,
    borderLeftWidth: 2.5, borderLeftColor: colors.moss, paddingLeft: 11,
  },
  historyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tagPill: { backgroundColor: colors.mossTint, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  tagPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: colors.mossDark },

  shiftCard: { marginTop: 16, borderRadius: 18, padding: 18, backgroundColor: colors.ink },
  shiftEyebrow: { fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ochre, marginBottom: 8 },
  shiftTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 18, color: '#F2EFE4', marginBottom: 8 },
  shiftRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  shiftRowFirst: { borderTopWidth: 0 },
  shiftRowLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#D9D6C8' },
  shiftRowValue: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#F2EFE4', flexShrink: 1, textAlign: 'right' },

  statusCard: { marginTop: 18, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 17, backgroundColor: colors.moss },
  statusCardWaiting: { backgroundColor: colors.ink },
  statusEyebrow: { fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: '#CFE0D0', marginBottom: 4 },
  statusEyebrowWaiting: { color: colors.ochre },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  statusTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 17, color: '#F3F1E5' },
  statusBody: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#D9E7D9', marginTop: 3, lineHeight: 18 },
  statusBodyWaiting: { color: '#C9C6B8' },
  statusArrow: { fontSize: 18, color: '#F3F1E5' },

  safetyCard: { marginTop: 14, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface },
  safetyCardOk: { backgroundColor: colors.mossTint },
  safetyCardWarn: { backgroundColor: colors.ochreTint, borderColor: '#C98A2E' },
  safetyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.ink },
  safetyTitleOk: { color: colors.mossDark },
  safetyTitleWarn: { color: '#8A5A18' },
  safetyBody: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 18, color: colors.inkSoft, marginTop: 4 },
  safetyBodyWarn: { color: '#8A5A18' },

  depositBox: { marginTop: 16, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface },
  depositLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  depositLabel: { fontFamily: 'Inter_400Regular', fontSize: 13.5, color: colors.inkSoft },
  depositTotal: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.ink },
  depositTotalRow: { borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed', marginTop: 6, paddingTop: 8 },
  finetext: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: colors.inkSoft, marginTop: 8, lineHeight: 17 },

  ctaInline: { marginTop: 22, borderWidth: 1.5, borderColor: colors.moss, borderStyle: 'dashed', borderRadius: 16, padding: 16, alignItems: 'center', backgroundColor: colors.mossTint },
  ctaInlineText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: colors.mossDark, marginBottom: 10, textAlign: 'center', lineHeight: 18 },

  pillBtn: { borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22, backgroundColor: colors.moss, alignItems: 'center' },
  pillBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#F6F4EA' },
  ghostBtn: { borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22, borderWidth: 1.5, borderColor: colors.moss, alignItems: 'center' },
  ghostBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.mossDark },
  dangerLink: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: colors.danger, textAlign: 'center' },
  quietLink: { fontFamily: 'Inter_500Medium', fontSize: 13.5, color: colors.inkSoft, textAlign: 'center' },
  yesNoRow: { flexDirection: 'row', gap: 10, marginTop: 12 },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  statBox: { flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 13, alignItems: 'center', backgroundColor: colors.surface },
  statNum: { fontFamily: 'Fraunces_600SemiBold', fontSize: 22, color: colors.ink },
  statLbl: { fontFamily: 'Inter_500Medium', fontSize: 10.5, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  buddyMini: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 10, backgroundColor: colors.surface },
  buddyName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.ink },
  buddySub: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: colors.inkSoft },
  miniBtn: { backgroundColor: colors.mossTint, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11 },
  miniBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: colors.mossDark },

  discoverCard: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, padding: 15, marginTop: 12, backgroundColor: colors.surface },
  discoverTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 15.5, color: colors.ink },
  discoverOrg: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  discoverMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 8 },

  waitWrap: { alignItems: 'center', paddingTop: 12 },
  waitStatus: { fontFamily: 'Fraunces_600SemiBold', fontSize: 19, lineHeight: 26, color: colors.ink, textAlign: 'center', marginTop: 22 },
  waitSub: { fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 20, color: colors.inkSoft, textAlign: 'center', marginTop: 8, maxWidth: 300 },

  msgSystem: { alignSelf: 'center', maxWidth: '92%', backgroundColor: colors.mossTint, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14 },
  msgSystemText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 18, color: colors.mossDark, textAlign: 'center' },
  msgThem: { alignSelf: 'flex-start', maxWidth: '78%', backgroundColor: colors.bgDeep, borderRadius: 16, borderBottomLeftRadius: 4, paddingVertical: 11, paddingHorizontal: 14 },
  msgMe: { alignSelf: 'flex-end', maxWidth: '78%', backgroundColor: colors.moss, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 11, paddingHorizontal: 14 },
  msgText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: colors.ink },
  msgTextMe: { color: '#F6F4EA' },
  starterChip: { alignSelf: 'center', backgroundColor: colors.ochreTint, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13, maxWidth: '92%' },
  starterChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.ochre, textAlign: 'center' },
  chatInputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  chatInput: {
    flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 16,
    fontFamily: 'Inter_400Regular', fontSize: 13.5, color: colors.ink, backgroundColor: colors.surface,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 16 },

  iconRateRow: { flexDirection: 'row', gap: 9, marginTop: 10 },
  iconRateBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: 0.5 },
  iconRateBtnSelected: { opacity: 1, transform: [{ scale: 1.1 }] },
  iconRateText: { color: '#fff', fontSize: 17 },
  iconRateLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, width: 256 },
  iconRateLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.inkSoft },
  thumbRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  thumbBtn: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  thumbBtnUp: { backgroundColor: colors.mossTint, borderColor: colors.moss },
  thumbBtnDown: { backgroundColor: colors.ochreTint, borderColor: colors.danger },
  privateNote: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: colors.inkSoft, marginTop: 6 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 22 },

  doneWrap: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 20 },
  doneBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.mossTint, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  doneBadgeText: { fontSize: 28, color: colors.moss },

  upgradeCard: { marginTop: 22, borderRadius: 18, padding: 17, backgroundColor: colors.ink },
  upgradeTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 16, color: '#F2EFE4', marginTop: 2 },
  upgradeBody: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#C9C6B8', marginTop: 6, lineHeight: 18 },

  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingsRowText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: colors.ink },
  settingsArrow: { color: colors.inkSoft, fontSize: 16 },
});

// 5-point rating colors from plotline's .icon-rate-btn[data-rate=…].
export const RATING_SCALE = [
  { value: 1, icon: '✕', color: '#DD4A3F', label: 'bad' },
  { value: 2, icon: '✎', color: '#E8917E', label: 'leaning bad' },
  { value: 3, icon: '−', color: '#C6B597', label: 'neutral' },
  { value: 4, icon: '✓', color: '#7ECB9B', label: 'leaning good' },
  { value: 5, icon: '↑', color: '#34AD64', label: 'good' },
];
