import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';

// Matches the "orgOrCause" screen in specs/plotline.html. Per the lead-
// capture-stub decision: there's no real org directory/search backend yet
// (org accounts are a separate deliverable — master prompt section 2), so
// "I know an org" just captures a free-text name into prospective_org_name
// (matching plotline's org-not-listed fallback) rather than a real search.
export default function OrgOrCauseScreen({ sessionToken, step, total, onKnowsOrg, onBrowseByCause, initialValues }) {
  const [showOrgInput, setShowOrgInput] = useState(Boolean(initialValues?.prospective_org_name));
  const [orgName, setOrgName] = useState(initialValues?.prospective_org_name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmitOrgName() {
    if (!orgName.trim()) {
      setError('Enter the organization\'s name.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await patchProfile(sessionToken, { prospective_org_name: orgName.trim() });
      onKnowsOrg();
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
        <Text style={s.h2}>Do you already know where you want to volunteer?</Text>
        <Text style={s.rationale}>
          Either way you'll end up in the same place — we just use this to skip straight to
          what's useful for you.
        </Text>

        {!showOrgInput ? (
          <>
            <TouchableOpacity style={s.optionCard} onPress={() => setShowOrgInput(true)}>
              <View style={s.optionIcon}>
                <Text style={s.optionIconText}>🔎</Text>
              </View>
              <View style={s.optionTextWrap}>
                <Text style={s.optionTitle}>I know an org</Text>
                <Text style={s.optionSubtitle}>Tell us the name directly</Text>
              </View>
              <Text style={s.optionArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.optionCard} onPress={onBrowseByCause}>
              <View style={s.optionIcon}>
                <Text style={s.optionIconText}>🌱</Text>
              </View>
              <View style={s.optionTextWrap}>
                <Text style={s.optionTitle}>Not sure — show me by cause</Text>
                <Text style={s.optionSubtitle}>Browse by what you care about</Text>
              </View>
              <Text style={s.optionArrow}>→</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={s.field}>
            <Text style={s.label}>Organization name</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Second Harvest of Silicon Valley"
              placeholderTextColor={colors.inkSoft}
              value={orgName}
              onChangeText={setOrgName}
            />
            <Text style={[s.rationale, { marginTop: 8 }]}>
              We don't have a searchable directory yet — we'll pass this along to our team and
              match you with something close in the meantime.
            </Text>
          </View>
        )}

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>
      {showOrgInput ? (
        <PrimaryButton
          label="Continue"
          onPress={handleSubmitOrgName}
          disabled={!orgName.trim() || submitting}
          loading={submitting}
        />
      ) : null}
    </View>
  );
}
