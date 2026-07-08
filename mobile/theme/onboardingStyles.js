import { StyleSheet } from 'react-native';
import { colors } from './colors';

// Shared text/field styles across onboarding screens, matching
// specs/plotline.html's .eyebrow / h2 / p.rationale / .field conventions.
export const onboardingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 22,
    paddingTop: 26,
    paddingBottom: 18,
  },
  eyebrow: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.mossDark,
    marginBottom: 8,
  },
  h2: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 24,
    lineHeight: 29,
    color: colors.ink,
    marginBottom: 6,
  },
  rationale: {
    fontFamily: 'Inter_400Regular',
    color: colors.inkSoft,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  field: {
    marginTop: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  textarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    color: colors.danger,
    fontSize: 13,
    marginTop: 16,
  },
  successText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.mossDark,
    fontSize: 13,
    marginTop: 16,
  },
  // chip-grid / chip (causes screen)
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 16,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 999,
  },
  chipSelected: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: colors.ink,
  },
  chipTextSelected: {
    color: '#F6F4EA',
  },
  // toggle-row (prefs screen)
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
    marginTop: 12,
  },
  toggleLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: colors.ink,
    flex: 1,
  },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.line,
    justifyContent: 'center',
    padding: 3,
  },
  switchTrackOn: {
    backgroundColor: colors.moss,
  },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  // option-card (org-or-cause screen)
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
    backgroundColor: colors.surface,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.mossTint,
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
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 15.5,
    color: colors.ink,
  },
  optionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  optionArrow: {
    color: colors.inkSoft,
    fontSize: 16,
  },
  // locate-card (location screen)
  locateCard: {
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    backgroundColor: colors.mossTint,
  },
  pin: {
    fontSize: 26,
  },
  valuePill: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.mossDark,
    backgroundColor: colors.mossTint,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fitLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  fitLabelText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.inkSoft,
  },
});
