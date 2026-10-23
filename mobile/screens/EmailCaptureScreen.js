import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { font, radii, touch } from '../theme/tokens';
import { DiscPair, DisplayS, ErrorLine, Headline, HeroField, Icon, InfoCard, Input, KeyboardScroll, LinkButton, Tag } from '../components/AppParts';
import PrimaryButton from '../components/PrimaryButton';
import { BACKEND_URL } from '../config/api';
import { saveSessionToken } from '../auth/session';

// The sign-in screen (the first screen after the intro), with a password field added since accounts need one —
// the spec screen leans on social sign-in, which we don't have yet.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailCaptureScreen({ onSignedUp, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Org staff sign up through the same form; the account kind decides
  // whether they land on volunteer onboarding or the org screens.
  const [isOrg, setIsOrg] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  // Set once sign-in finds no account for this email; the next Continue
  // creates one. Asking first means a typo (or a backend with a different
  // database) can't quietly start a second, empty account.
  const [newAccountEmail, setNewAccountEmail] = useState(null);
  const confirmingNewAccount = newAccountEmail !== null && newAccountEmail === email.trim().toLowerCase();

  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit = emailValid && password.length >= 8 && !submitting;

  async function handleContinue() {
    setError(null);
    setSubmitting(true);
    try {
      // Try login first. If the email has no account yet, ask before
      // creating one (see newAccountEmail). One form, no login/signup toggle.
      const loginResponse = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      let data;
      if (loginResponse.status === 404) {
        if (!confirmingNewAccount) {
          setNewAccountEmail(email.trim().toLowerCase());
          return;
        }
        const signupResponse = await fetch(`${BACKEND_URL}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            kind: isOrg ? 'org' : 'individual',
            referral_code: !isOrg && referralCode.trim() ? referralCode.trim() : undefined,
          }),
        });
        data = await signupResponse.json();
        if (!signupResponse.ok) {
          throw new Error(data.error || 'Something went wrong creating your account.');
        }
      } else {
        data = await loginResponse.json();
        if (!loginResponse.ok) {
          throw new Error(data.error || 'Something went wrong signing in.');
        }
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
    <View style={s.container}>
      <KeyboardScroll
        contentContainerStyle={styles.scrollContent}
        footer={
          <PrimaryButton
            label={confirmingNewAccount ? 'Create account' : 'Continue'}
            onPress={handleContinue}
            disabled={!canSubmit}
            loading={submitting}
          />
        }
      >
        <HeroField>
          <View style={styles.heroBody}>
            <DiscPair r={58} d={64} style={styles.brandMark} />
            <Tag label="Sign in or get started" style={styles.heroTag} />
            <DisplayS style={styles.wordmark}>{'In Good\nCompany'}</DisplayS>
          </View>
        </HeroField>

        <View style={styles.sheet}>
          {notice ? <InfoCard body={notice} /> : null}
          <Headline style={notice ? styles.headlineAfterNotice : null}>What's your email?</Headline>
          <Text style={s.rationale}>
            We'll use this for shift confirmations, receipts, and getting back into your account.
          </Text>

          <Input
            wrapperStyle={styles.firstField}
            label="Email"
            placeholder="you@gmail.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Input
            wrapperStyle={s.field}
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={confirmingNewAccount ? 'new-password' : 'password'}
          />

          {!isOrg ? (
            showReferral ? (
              <Input
                wrapperStyle={s.field}
                label="Referral code (optional)"
                placeholder="From a friend"
                value={referralCode}
                onChangeText={setReferralCode}
                autoCapitalize="characters"
              />
            ) : (
              <LinkButton label="Have a referral code?" align="left" onPress={() => setShowReferral(true)} style={styles.link} />
            )
          ) : null}
          {isOrg ? (
            <Pressable
              onPress={() => setIsOrg(false)}
              accessibilityRole="link"
              accessibilityLabel="Signing up to volunteer instead"
              style={[styles.link, styles.backLink]}
            >
              <Icon name="arrow-left" size={20} color={colors.ink} />
              <Text style={styles.linkText}>Signing up to volunteer instead</Text>
            </Pressable>
          ) : (
            <LinkButton label="Signing up an organization? Tap here" align="left" onPress={() => setIsOrg(true)} style={styles.link} />
          )}

          {confirmingNewAccount ? (
            <View style={styles.gap}>
              <InfoCard
                body={`There's no account for ${email.trim()} yet. Tap Create account to make a new one, or check the email if you meant to sign in.`}
              />
            </View>
          ) : null}
          {error ? <ErrorLine message={error} style={styles.gap} /> : null}
        </View>
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 24 },
  heroBody: { height: 243, overflow: 'hidden' },
  heroTag: { position: 'absolute', left: touch.pageMargin, top: 12 },
  wordmark: { position: 'absolute', left: touch.pageMargin, top: 103, lineHeight: 48 },
  brandMark: { position: 'absolute', right: -24, top: 45 },
  sheet: {
    marginTop: -28,
    paddingTop: 26,
    paddingHorizontal: touch.pageMargin,
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.hero,
    borderTopRightRadius: radii.hero,
  },
  headlineAfterNotice: { marginTop: 16 },
  firstField: { marginTop: 20 },
  link: { marginTop: 4, justifyContent: 'flex-start' },
  backLink: { minHeight: touch.link, flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { fontFamily: font.textBold, fontSize: 16, lineHeight: 22, color: colors.ink, textDecorationLine: 'underline' },
  gap: { marginTop: 16 },
});
