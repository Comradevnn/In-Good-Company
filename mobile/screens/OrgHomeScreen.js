import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { radii, type } from '../theme/tokens';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import {
  Card, ErrorText, Headline, Icon, InfoCard, LinkButton, Loading, PillButton, Screen, SectionTitle, StatRow, Tag,
} from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';
import WaiverPicker, { waiverBody } from '../components/WaiverPicker';

// Org dashboard: verification status (shifts stay hidden until verified),
// shift listings with their live capacity, aggregate turnout metrics and the
// monthly payout total. Aggregates only — no individual volunteer data here.
export default function OrgHomeScreen({ sessionToken, navigate, onLogOut }) {
  const [org, setOrg] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [waiver, setWaiver] = useState(null);
  const [savingWaiver, setSavingWaiver] = useState(false);

  async function saveWaiver() {
    setSavingWaiver(true);
    setError(null);
    try {
      setOrg(await api(sessionToken, '/orgs/mine/waiver', { method: 'POST', body: waiverBody(waiver) }));
    } catch (err) {
      setError(err);
    } finally {
      setSavingWaiver(false);
    }
  }

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
  const hasLocation = !(org.location_lat == null || org.location_lng == null);

  return (
    <Screen
      onRefresh={load}
      refreshing={false}
      footer={hasLocation ? <PrimaryButton label="List a shift" onPress={() => navigate('orgShiftForm')} /> : undefined}
    >
      <Headline>{org.name}</Headline>
      {org.verified ? (
        <InfoCard tone="ok" title="Verified" body="Your shifts are visible to volunteers and in the matching pool." />
      ) : (
        <InfoCard tone="warn" title="Verification pending" body="You can list shifts now; volunteers will see them as soon as we've verified your organization." />
      )}

      {!org.waiver ? (
        <>
          <InfoCard tone="warn" title="Add your liability waiver" body="Volunteers need a waiver or consent form on file for your shifts. Upload a photo of yours, or use our default." />
          <View style={styles.waiver}>
            <WaiverPicker value={waiver} onChange={setWaiver} />
            <PillButton label="Save waiver" ghost onPress={saveWaiver} disabled={!waiver || savingWaiver} style={styles.saveWaiver} />
          </View>
        </>
      ) : (
        <Text style={[s.rationale, { marginTop: 16 }]}>
          Waiver on file: {org.waiver.kind === 'platform_default' ? "the platform's default form" : 'your uploaded waiver'}.
        </Text>
      )}

      {!hasLocation ? (
        <InfoCard tone="warn" title="Add your location first" body="Your organization has no map location yet, so volunteers' travel distance can't be checked. Contact us to add it before listing shifts." />
      ) : null}

      <SectionTitle title="Your shifts" />
      {upcoming.length === 0 ? <Text style={s.rationale}>No upcoming shifts yet.</Text> : null}
      {upcoming.map((sh) => (
        <Pressable
          key={sh.id}
          style={({ pressed }) => [styles.shiftCard, pressed && { backgroundColor: colors.tintPressed }]}
          onPress={() => navigate('orgRoster', { shiftId: sh.id })}
          accessibilityRole="button"
          accessibilityLabel={`${sh.title}, ${sh.when_label}, ${sh.capacity_booked} of ${sh.capacity_total} booked. Roster and check-in`}
        >
          <Tag label={`${sh.capacity_booked}/${sh.capacity_total} booked`} />
          <Text style={styles.shiftTitle}>{sh.title}</Text>
          <Text style={styles.shiftFact}>{sh.when_label}</Text>
          <Text style={styles.shiftFact}>{sh.cause_tags.join(', ')}</Text>
          <View style={styles.shiftLink}>
            <Text style={styles.shiftLinkText}>Roster & check-in</Text>
            <Icon name="chevron-right" size={24} color={colors.ink} />
          </View>
        </Pressable>
      ))}

      {metrics ? (
        <>
          <SectionTitle title="Turnout" />
          <StatRow stats={[[pct(metrics.turnout.turnout_pct), 'Showed up'], [metrics.volunteer_hours, 'Hours'], [pct(metrics.new_to_org_pct), 'New to you']]} />
          <StatRow stats={[[pct(metrics.no_show_pct), 'No-shows'], [pct(metrics.repeat_volunteer_pct), 'Came back'], [metrics.upcoming_bookings, 'Booked ahead']]} />
          <SectionTitle title="Monthly payouts" />
          {metrics.payouts.length === 0 ? (
            <Text style={s.rationale}>Nothing yet. When a volunteer forfeits Deeds on one of your shifts, your share is paid out at the end of the month.</Text>
          ) : (
            <Card tone="ink">
              {metrics.payouts.map((p, i) => (
                <View key={p.month} style={[styles.payLine, i > 0 && { marginTop: 12 }]}>
                  <Text style={styles.payMonth}>{p.month}</Text>
                  <Text style={styles.payAmount}>${p.usd.toFixed(2)}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}
      <ErrorText error={error} />
      <LinkButton label="Log out" danger onPress={onLogOut} style={styles.logout} />
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={upcoming[0] ? [['To next shift', upcoming[0].starts_at]] : []} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  waiver: { marginTop: 16 },
  saveWaiver: { marginTop: 12 },
  shiftCard: { borderRadius: radii.card, padding: 20, marginTop: 8, backgroundColor: colors.tint, alignItems: 'flex-start' },
  shiftTitle: { ...type.subtitleL, color: colors.ink, marginTop: 12 },
  shiftFact: { ...type.bodyS, color: colors.ink2, marginTop: 2 },
  shiftLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, marginTop: 4 },
  shiftLinkText: { ...type.label, color: colors.ink },
  payLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  payMonth: { ...type.body, color: colors.onInk2 },
  payAmount: { ...type.subtitle, color: colors.onInk },
  logout: { marginTop: 16 },
});
