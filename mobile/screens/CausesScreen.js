import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { Chip, ErrorLine, Headline, KeyboardScroll, Tag } from '../components/AppParts';
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

export default function CausesScreen({ sessionToken, step, total, onNext, initialValues, title, onBack }) {
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
      const updated = await patchProfile(sessionToken, { cause_tags: selected });
      onNext(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={s.container}>
      <KeyboardScroll
        header={<OnboardingTopBar step={step} total={total} title={title} onBack={onBack} />}
        footer={<PrimaryButton label="Continue" onPress={handleContinue} disabled={!canSubmit} loading={submitting} />}
      >
        {step != null ? <Tag tone="accent" label={`Step ${step} of ${total}`} style={styles.stepTag} /> : null}
        <Headline>What do you care about?</Headline>
        <Text style={s.rationale}>
          {initialValues?.prospective_org_name
            ? `Which causes are closest to ${initialValues.prospective_org_name}? Pick at least ${MIN_CAUSES} — we'll match you with something similar while we reach out to them.`
            : `Pick at least ${MIN_CAUSES} — this is what we'll use to find shifts and people you'll click with. Change these anytime.`}
        </Text>

        <View style={styles.chipGrid}>
          {CAUSE_OPTIONS.map((cause) => {
            const isSelected = selected.includes(cause);
            return (
              <Chip key={cause} label={cause} selected={isSelected} onPress={() => toggle(cause)} />
            );
          })}
        </View>

        <ErrorLine message={error} style={styles.error} />
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  stepTag: { alignSelf: 'flex-start', marginBottom: 12 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  error: { marginTop: 16 },
});
