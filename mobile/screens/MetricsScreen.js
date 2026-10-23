import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { api } from '../api/client';
import { Card, ErrorText, Headline, Loading, Screen, SectionTitle, StatRow, TagPill } from '../components/AppParts';

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
      <Headline>What you've done so far</Headline>
      <StatRow stats={[[m.shifts_completed, 'Shifts'], [m.hours, 'Hours'], [m.orgs, 'Orgs']]} />
      <SectionTitle title="How it's going" />
      <Card tone="ink">
        {[
          ['Matched shifts you showed up for', pct(m.match_to_attendance_pct)],
          ['Shifts back at an org you\'d been to', pct(m.repeat_same_org_pct)],
          ["Partners you'd volunteer with again", pct(m.would_volunteer_again_pct)],
          ['Days from signup to first shift', m.days_to_first_shift ?? '—'],
          ['Came back for another shift', m.came_back_for_another_shift ? 'Yes' : 'Not yet'],
        ].map(([label, value]) => (
          <View key={label} style={styles.line}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </Card>
      {m.causes.length ? (
        <>
          <SectionTitle title="Causes you've volunteered in" />
          <View style={styles.tags}>{m.causes.map((c) => <TagPill key={c} label={c} />)}</View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 6 },
  label: { ...type.bodyS, color: colors.onInk2, flex: 1 },
  value: { ...type.subtitle, color: colors.onInk },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
});
