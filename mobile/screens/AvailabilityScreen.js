import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { radii, touch, type } from '../theme/tokens';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { Chip, Field, Headline, KeyboardScroll, Tag } from '../components/AppParts';
import Icon from '../components/Icon';
import { patchProfile } from '../auth/api';
import { formatDate, parseDate } from './dates';

// Matches specs/plotline.html's "availability" screen for the radius slider
// and frequency chips (those don't conflict with the schema). Per the
// availability-shape decision: the date range here is a literal start/end
// window matching availability_window_start/end in the matching schema,
// not plotline's recurring day-of-week/time-slot chip picker.
const FREQUENCY_OPTIONS = ['Once a month', 'Twice a month', 'Three times a month', 'Weekly'];

export default function AvailabilityScreen({ sessionToken, step, total, onNext, initialValues, title, onBack }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const DAY_MS = 24 * 60 * 60 * 1000;
  // With only a start date saved (a partially-completed step), default the
  // end relative to that start rather than to today, so it can't land before it.
  const savedStart = initialValues?.availability_window_start ? parseDate(initialValues.availability_window_start) : null;
  const savedEnd = initialValues?.availability_window_end ? parseDate(initialValues.availability_window_end) : null;
  // Saved dates that have already passed aren't useful defaults: start from
  // today instead, and say so.
  const savedPassed = Boolean((savedStart && savedStart < today) || (savedEnd && savedEnd < today));
  const startDefault = savedPassed ? today : savedStart ?? today;
  const endDefault = savedPassed ? new Date(today.getTime() + 5 * DAY_MS) : savedEnd ?? new Date(startDefault.getTime() + 5 * DAY_MS);

  const [startDate, setStartDate] = useState(startDefault);
  const [endDate, setEndDate] = useState(endDefault);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [radius, setRadius] = useState(initialValues?.travel_radius_miles ?? 8);
  const [frequency, setFrequency] = useState(
    FREQUENCY_OPTIONS.includes(initialValues?.volunteering_frequency)
      ? initialValues.volunteering_frequency
      : FREQUENCY_OPTIONS[1]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleContinue() {
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    if (endDate < today) {
      setError('Those dates have passed — pick new ones.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await patchProfile(sessionToken, {
        availability_window_start: formatDate(startDate),
        availability_window_end: formatDate(endDate),
        travel_radius_miles: radius,
        volunteering_frequency: frequency,
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
        footer={<PrimaryButton label="Continue" onPress={handleContinue} disabled={submitting || endDate < today} loading={submitting} error={error} />}
      >
        <Headline>When can you go?</Headline>
        <Text style={s.rationale}>
          Pick the window you're free for your {title ? 'next' : 'first'} shift — we'll do the matching from there.
        </Text>

        {savedPassed ? (
          <Text style={[s.rationale, styles.passedNote]}>Your saved dates have passed, so we've started from today.</Text>
        ) : null}

        <View style={[s.row, s.field]}>
          <Field label="Earliest" style={styles.dateCol}>
            <Pressable
              style={styles.dateBox}
              onPress={() => setShowStartPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Earliest date, ${formatDate(startDate)}`}
            >
              <Text style={styles.dateText}>{formatDate(startDate)}</Text>
              <Icon name="calendar" size={24} color={colors.ink} />
            </Pressable>
          </Field>
          <Field label="Latest" style={styles.dateCol}>
            <Pressable
              style={styles.dateBox}
              onPress={() => setShowEndPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Latest date, ${formatDate(endDate)}`}
            >
              <Text style={styles.dateText}>{formatDate(endDate)}</Text>
              <Icon name="calendar" size={24} color={colors.ink} />
            </Pressable>
          </Field>
        </View>

        {showStartPicker ? (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={today}
            onChange={(_, date) => {
              setShowStartPicker(Platform.OS === 'ios');
              if (date) setStartDate(date);
            }}
          />
        ) : null}
        {showEndPicker ? (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={startDate}
            onChange={(_, date) => {
              setShowEndPicker(Platform.OS === 'ios');
              if (date) setEndDate(date);
            }}
          />
        ) : null}

        <View style={s.field}>
          <View style={s.labelRow}>
            <Text style={[s.label, styles.travelLabel]}>How far are you willing to travel?</Text>
            <Tag tone="accent" label={`${radius} mi`} />
          </View>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={Math.max(20, radius)}
            step={1}
            value={radius}
            onValueChange={setRadius}
            minimumTrackTintColor={colors.ink}
            maximumTrackTintColor={colors.edge}
            thumbTintColor={colors.ink}
            accessibilityLabel="How far are you willing to travel?"
            accessibilityValue={{ text: `${radius} miles` }}
          />
          <View style={s.fitLabels}>
            <Text style={s.fitLabelText}>1 mi</Text>
            <Text style={s.fitLabelText}>{Math.max(20, radius)} mi</Text>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>How often would you like to go?</Text>
          <View style={styles.chipGrid}>
            {FREQUENCY_OPTIONS.map((option) => {
              const isSelected = frequency === option;
              return (
                <Chip key={option} label={option} selected={isSelected} onPress={() => setFrequency(option)} role="radio" />
              );
            })}
          </View>
        </View>
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  travelLabel: { flexShrink: 1 },
  slider: { height: 48 },
  passedNote: { marginTop: 12, color: colors.ink },
  dateCol: { flex: 1 },
  dateBox: {
    height: touch.field,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: radii.field,
    backgroundColor: colors.surface,
  },
  dateText: { ...type.fieldValue, color: colors.ink, flexShrink: 1 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
