import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { ErrorLine, Headline, KeyboardScroll, Tag, Toggle } from '../components/AppParts';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';

// Matches the "prefs" screen in specs/plotline.html: same-gender-only toggle
// (-> gender_pref) and the friendship-vs-romance toggle (-> seeking). Note:
// seeking is stored but intentionally never read by the matching engine —
// see the comment on that column in backend/db/schema.sql.
export default function PartnerPrefsScreen({ sessionToken, step, total, onNext, initialValues, title, onBack }) {
  const [sameGenderOnly, setSameGenderOnly] = useState(initialValues?.gender_pref === 'same_gender_only');
  const [friendshipOnly, setFriendshipOnly] = useState(initialValues?.seeking === 'friendship_only');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleContinue() {
    setError(null);
    setSubmitting(true);
    try {
      const updated = await patchProfile(sessionToken, {
        gender_pref: sameGenderOnly ? 'same_gender_only' : 'any',
        seeking: friendshipOnly ? 'friendship_only' : 'open',
      });
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
        footer={<PrimaryButton label="Continue" onPress={handleContinue} disabled={submitting} loading={submitting} />}
      >
        {step != null ? <Tag tone="accent" label={`Step ${step} of ${total}`} style={styles.stepTag} /> : null}
        <Headline>Who we pair you with</Headline>
        <Text style={s.rationale}>This only affects matching. You can change it anytime.</Text>

        <Toggle
          label="Only match me with the same gender"
          value={sameGenderOnly}
          onValueChange={setSameGenderOnly}
          style={styles.toggleFirst}
        />
        <Toggle
          label="I'm here for friendship, not romance"
          value={friendshipOnly}
          onValueChange={setFriendshipOnly}
        />

        <Text style={[s.rationale, styles.note]}>
          This is a volunteering platform first — the pairing is about showing up to something
          good together, not a dating mechanic. Telling us this just helps us match you with
          people looking for the same thing.
        </Text>

        <ErrorLine message={error} style={styles.error} />
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  stepTag: { alignSelf: 'flex-start', marginBottom: 12 },
  toggleFirst: { marginTop: 16 },
  note: { marginTop: 16 },
  error: { marginTop: 16 },
});
