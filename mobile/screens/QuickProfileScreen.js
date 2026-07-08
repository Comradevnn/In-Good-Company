import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { BACKEND_URL } from '../config/api';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';

// Matches the "quickProfile" screen in specs/plotline.html — the first real
// onboarding screen a new user hits (intro -> emailCapture -> quickProfile).
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
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OnboardingTopBar step={step} total={total} title={title} onBack={onBack} />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {step != null ? <Text style={s.eyebrow}>Step {step} of {total}</Text> : null}
        <Text style={s.h2}>Build a quick profile</Text>
        <Text style={s.rationale}>
          This is what your future volunteer partner sees — keep it real, not polished.
        </Text>

        {isVerified ? (
          <View style={verifiedNotice}>
            <Text style={verifiedNoticeText}>
              Changing your name or age will remove your Verified badge until you verify again.
            </Text>
          </View>
        ) : null}

        <View style={s.field}>
          <Text style={s.label}>First name</Text>
          <TextInput
            style={s.input}
            placeholder="Jordan"
            placeholderTextColor={colors.inkSoft}
            value={firstName}
            onChangeText={setFirstName}
          />
        </View>

        <View style={[s.field, s.row]}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Age</Text>
            <TextInput
              style={s.input}
              placeholder="29"
              placeholderTextColor={colors.inkSoft}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={s.label}>Occupation or school</Text>
            <TextInput
              style={s.input}
              placeholder="Nurse, SJSU..."
              placeholderTextColor={colors.inkSoft}
              value={occupation}
              onChangeText={setOccupation}
            />
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Gender</Text>
          <View style={{ borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' }}>
            <Picker selectedValue={gender} onValueChange={setGender}>
              {GENDER_OPTIONS.map((option) => (
                <Picker.Item key={option} label={option} value={option} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>1–3 hobbies outside volunteering</Text>
          <TextInput
            style={s.input}
            placeholder="hiking, ceramics, trivia nights"
            placeholderTextColor={colors.inkSoft}
            value={hobbies}
            onChangeText={setHobbies}
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>One or two values that matter to you</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. leaving things better than I found them"
            placeholderTextColor={colors.inkSoft}
            value={personalValues}
            onChangeText={setPersonalValues}
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>What's bringing you to your volunteering journey?</Text>
          <TextInput
            style={[s.input, s.textarea]}
            placeholder="A sentence or two is plenty."
            placeholderTextColor={colors.inkSoft}
            value={blurb}
            onChangeText={setBlurb}
            multiline
          />
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>

      <PrimaryButton label="Continue" onPress={handleContinue} disabled={!canSubmit} loading={submitting} />
    </KeyboardAvoidingView>
  );
}

const verifiedNotice = {
  marginTop: 18,
  borderWidth: 1.5,
  borderColor: colors.ochre,
  borderRadius: 14,
  padding: 13,
  backgroundColor: colors.ochreTint,
};
const verifiedNoticeText = {
  fontFamily: 'Inter_500Medium',
  fontSize: 12.5,
  lineHeight: 18,
  color: '#8A5A18',
};
