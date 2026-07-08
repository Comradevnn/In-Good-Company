import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

// Shared topbar across onboarding screens — back button + step progress
// dots, matching specs/plotline.html's .topbar/.progress styling.
//
// Two modes:
// - Linear onboarding: pass step/total, back button is decorative (no
//   onBack — there's nowhere to go back to in the linear flow yet).
// - Reopened from Settings to edit one section: pass title + onBack
//   instead of step/total — shows a plain title and a working back button
//   that returns to Settings, rather than a step-progress readout that
//   wouldn't mean anything outside the linear flow.
export default function OnboardingTopBar({ step, total, title, onBack }) {
  const isEditMode = step == null;

  return (
    <View style={styles.topbar}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} disabled={!onBack}>
        <Text style={styles.backBtnText}>←</Text>
      </TouchableOpacity>
      {isEditMode ? (
        <Text style={styles.editTitle}>{title}</Text>
      ) : (
        <View style={styles.progress}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.progressDot, i < step && styles.progressDotDone]} />
          ))}
        </View>
      )}
      <View style={styles.spacer32} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: colors.ink,
    fontSize: 16,
  },
  editTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.ink,
  },
  progress: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  progressDot: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  progressDotDone: {
    backgroundColor: colors.moss,
  },
  spacer32: {
    width: 32,
  },
});
