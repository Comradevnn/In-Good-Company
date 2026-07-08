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

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export default function AvailabilityScreen({ sessionToken, step, total, onNext, initialValues, title, onBack }) {
  const today = new Date();
  const inFiveDays = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState(
    initialValues?.availability_window_start ? new Date(initialValues.availability_window_start) : today
  );
  const [endDate, setEndDate] = useState(
    initialValues?.availability_window_end ? new Date(initialValues.availability_window_end) : inFiveDays
  );
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
          Pick the window you're free for your first shift — we'll do the matching from there.
        </Text>

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
            maximumValue={20}
            step={1}
            value={radius}
            onValueChange={setRadius}
            minimumTrackTintColor={colors.moss}
            maximumTrackTintColor={colors.line}
            thumbTintColor={colors.moss}
          />
          <View style={s.fitLabels}>
            <Text style={s.fitLabelText}>1 mi</Text>
            <Text style={s.fitLabelText}>20 mi</Text>
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
      <PrimaryButton label="Continue" onPress={handleContinue} disabled={submitting} loading={submitting} />
    </View>
  );
}
