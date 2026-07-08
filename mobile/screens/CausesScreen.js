import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';

// Matches the chip-grid part of the "causes" screen in specs/plotline.html.
// Dropped the org-listing section below the chips — there's no org
// directory backend to browse (see OrgOrCauseScreen).
const CAUSE_OPTIONS = [
  'Food banks & shelters',
  'Animal welfare',
  'Environmental cleanups',
  'Youth mentorship',
  'Elder care',
  'Community organizing',
];
const MIN_CAUSES = 2;

function parseCauseTags(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function CausesScreen({ sessionToken, step, total, onNext, initialValues }) {
  const [selected, setSelected] = useState(
    initialValues?.cause_tags ? parseCauseTags(initialValues.cause_tags) : []
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function toggle(cause) {
    setSelected((prev) =>
      prev.includes(cause) ? prev.filter((c) => c !== cause) : [...prev, cause]
    );
  }

  const canSubmit = selected.length >= MIN_CAUSES && !submitting;

  async function handleContinue() {
    setError(null);
    setSubmitting(true);
    try {
      await patchProfile(sessionToken, { cause_tags: selected });
      onNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={s.container}>
      <OnboardingTopBar step={step} total={total} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <Text style={s.eyebrow}>Step {step} of {total}</Text>
        <Text style={s.h2}>What do you care about?</Text>
        <Text style={s.rationale}>
          Pick at least {MIN_CAUSES} — this is what we'll use to find shifts and people you'll
          click with. Change these anytime.
        </Text>

        <View style={s.chipGrid}>
          {CAUSE_OPTIONS.map((cause) => {
            const isSelected = selected.includes(cause);
            return (
              <TouchableOpacity
                key={cause}
                style={[s.chip, isSelected && s.chipSelected]}
                onPress={() => toggle(cause)}
              >
                <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{cause}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>
      <PrimaryButton label="Continue" onPress={handleContinue} disabled={!canSubmit} loading={submitting} />
    </View>
  );
}
