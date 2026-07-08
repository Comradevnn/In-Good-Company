import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';

// Matches the "prefs" screen in specs/plotline.html: same-gender-only toggle
// (-> gender_pref) and the friendship-vs-romance toggle (-> seeking). Note:
// seeking is stored but intentionally never read by the matching engine —
// see the comment on that column in backend/db/schema.sql.
function Toggle({ label, value, onToggle }) {
  return (
    <TouchableOpacity style={s.toggleRow} onPress={onToggle} activeOpacity={0.7}>
      <Text style={s.toggleLabel}>{label}</Text>
      <View style={[s.switchTrack, value && s.switchTrackOn]}>
        <View style={[s.switchThumb, value && s.switchThumbOn]} />
      </View>
    </TouchableOpacity>
  );
}

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
      <OnboardingTopBar step={step} total={total} title={title} onBack={onBack} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {step != null ? <Text style={s.eyebrow}>Step {step} of {total}</Text> : null}
        <Text style={s.h2}>Who we pair you with</Text>
        <Text style={s.rationale}>This only affects matching. You can change it anytime.</Text>

        <Toggle
          label="Only match me with the same gender"
          value={sameGenderOnly}
          onToggle={() => setSameGenderOnly((v) => !v)}
        />
        <Toggle
          label="I'm here for friendship, not romance"
          value={friendshipOnly}
          onToggle={() => setFriendshipOnly((v) => !v)}
        />

        <Text style={[s.rationale, { marginTop: 14 }]}>
          This is a volunteering platform first — the pairing is about showing up to something
          good together, not a dating mechanic. Telling us this just helps us match you with
          people looking for the same thing.
        </Text>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>
      <PrimaryButton label="Continue" onPress={handleContinue} disabled={submitting} loading={submitting} />
    </View>
  );
}
