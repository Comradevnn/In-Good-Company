import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import { ErrorText, Loading, Screen, SectionTitle, StatRow, TagPill } from '../components/AppParts';

// Your impact: aggregate numbers about your own volunteering only.
export default function MetricsScreen({ sessionToken, onBack }) {
  const [m, setM] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api(sessionToken, '/metrics/me').then(setM).catch(setError);
  }, [sessionToken]);

  if (!m) return <Screen title="Your impact" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const pct = (v) => (v == null ? '—' : `${v}%`);
  return (
    <Screen title="Your impact" onBack={onBack}>
      <Text style={s.eyebrow}>Your impact</Text>
      <Text style={s.h2}>What you've done so far</Text>
      <StatRow stats={[[m.shifts_completed, 'Shifts'], [m.hours, 'Hours'], [m.orgs, 'Orgs']]} />
      <SectionTitle title="How it's going" />
      <View style={app.depositBox}>
        {[
          ['Matched shifts you showed up for', pct(m.match_to_attendance_pct)],
          ['Shifts back at an org you\'d been to', pct(m.repeat_same_org_pct)],
          ["Partners you'd volunteer with again", pct(m.would_volunteer_again_pct)],
          ['Days from signup to first shift', m.days_to_first_shift ?? '—'],
          ['Came back for another shift', m.came_back_for_another_shift ? 'Yes' : 'Not yet'],
        ].map(([label, value]) => (
          <View key={label} style={app.depositLine}>
            <Text style={[app.depositLabel, { flex: 1 }]}>{label}</Text>
            <Text style={app.depositTotal}>{value}</Text>
          </View>
        ))}
      </View>
      {m.causes.length ? (
        <>
          <SectionTitle title="Causes you've volunteered in" />
          <View style={app.historyRow}>{m.causes.map((c) => <TagPill key={c} label={c} />)}</View>
        </>
      ) : null}
    </Screen>
  );
}
