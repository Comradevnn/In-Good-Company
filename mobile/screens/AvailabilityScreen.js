import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { Chip, ErrorLine, Headline, KeyboardScroll, Tag } from '../components/AppParts';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import DateField from '../components/DateField';
import { api } from '../api/client';
import { patchProfile } from '../auth/api';
import { formatDate, parseDate } from './dates';
import {
  CALENDAR_DAYS, FREQUENCY_OPTIONS, NO_WEEKDAY_MESSAGE, WEEKDAY_NAMES, WEEK_ORDER,
  addDays, computePrefill, hasWeekdayInRange, pickDay, startOfDay, toggleWeekday,
} from './availabilityPrefill';

// Matches specs/plotline.html's "availability" screen for the radius slider
// and frequency chips (those don't conflict with the schema). Per the
// availability-shape decision: the date range here is a literal start/end
// window matching availability_window_start/end in the matching schema,
// not plotline's recurring day-of-week/time-slot chip picker. The days of
// the week the person is free are a separate, optional filter on top.
const CALENDAR_DEBOUNCE_MS = 400;

export default function AvailabilityScreen({ sessionToken, step, total, onNext, initialValues, title, onBack }) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayText = formatDate(today);
  const prefill = useMemo(() => computePrefill(initialValues, today), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [range, setRange] = useState({ start: prefill.start, end: prefill.end, phase: 'start' });
  const { start: startDate, end: endDate } = range;
  const [weekdays, setWeekdays] = useState(prefill.weekdays);
  const [radius, setRadius] = useState(prefill.radius);
  const [frequency, setFrequency] = useState(prefill.frequency);
  const [dots, setDots] = useState({});
  const [calendarFailed, setCalendarFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Busy-ness marks for the next stretch of days, refetched (after a pause) when the radius moves.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const to = formatDate(addDays(today, CALENDAR_DAYS - 1));
      api(sessionToken, `/requests/calendar?from=${todayText}&to=${to}&radius=${radius}`)
        .then((data) => {
          if (cancelled) return;
          const map = {};
          for (const d of data?.days ?? []) map[d.date] = d.colour;
          setDots(map);
          setCalendarFailed(false);
        })
        .catch(() => {
          if (cancelled) return;
          setDots({});
          setCalendarFailed(true);
        });
    }, CALENDAR_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionToken, radius, today, todayText]);

  const datesPassed = endDate < todayText;
  const weekdayMiss = !datesPassed && endDate >= startDate && !hasWeekdayInRange(weekdays, startDate, endDate);

  function setDate(which, value) {
    setError(null);
    if (which === 'start') setRange({ start: value, end: endDate < value ? value : endDate, phase: 'start' });
    else setRange({ start: startDate, end: value, phase: 'start' });
  }

  async function handleContinue() {
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    if (datesPassed) {
      setError('Those dates have passed — pick new ones.');
      return;
    }
    if (weekdayMiss) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await patchProfile(sessionToken, {
        availability_window_start: startDate,
        availability_window_end: endDate,
        availability_weekdays: weekdays.length ? weekdays : null,
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
        footer={<PrimaryButton label="Continue" onPress={handleContinue} disabled={submitting || datesPassed || weekdayMiss} loading={submitting} error={error} />}
      >
        <Headline>When can you go?</Headline>
        <Text style={s.rationale}>
          Pick the window you're free for your {title ? 'next' : 'first'} shift — we'll do the matching from there.
        </Text>

        {prefill.savedPassed ? (
          <Text style={[s.rationale, styles.passedNote]}>Your saved dates have passed, so we've started from today.</Text>
        ) : null}

        <View style={s.field}>
          <Text style={s.label}>Tap your first day, then your last day</Text>
          <AvailabilityCalendar
            start={startDate}
            end={endDate}
            today={today}
            weekdays={weekdays}
            dots={dots}
            loadFailed={calendarFailed}
            onPickDay={(day) => {
              setError(null);
              setRange((r) => pickDay(r, day));
            }}
          />
        </View>

        <View style={[s.row, s.field]}>
          <View style={styles.dateCol}>
            <DateField label="Earliest" value={startDate} minimumDate={today} onChange={(v) => setDate('start', v)} />
          </View>
          <View style={styles.dateCol}>
            <DateField label="Latest" value={endDate} minimumDate={parseDate(startDate)} onChange={(v) => setDate('end', v)} />
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Which days are you free?</Text>
          <View style={styles.chipGrid}>
            <Chip label="Any day, soonest first" selected={weekdays.length === 0} onPress={() => setWeekdays([])} role="checkbox" />
            {WEEK_ORDER.map((day) => (
              <Chip
                key={day}
                label={WEEKDAY_NAMES[day]}
                selected={weekdays.includes(day)}
                onPress={() => {
                  setError(null);
                  setWeekdays((w) => toggleWeekday(w, day));
                }}
                role="checkbox"
              />
            ))}
          </View>
          {weekdayMiss ? <ErrorLine message={NO_WEEKDAY_MESSAGE} style={{ marginTop: 12 }} /> : null}
        </View>

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
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
