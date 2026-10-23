import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { touch, type } from '../theme/tokens';
import { BackButton } from './Controls';

// Shared top bar across onboarding screens: a 48 back circle plus step progress as a row of small
// pills, below the status bar (it applies the top inset itself).
//
// Two modes:
// - Linear onboarding: pass step/total and onBack (a step back, or from the first step back to
//   sign-in).
// - Reopened from Settings to edit one section: pass title + onBack instead of step/total, which
//   shows the title beside the back button rather than a step-progress readout that wouldn't mean
//   anything outside the linear flow.
export default function OnboardingTopBar({ step, total, title, onBack }) {
  const isEditMode = step == null;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topbar, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <BackButton onPress={onBack} />
        {isEditMode ? (
          <Text style={styles.editTitle} numberOfLines={1} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          <View
            style={styles.progress}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: total, now: step }}
          >
            {Array.from({ length: total }).map((_, i) => (
              <View key={i} style={[styles.progressPill, i < step && styles.progressPillDone]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    backgroundColor: 'transparent',
  },
  bar: {
    height: touch.topBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  editTitle: {
    ...type.subtitleL,
    flex: 1,
    color: colors.ink,
  },
  progress: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingRight: 12,
  },
  progressPill: {
    flex: 1,
    maxWidth: 40,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tint,
  },
  progressPillDone: {
    backgroundColor: colors.ink,
  },
});
