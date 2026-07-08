import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { BACKEND_URL } from '../config/api';

// Demo screen for the minimal matching engine (backend/matching/). Runs
// Step 1a + 1b against real user rows the moment this screen opens — no
// separate "waiting" flow, since the full spec's 1-3 day async wait
// (specs/volunteer-pairing-app-master-prompt.md 3.2) isn't part of this
// build. See backend/matching/engine.js for exactly what's simplified.
const REASON_COPY = {
  verification_incomplete: "You'll need to verify your ID before we can match you.",
  ineligible_data_incomplete: 'Pick at least one cause you care about before matching.',
  insufficient_deeds: 'You need at least Deeds to book a shift — visit Deeds (demo) to top up.',
  no_compatible_partner_found: "No compatible partner yet — try again once there's another test user with overlapping causes.",
};

const BACKOUT_COOLDOWN_SECONDS = 15;

export default function MatchScreen({ sessionToken, onBack, onDeedsChange }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  function runMatch() {
    setLoading(true);
    setError(null);
    fetch(`${BACKEND_URL}/matching/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Matching failed.');
        setResult(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(runMatch, [sessionToken]);
  useEffect(() => () => clearInterval(cooldownRef.current), []);

  function startCooldown() {
    setCooldown(BACKOUT_COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      setCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  // DEMO SCOPED: cancels the pairing, forfeits Deeds, and resets this
  // screen so matching can be re-run after a cooldown. No notification to
  // the other person, no reliability-tracking consequences (the real
  // backout rules in master prompt 3.4/5.3) — just cancel-and-return-to-
  // unmatched-with-a-cost, working end to end.
  async function performBackOut() {
    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/matching/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not back out.');
      setResult({ status: 'no_match', reason: 'cancelled' });
      onDeedsChange?.(data.deeds_balance);
      startCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  function handleBackOutPress() {
    Alert.alert(
      'Back out of this pairing?',
      'This forfeits Deeds (demo). This cannot be undone.',
      [
        { text: 'Never mind', style: 'cancel' },
        { text: 'Back out', style: 'destructive', onPress: performBackOut },
      ]
    );
  }

  return (
    <View style={s.container}>
      <OnboardingTopBar title="Find a match (demo)" onBack={onBack} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {loading ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator />
            <Text style={[s.rationale, { marginTop: 12 }]}>Running the matching engine…</Text>
          </View>
        ) : error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : result?.status === 'confirmed' ? (
          <>
            <Text style={s.eyebrow}>You're paired</Text>
            <Text style={s.h2}>You've been matched with {result.partner.display_name}!</Text>
            <View style={matchCard}>
              <Text style={matchCardTitle}>{result.partner.display_name}, {result.partner.age}</Text>
              {result.partner.occupation ? (
                <Text style={matchCardMeta}>{result.partner.occupation}</Text>
              ) : null}
              <Text style={[s.rationale, { marginTop: 10 }]}>
                Shared shift: {result.shift?.cause_tags?.join(', ')} at {result.shift?.org_name}
              </Text>
              {result.shift?.date ? (
                <Text style={[s.rationale, { marginTop: 4 }]}>
                  When: {result.shift.date}, {result.shift.time}
                </Text>
              ) : null}
              {result.shift?.location_label ? (
                <Text style={[s.rationale, { marginTop: 4 }]}>Where: {result.shift.location_label}</Text>
              ) : null}
              <Text style={[s.rationale, { marginTop: 4 }]}>
                Alignment score: {result.score?.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity style={backOutLink} onPress={handleBackOutPress} disabled={cancelling}>
              <Text style={backOutLinkText}>
                {cancelling ? 'Backing out…' : 'Back out of this pairing (demo)'}
              </Text>
            </TouchableOpacity>
          </>
        ) : result?.reason === 'cancelled' ? (
          <>
            <Text style={s.eyebrow}>Demo matching</Text>
            <Text style={s.h2}>Pairing cancelled</Text>
            <Text style={s.rationale}>
              Deeds forfeited. You're back to unmatched — run matching again once the cooldown ends.
            </Text>
          </>
        ) : (
          <>
            <Text style={s.eyebrow}>Demo matching</Text>
            <Text style={s.h2}>No match yet</Text>
            <Text style={s.rationale}>
              {REASON_COPY[result?.reason] ?? `Reason: ${result?.reason ?? 'unknown'}`}
            </Text>
          </>
        )}
      </ScrollView>
      {!loading && result?.status !== 'confirmed' ? (
        <PrimaryButton
          label={cooldown > 0 ? `Find a match (${cooldown}s)` : 'Find a match'}
          onPress={runMatch}
          disabled={cooldown > 0}
        />
      ) : (
        <PrimaryButton label="Back" onPress={onBack} />
      )}
    </View>
  );
}

const matchCard = {
  marginTop: 16,
  borderWidth: 1.5,
  borderColor: colors.line,
  borderRadius: 18,
  padding: 18,
  backgroundColor: colors.surface,
};
const matchCardTitle = {
  fontFamily: 'Fraunces_600SemiBold',
  fontSize: 18,
  color: colors.ink,
};
const matchCardMeta = {
  fontFamily: 'Inter_400Regular',
  fontSize: 13,
  color: colors.inkSoft,
  marginTop: 2,
};
const backOutLink = {
  marginTop: 16,
  alignItems: 'center',
};
const backOutLinkText = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 13.5,
  color: colors.danger,
};
