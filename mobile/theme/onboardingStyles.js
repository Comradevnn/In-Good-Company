import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { font, radii, touch, type } from './tokens';

// Shared text, field and control styles across the onboarding and form screens, in direction B
// ("Overprint"): design-candidates/B/direction.md. Keys are used by many screens; the shared
// components in components/Controls.js build on the same values.
export const onboardingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: touch.pageMargin,
    paddingTop: 16,
    paddingBottom: 24,
  },
  // B has no kickers: the old eyebrow is a tag (Label in a 32 pill).
  eyebrow: {
    ...type.label,
    alignSelf: 'flex-start',
    color: colors.ink,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  h2: {
    ...type.headline,
    color: colors.ink,
    marginBottom: 8,
  },
  rationale: {
    ...type.bodyS,
    color: colors.ink2,
    marginTop: 4,
  },
  field: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    ...type.label,
    color: colors.ink,
    marginBottom: 8,
  },
  // No lineHeight on purpose: a line height on a single-line TextInput shifts the text on iOS.
  input: {
    height: touch.field,
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: radii.field,
    paddingHorizontal: 16,
    paddingVertical: 0,
    fontFamily: font.textSemiBold,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.surface,
    textAlignVertical: 'center',
  },
  textarea: {
    height: undefined,
    minHeight: 112,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top',
  },
  errorText: {
    ...type.bodyS,
    fontFamily: font.textBold,
    color: colors.danger,
    marginTop: 12,
  },
  successText: {
    ...type.bodyS,
    fontFamily: font.textBold,
    color: colors.success,
    marginTop: 12,
  },
  // chip-grid / chip (causes screen)
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  chip: {
    minHeight: touch.chip,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
  },
  chipSelected: {
    backgroundColor: colors.selected,
    borderColor: colors.ink,
  },
  chipText: {
    ...type.label,
    color: colors.ink,
  },
  chipTextSelected: {
    color: colors.ink,
  },
  // toggle-row (prefs screen): the whole row, at least 56 tall, is the target
  toggleRow: {
    minHeight: touch.switchRow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  toggleLabel: {
    ...type.fieldValue,
    fontFamily: font.textBold,
    color: colors.ink,
    flex: 1,
  },
  // 56 x 32 track, 2px ink border; the thumb is positioned inside it
  switchTrack: {
    width: 56,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  switchTrackOn: {
    backgroundColor: colors.selected,
  },
  switchThumb: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.ink,
  },
  switchThumbOn: {
    left: 28,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  // option-card (org-or-cause screen): a nav row
  optionCard: {
    minHeight: touch.navRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radii.notice,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.tint,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconText: {
    fontSize: 19,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    ...type.subtitle,
    color: colors.ink,
  },
  optionSubtitle: {
    ...type.bodyS,
    color: colors.ink2,
    marginTop: 2,
  },
  optionArrow: {
    ...type.titleS,
    color: colors.ink,
  },
  // locate-card (location screen)
  locateCard: {
    marginTop: 16,
    borderRadius: radii.card,
    padding: 20,
    alignItems: 'center',
    backgroundColor: colors.tint,
  },
  pin: {
    fontSize: 26,
  },
  valuePill: {
    ...type.label,
    color: colors.ink,
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fitLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  fitLabelText: {
    ...type.caption,
    color: colors.ink2,
  },
});
