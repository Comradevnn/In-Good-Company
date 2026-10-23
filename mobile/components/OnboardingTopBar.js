import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { DEEDS_BADGE_RESERVE, HEAD_TEXT, touch, type } from '../theme/tokens';
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
//
// The title and the progress pills stop short of the right edge by DEEDS_BADGE_RESERVE, where App.js
// floats the Deeds badge. insetTop (default true) adds the status-bar inset; pass false for a bar
// placed inside a HeroField, which already pads for it.
export default function OnboardingTopBar({ step, total, title, onBack, insetTop = true }) {
  const isEditMode = step == null;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topbar, insetTop && { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <BackButton onPress={onBack} />
        {isEditMode ? (
          <Text style={styles.editTitle} numberOfLines={1} {...HEAD_TEXT} accessibilityRole="header">
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
    paddingRight: DEEDS_BADGE_RESERVE,
  },
  progress: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingRight: DEEDS_BADGE_RESERVE,
  },
  // To do: an empty pill with a 2px edge outline. Done: solid ink. Same box either way.
  progressPill: {
    flex: 1,
    maxWidth: 40,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.edge,
    backgroundColor: 'transparent',
  },
  progressPillDone: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
});
