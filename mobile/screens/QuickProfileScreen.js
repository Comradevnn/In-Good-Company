import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../theme/colors';
import { font, radii, touch, type } from '../theme/tokens';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { BACKEND_URL } from '../config/api';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { Field, Headline, InfoCard, Input, KeyboardScroll } from '../components/AppParts';
import PrimaryButton from '../components/PrimaryButton';

// The first real onboarding screen a new user hits (intro -> emailCapture -> quickProfile).
// Includes personal_values, which 3.1's "basic profile" step asks for but no
// plotline screen actually has a field for. Saves against the logged-in
// account (session token from signup). Fields not collected here (location,
// cause tags, availability, verified, reliability, etc.) are left to the
// defaults already set up in backend/db/schema.sql, or collected by the
// screens later in onboarding.
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer to self-describe'];

function parseInterestTags(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.join(', ') : '';
  } catch {
    return '';
  }
}

export default function QuickProfileScreen({ sessionToken, step, total, onNext, initialValues, title, onBack }) {
  const isVerified = Boolean(initialValues?.verified);
  const [firstName, setFirstName] = useState(initialValues?.display_name ?? '');
  const [age, setAge] = useState(initialValues?.age != null ? String(initialValues.age) : '');
  const [occupation, setOccupation] = useState(initialValues?.occupation ?? '');
  const [gender, setGender] = useState(
    GENDER_OPTIONS.includes(initialValues?.gender) ? initialValues.gender : GENDER_OPTIONS[0]
  );
  const [hobbies, setHobbies] = useState(
    initialValues?.interest_tags ? parseInterestTags(initialValues.interest_tags) : ''
  );
  const [personalValues, setPersonalValues] = useState(initialValues?.personal_values ?? '');
  const [blurb, setBlurb] = useState(initialValues?.bio ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = firstName.trim().length > 0 && age.trim().length > 0 && !submitting;

  async function handleContinue() {
    setError(null);

    const ageNumber = Number(age);
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!Number.isInteger(ageNumber) || ageNumber <= 0) {
      setError('Enter a valid age.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          first_name: firstName,
          age,
          occupation,
          gender,
          hobbies,
          blurb,
          personal_values: personalValues,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong saving your profile.');
      }

      onNext(data);
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
        footer={<PrimaryButton label="Continue" onPress={handleContinue} disabled={!canSubmit} loading={submitting} error={error} />}
      >
        <Headline>Build a quick profile</Headline>
        <Text style={s.rationale}>
          This is what your future volunteer partner sees — keep it real, not polished.
        </Text>

        {isVerified ? (
          <View style={styles.notice}>
            <InfoCard body="Changing your name or age will remove your Verified badge until you verify again." />
          </View>
        ) : null}

        <Input
          wrapperStyle={s.field}
          label="First name"
          placeholder="Jordan"
          value={firstName}
          onChangeText={setFirstName}
        />

        <View style={[s.field, s.row]}>
          <Input
            wrapperStyle={styles.ageCol}
            label="Age"
            placeholder="29"
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
          />
          <Input
            wrapperStyle={styles.occupationCol}
            label="Occupation or school"
            placeholder="Nurse, SJSU..."
            value={occupation}
            onChangeText={setOccupation}
          />
        </View>

        <Field label="Gender" style={s.field}>
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={gender}
              onValueChange={setGender}
              accessibilityLabel="Gender"
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor={colors.ink}
            >
              {GENDER_OPTIONS.map((option) => (
                <Picker.Item key={option} label={option} value={option} />
              ))}
            </Picker>
          </View>
        </Field>

        <Input
          wrapperStyle={s.field}
          label="1–3 hobbies outside volunteering"
          placeholder="hiking, ceramics, trivia nights"
          value={hobbies}
          onChangeText={setHobbies}
        />

        <Input
          wrapperStyle={s.field}
          label="One or two values that matter to you"
          placeholder="e.g. leaving things better than I found them"
          value={personalValues}
          onChangeText={setPersonalValues}
        />

        <Input
          wrapperStyle={s.field}
          label="What's bringing you to your volunteering journey?"
          placeholder="A sentence or two is plenty."
          value={blurb}
          onChangeText={setBlurb}
          multiline
        />
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginTop: 16 },
  ageCol: { flex: 1 },
  occupationCol: { flex: 2 },
  pickerBox: {
    minHeight: touch.field,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: radii.field,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  picker: { color: colors.ink, fontFamily: font.textSemiBold, fontSize: type.fieldValue.fontSize },
  pickerItem: { color: colors.ink, fontFamily: font.textSemiBold, fontSize: type.fieldValue.fontSize },
});
