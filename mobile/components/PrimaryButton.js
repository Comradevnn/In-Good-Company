import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

// Shared footer + primary pill button, matching specs/plotline.html's
// .footer-cta / .btn-primary styling.
export default function PrimaryButton({ label, onPress, disabled, loading }) {
  return (
    <View style={styles.footer}>
      <TouchableOpacity
        style={[styles.btnPrimary, disabled && styles.btnPrimaryDisabled]}
        disabled={disabled}
        onPress={onPress}
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.btnPrimaryText}>{label}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  btnPrimary: {
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryDisabled: {
    backgroundColor: '#C8CCC1',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#F6F4EA',
    fontSize: 15,
    fontWeight: '600',
  },
});
