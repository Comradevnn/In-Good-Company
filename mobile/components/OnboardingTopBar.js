import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

// Shared topbar across onboarding screens — back button + step progress
// dots, matching specs/plotline.html's .topbar/.progress styling.
export default function OnboardingTopBar({ step, total }) {
  return (
    <View style={styles.topbar}>
      <View style={styles.backBtn}>
        <Text style={styles.backBtnText}>←</Text>
      </View>
      <View style={styles.progress}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[styles.progressDot, i < step && styles.progressDotDone]} />
        ))}
      </View>
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
