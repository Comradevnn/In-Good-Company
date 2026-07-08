import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { BACKEND_URL } from '../config/api';
import { saveSessionToken } from '../auth/session';

// Matches the "emailCapture" screen in specs/plotline.html (the first screen
// after the intro), with a password field added since accounts need one —
// the spec screen leans on social sign-in, which we don't have yet.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailCaptureScreen({ onSignedUp }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const isGmail = /@gmail\.com$/i.test(email.trim());
  const canSubmit = emailValid && password.length >= 8 && !submitting;

  async function handleContinue() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong creating your account.');
      }
      await saveSessionToken(data.session_token);
      onSignedUp(data.session_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topbar}>
        <View style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.spacer32} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.eyebrow}>Get started</Text>
        <Text style={styles.h2}>What's your email?</Text>
        <Text style={styles.rationale}>
          We'll use this for shift confirmations, receipts, and getting back into your account.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@gmail.com"
            placeholderTextColor={colors.inkSoft}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>
        {isGmail ? (
          <Text style={styles.gmailHint}>
            ✓ Gmail detected — you'll be able to sign in with one tap next time.
          </Text>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 8 characters"
            placeholderTextColor={colors.inkSoft}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btnPrimary, !canSubmit && styles.btnPrimaryDisabled]}
          disabled={!canSubmit}
          onPress={handleContinue}
        >
          {submitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.btnPrimaryText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
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
  spacer32: {
    width: 32,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 22,
    paddingTop: 8,
  },
  eyebrow: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 11,
    letterSpacing: 1.1,
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
  gmailHint: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.mossDark,
    fontSize: 12.5,
    marginTop: 8,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    color: colors.danger,
    fontSize: 13,
    marginTop: 16,
  },
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
