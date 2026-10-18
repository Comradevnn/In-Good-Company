import { useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';

// Matches specs/plotline.html's "availability" screen for the radius slider
// and frequency chips (those don't conflict with the schema). Per the
// availability-shape decision: the date range here is a literal start/end
// window matching availability_window_start/end in the matching schema,
// not plotline's recurring day-of-week/time-slot chip picker.
const FREQUENCY_OPTIONS = ['Once a month', 'Twice a month', 'Three times a month', 'Weekly'];

// Dates are calendar days in the user's own timezone. toISOString() (UTC)
// shifted them by a day east of UTC on save, and new Date('YYYY-MM-DD')
// (also UTC) made the picker highlight the previous day west of UTC — so a
// returning user didn't see the dates they had entered.
function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

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
      <OnboardingTopBar step={step} total={total} title={title} onBack={onBack} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {step != null ? <Text style={s.eyebrow}>Step {step} of {total}</Text> : null}
        <Text style={s.h2}>When can you go?</Text>
        <Text style={s.rationale}>
          Pick the window you're free for your {title ? 'next' : 'first'} shift — we'll do the matching from there.
        </Text>

        {savedPassed ? (
          <Text style={[s.rationale, { marginTop: 10, color: colors.mossDark }]}>Your saved dates have passed, so we've started from today.</Text>
        ) : null}

        <View style={s.row}>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.label}>Earliest</Text>
            <TouchableOpacity style={s.input} onPress={() => setShowStartPicker(true)}>
              <Text style={{ fontFamily: 'Inter_400Regular', color: colors.ink }}>
                {formatDate(startDate)}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.label}>Latest</Text>
            <TouchableOpacity style={s.input} onPress={() => setShowEndPicker(true)}>
              <Text style={{ fontFamily: 'Inter_400Regular', color: colors.ink }}>
                {formatDate(endDate)}
              </Text>
            </TouchableOpacity>
          </View>
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
            <Text style={s.label}>How far are you willing to travel?</Text>
            <Text style={s.valuePill}>{radius} mi</Text>
          </View>
          <Slider
            minimumValue={1}
            maximumValue={Math.max(20, radius)}
            step={1}
            value={radius}
            onValueChange={setRadius}
            minimumTrackTintColor={colors.moss}
            maximumTrackTintColor={colors.line}
            thumbTintColor={colors.moss}
          />
          <View style={s.fitLabels}>
            <Text style={s.fitLabelText}>1 mi</Text>
            <Text style={s.fitLabelText}>{Math.max(20, radius)} mi</Text>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>How often would you like to go?</Text>
          <View style={s.chipGrid}>
            {FREQUENCY_OPTIONS.map((option) => {
              const isSelected = frequency === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[s.chip, isSelected && s.chipSelected]}
                  onPress={() => setFrequency(option)}
                >
                  <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>
      <PrimaryButton label="Continue" onPress={handleContinue} disabled={submitting || endDate < today} loading={submitting} />
    </View>
  );
}
