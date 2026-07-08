import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../theme/colors';
import { BACKEND_URL } from '../config/api';

// Matches the "quickProfile" screen in specs/plotline.html — the first real
// onboarding screen a new user hits (intro -> emailCapture -> quickProfile).
// Saves against the logged-in account (session token from signup). Fields
// not collected here (location, cause tags, availability, verified,
// reliability, etc.) are left to the defaults already set up in
// backend/db/schema.sql.
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer to self-describe'];

export default function QuickProfileScreen({ sessionToken }) {
  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState('');
  const [occupation, setOccupation] = useState('');
  const [gender, setGender] = useState(GENDER_OPTIONS[0]);
  const [hobbies, setHobbies] = useState('');
  const [blurb, setBlurb] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savedName, setSavedName] = useState(null);

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
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong saving your profile.');
      }

      setSavedName(data.display_name);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topbar}>
        <View style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </View>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDotDone]} />
          <View style={styles.progressDot} />
        </View>
        <View style={styles.spacer32} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.eyebrow}>Step 1 of 2</Text>
        <Text style={styles.h2}>Build a quick profile</Text>
        <Text style={styles.rationale}>
          This is what your future volunteer partner sees — keep it real, not polished.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>First name</Text>
          <TextInput
            style={styles.input}
            placeholder="Jordan"
            placeholderTextColor={colors.inkSoft}
            value={firstName}
            onChangeText={setFirstName}
          />
        </View>

        <View style={[styles.field, styles.row]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              placeholder="29"
              placeholderTextColor={colors.inkSoft}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>Occupation or school</Text>
            <TextInput
              style={styles.input}
              placeholder="Nurse, SJSU..."
              placeholderTextColor={colors.inkSoft}
              value={occupation}
              onChangeText={setOccupation}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={gender} onValueChange={setGender}>
              {GENDER_OPTIONS.map((option) => (
                <Picker.Item key={option} label={option} value={option} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>1–3 hobbies outside volunteering</Text>
          <TextInput
            style={styles.input}
            placeholder="hiking, ceramics, trivia nights"
            placeholderTextColor={colors.inkSoft}
            value={hobbies}
            onChangeText={setHobbies}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>What's bringing you to your volunteering journey?</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="A sentence or two is plenty."
            placeholderTextColor={colors.inkSoft}
            value={blurb}
            onChangeText={setBlurb}
            multiline
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {savedName ? (
          <Text style={styles.successText}>Profile saved — welcome, {savedName}!</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btnPrimary, !canSubmit && styles.btnPrimaryDisabled]}
          disabled={!canSubmit}
          onPress={handleContinue}
        >
          {submitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.btnPrimaryText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: colors.ink,
    fontSize: 16,
  },
  progress: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  progressDot: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  progressDotDone: {
    backgroundColor: colors.moss,
  },
  spacer32: {
    width: 32,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 22,
    paddingTop: 26,
    paddingBottom: 18,
  },
  eyebrow: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.mossDark,
    marginBottom: 8,
  },
  h2: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 24,
    lineHeight: 29,
    color: colors.ink,
    marginBottom: 6,
  },
  rationale: {
    fontFamily: 'Inter_400Regular',
    color: colors.inkSoft,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  field: {
    marginTop: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  textarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  pickerWrap: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    color: colors.danger,
    fontSize: 13,
    marginTop: 16,
  },
  successText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.mossDark,
    fontSize: 13,
    marginTop: 16,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  btnPrimary: {
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryDisabled: {
    backgroundColor: '#C8CCC1',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#F6F4EA',
    fontSize: 15,
    fontWeight: '600',
  },
});
