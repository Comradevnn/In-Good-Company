import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import { ErrorText, InfoCard, Loading, PillButton, Screen, SectionTitle, StatRow } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// Org dashboard: verification status (shifts stay hidden until verified),
// shift listings with their live capacity, aggregate turnout metrics and the
// monthly payout total. Aggregates only — no individual volunteer data here.
export default function OrgHomeScreen({ sessionToken, navigate, onLogOut }) {
  const [org, setOrg] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [o, sh, m] = await Promise.all([
        api(sessionToken, '/orgs/mine'),
        api(sessionToken, '/orgs/mine/shifts'),
        api(sessionToken, '/orgs/mine/metrics'),
      ]);
      setOrg(o);
      setShifts(sh.shifts);
      setMetrics(m);
    } catch (err) {
      setError(err);
    }
  }, [sessionToken]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  if (!org) return <Screen>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const now = Date.now();
  const upcoming = shifts.filter((sh) => Date.parse(sh.ends_at) > now - 24 * 3600000);
  const pct = (v) => (v == null ? '—' : `${v}%`);

  return (
    <Screen onRefresh={load} refreshing={false}>
      <Text style={s.eyebrow}>For organizations</Text>
      <Text style={s.h2}>{org.name}</Text>
      {org.verified ? (
        <InfoCard tone="ok" title="✓ Verified" body="Your shifts are visible to volunteers and in the matching pool." />
      ) : (
        <InfoCard tone="warn" title="Verification pending" body="You can list shifts now; volunteers will see them as soon as we've verified your organization." />
      )}

      <PillButton label="List a shift" onPress={() => navigate('orgShiftForm')} style={{ marginTop: 18 }} />

      <SectionTitle title="Your shifts" />
      {upcoming.length === 0 ? <Text style={s.rationale}>No upcoming shifts yet.</Text> : null}
      {upcoming.map((sh) => (
        <TouchableOpacity key={sh.id} style={app.discoverCard} onPress={() => navigate('orgRoster', { shiftId: sh.id })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[app.discoverTitle, { flex: 1 }]}>{sh.title}</Text>
            <Text style={app.buddySub}>{sh.capacity_booked}/{sh.capacity_total} booked</Text>
          </View>
          <Text style={app.discoverOrg}>{sh.when_label} · {sh.cause_tags.join(', ')}</Text>
          <Text style={app.discoverMeta}>Roster & check-in ›</Text>
        </TouchableOpacity>
      ))}

      {metrics ? (
        <>
          <SectionTitle title="Turnout" />
          <StatRow stats={[[pct(metrics.turnout.turnout_pct), 'Showed up'], [metrics.volunteer_hours, 'Hours'], [pct(metrics.new_to_org_pct), 'New to you']]} />
          <StatRow stats={[[pct(metrics.no_show_pct), 'No-shows'], [pct(metrics.repeat_volunteer_pct), 'Came back'], [metrics.upcoming_bookings, 'Booked ahead']]} />
          <SectionTitle title="Monthly payouts" />
          {metrics.payouts.length === 0 ? (
            <Text style={s.rationale}>Nothing yet. When a volunteer forfeits Deeds on one of your shifts, your share is paid out at the end of the month.</Text>
          ) : metrics.payouts.map((p) => (
            <View key={p.month} style={app.depositLine}><Text style={app.depositLabel}>{p.month}</Text><Text style={app.depositTotal}>${p.usd.toFixed(2)}</Text></View>
          ))}
        </>
      ) : null}
      <ErrorText error={error} />
      <Text style={{ marginTop: 26, textAlign: 'center', color: '#B4543A', fontFamily: 'Inter_600SemiBold' }} onPress={onLogOut}>Log out</Text>
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={upcoming[0] ? [['→ next shift', upcoming[0].starts_at]] : []} />
    </Screen>
  );
}
