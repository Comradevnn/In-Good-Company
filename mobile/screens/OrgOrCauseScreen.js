import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { ErrorLine, Headline, Input, KeyboardScroll, LinkButton, ListRow, Tag } from '../components/AppParts';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';

// The org-or-cause choice. Per the lead-
// capture-stub decision: there's no real org directory/search backend yet
// (org accounts are a separate deliverable — master prompt section 2), so
// "I know an org" just captures a free-text name into prospective_org_name
// (matching plotline's org-not-listed fallback) rather than a real search.
export default function OrgOrCauseScreen({ sessionToken, step, total, onKnowsOrg, onBrowseByCause, initialValues, title, onBack }) {
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
      const updated = await patchProfile(sessionToken, { prospective_org_name: orgName.trim() });
      onKnowsOrg(updated);
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
        footer={
          showOrgInput ? (
            <PrimaryButton
              label="Continue"
              onPress={handleSubmitOrgName}
              disabled={!orgName.trim() || submitting}
              loading={submitting}
            />
          ) : null
        }
      >
        {step != null ? <Tag tone="accent" label={`Step ${step} of ${total}`} style={styles.stepTag} /> : null}
        <Headline>Do you already know where you want to volunteer?</Headline>
        <Text style={s.rationale}>
          Either way you'll end up in the same place — we just use this to skip straight to
          what's useful for you.
        </Text>

        {!showOrgInput ? (
          <View style={styles.options}>
            <ListRow
              icon="search"
              label="I know an org"
              sublabel="Tell us the name directly"
              onPress={() => setShowOrgInput(true)}
            />
            <ListRow
              icon="heart"
              label="Not sure — show me by cause"
              sublabel="Browse by what you care about"
              onPress={onBrowseByCause}
            />
          </View>
        ) : (
          <View style={s.field}>
            <Input
              label="Organization name"
              placeholder="e.g. Second Harvest of Silicon Valley"
              value={orgName}
              onChangeText={setOrgName}
            />
            <Text style={[s.rationale, { marginTop: 8 }]}>
              We don't have a searchable directory yet — we'll pass this along to our team and
              match you with something close in the meantime.
            </Text>
            <LinkButton label="Choose causes instead" align="right" onPress={onBrowseByCause} style={styles.causeLink} />
          </View>
        )}

        {error ? <ErrorLine message={error} style={styles.error} /> : null}
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  stepTag: { marginBottom: 12 },
  options: { marginTop: 16 },
  causeLink: { marginTop: 8, justifyContent: 'flex-start' },
  error: { marginTop: 16 },
});
