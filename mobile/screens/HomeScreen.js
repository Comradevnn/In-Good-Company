import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { app } from '../theme/appStyles';
import { type } from '../theme/tokens';
import { lensFor, personKeyFor } from '../theme/people';
import { api, timeUntil } from '../api/client';
import {
  Card, DiscPair, DisplayS, ErrorText, Icon, InfoCard, ListRow, Loading, PillButton, Screen, SectionTitle, StatRow, StatusCard, Tag,
} from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// Home dashboard (plotline "home"): the one place that always says what
// happens next. The status card picks the most urgent thing — a decision
// only the user can make first — so there's never a dead end.
const POLL_MS = 5000;

// Stand-ins for the status card's disc pair: the data names no partner id here, so it
// shows you and the first other-person colour.
const ME = 'me';
const PARTNER_PLACEHOLDER = 'partner';


function primaryCard(home, navigate) {
  const action = (type) => home.actions.find((a) => a.type === type);
  const now = Date.parse(home.now);

  const bail = action('bail_decision');
  if (bail) {
    return {
      eyebrow: 'Your call',
      title: `${bail.partner_name} can't make it`,
      body: `Find you someone new, or get your Deeds back? Decide within ${timeUntil(bail.deadline, now)}.`,
      onPress: () => navigate('bail', { pairingId: bail.pairing_id }),
    };
  }
  const proposal = action('proposal');
  if (proposal) {
    return {
      eyebrow: 'We found you a shift',
      title: `${proposal.when_label}, with ${proposal.partner_name}`,
      body: `Take a look and confirm — it's held for you for ${timeUntil(proposal.expires_at, now)}.`,
      onPress: () => navigate('pairing', { pairingId: proposal.pairing_id }),
    };
  }
  const today = home.bookings.find((b) => b.is_today && !b.ended && b.status === 'confirmed');
  if (today) {
    return {
      eyebrow: today.started ? 'Happening now' : 'Today',
      title: `${today.shift.when_label.split(' · ')[1] ?? ''} · ${today.shift.org_name}`,
      body: today.pairing ? `With ${today.pairing.partner_name}. Ask the staff to check you in when you arrive.` : 'Ask the staff to check you in when you arrive.',
      onPress: () => navigate(today.pairing ? 'pairing' : 'booking', { pairingId: today.pairing?.id, bookingId: today.booking_id }),
    };
  }
  const rate = action('rate');
  if (rate) {
    return {
      eyebrow: 'Shift complete',
      title: `How did ${rate.org_name} go?`,
      body: 'Rate the shift and your partner — it takes a few seconds.',
      onPress: () => navigate('rating', { bookingId: rate.booking_id }),
    };
  }
  const awaiting = action('awaiting_partner');
  if (awaiting) {
    return {
      waiting: true,
      eyebrow: "You're confirmed",
      title: `Waiting for ${awaiting.partner_name} to confirm`,
      body: `${awaiting.when_label}. If they don't confirm in time, your Deeds come straight back and we keep looking.`,
      onPress: () => navigate('pairing', { pairingId: awaiting.pairing_id }),
    };
  }
  const request = home.request;
  if (request?.status === 'searching') {
    return {
      waiting: true,
      eyebrow: request.taking_longer ? 'Still looking' : 'Matching',
      title: request.headline,
      body: request.detail,
      onPress: () => navigate('waiting'),
    };
  }
  if (request?.status === 'no_match') {
    return {
      waiting: true,
      eyebrow: 'No match this time',
      title: "Let's try something a little different",
      body: 'See a few ways to get matched faster next time.',
      onPress: () => navigate('waiting'),
    };
  }
  if (!home.profile.verified) {
    return {
      waiting: true,
      eyebrow: 'One step left',
      title: 'Verify your ID to start matching',
      body: 'Required before your first pairing. Your browsing and picks are saved.',
      onPress: () => navigate('verify'),
    };
  }
  return null;
}

export default function HomeScreen({ sessionToken, navigate, onHomeLoaded }) {
  const [home, setHome] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api(sessionToken, '/me/home');
      setHome(data);
      setError(null);
      onHomeLoaded?.(data);
    } catch (err) {
      setError(err);
    }
  }, [sessionToken, onHomeLoaded]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!home) {
    return (
      <Screen>
        {error ? <ErrorText error={error} /> : <Loading />}
        {error ? <PillButton label="Retry" onPress={load} style={{ marginTop: 16 }} /> : null}
      </Screen>
    );
  }

  const card = primaryCard(home, navigate);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(home.now));
  const hasOpenRequest = ['searching', 'proposed'].includes(home.request?.status);
  const upcoming = home.bookings.filter((b) => !(b.is_today && !b.ended));
  const premium = home.premium;

  return (
    <Screen refreshing={false} onRefresh={load}>
      <View style={styles.badgeClearance} />
      <View style={styles.greetingRow}>
        <View style={styles.flex}>
          <DisplayS>Hi, {home.profile.display_name}</DisplayS>
          <Text style={styles.weekday}>{weekday}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.bell, pressed && { backgroundColor: colors.surfacePressed }]}
          onPress={() => navigate('notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Icon name="bell" size={24} color={colors.ink} />
          {home.notifications_unread ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </View>

      {home.matching_block ? (
        <InfoCard
          tone="warn"
          title={home.matching_block.code === 'account_review' ? 'Your account is under review' : 'Matching is paused for now'}
          body={home.matching_block.code === 'account_review'
            ? 'A person on our team is reviewing your account, so matching is paused. We will be in touch.'
            : `You can look for new shifts again ${new Date(home.matching_block.until).toLocaleDateString()}.`}
        />
      ) : null}

      {card ? <StatusCard {...card} pair={{ meId: ME, partnerId: PARTNER_PLACEHOLDER, icon: 'clock' }} /> : null}

      {!hasOpenRequest && home.profile.verified && !home.matching_block && premium.cap.used >= premium.cap.cap ? (
        <InfoCard
          title="You've used this month's matched shifts"
          body={`Your plan includes ${premium.cap.cap} matched shift${premium.cap.cap === 1 ? '' : 's'} a month. You can look again next month${premium.tier === 'premium' ? '' : ', or go Premium for more'}.`}
        >
          {premium.tier !== 'premium' ? <PillButton label="See Premium" ghost onPress={() => navigate('premium')} style={{ marginTop: 12, alignSelf: 'flex-start' }} /> : null}
        </InfoCard>
      ) : null}

      {!hasOpenRequest && home.profile.verified && !home.matching_block && premium.cap.used < premium.cap.cap ? (
        <Card style={{ marginTop: 16 }}>
          <Text style={styles.ctaText}>
            {home.impact.shifts || home.bookings.length ? 'Ready for another one?' : 'Ready for your first shift?'} Tell us when you're free and we'll start looking.
          </Text>
          <PillButton label="Find your next shift" onPress={() => navigate('startMatching')} style={{ marginTop: 16 }} />
        </Card>
      ) : null}

      {upcoming.length ? (
        <>
          <SectionTitle title="Upcoming" />
          {upcoming.map((b) => (
            <Pressable
              key={b.booking_id}
              onPress={() => navigate(b.pairing ? 'pairing' : 'booking', { pairingId: b.pairing?.id, bookingId: b.booking_id })}
              accessibilityRole="button"
              accessibilityLabel={`${b.shift.title}, ${b.shift.org_name}, ${b.shift.when_label}`}
              style={styles.upcomingGap}
            >
              {({ pressed }) => (
                <Card style={pressed && { backgroundColor: colors.tintPressed }}>
                  <Text style={app.discoverTitle}>{b.shift.title}</Text>
                  <Text style={app.discoverOrg}>{b.shift.org_name}</Text>
                  <Text style={app.discoverOrg}>{b.shift.when_label}</Text>
                  <Text style={app.discoverMeta}>
                    {b.pairing
                      ? b.pairing.status === 'proposed'
                        ? b.pairing.partner_confirmed ? `${b.pairing.partner_name} confirmed — your turn` : `Proposed with ${b.pairing.partner_name}`
                        : b.pairing.status === 'cancelled'
                          ? `${b.pairing.partner_name} can't make it — tap to choose what's next`
                          : `With ${b.pairing.partner_name}`
                      : b.status === 'attended' ? 'Checked in' : 'Solo spot'}
                  </Text>
                </Card>
              )}
            </Pressable>
          ))}
        </>
      ) : null}

      {home.buddies.length ? (
        <>
          <SectionTitle title="Your buddies" link="See all" onLink={() => navigate('buddies')} />
          {home.buddies.map((b) => {
            const buddyUserId = b.user_id ?? b.buddy_id;
            return (
              <View key={b.buddy_id} style={app.buddyMini}>
                <DiscPair
                  r={24}
                  d={28}
                  colourA={colors.you}
                  colourB={colors[personKeyFor(buddyUserId, ME)]}
                  lens={lensFor('you', personKeyFor(buddyUserId, ME))}
                  youIcon
                  initial={(b.display_name ?? '?').slice(0, 1)}
                />
                <View style={styles.flex}>
                  <Text style={app.buddyName}>{b.display_name}</Text>
                  <Text style={app.buddySub}>{b.shifts_together} shift{b.shifts_together === 1 ? '' : 's'} together</Text>
                </View>
                {!hasOpenRequest ? (
                  <Pressable
                    style={({ pressed }) => [app.miniBtn, pressed && { backgroundColor: colors.surfacePressed }]}
                    onPress={() => navigate('startMatching', { buddy: b })}
                    accessibilityRole="button"
                    accessibilityLabel={`Rebook ${b.display_name}`}
                  >
                    <Text style={app.miniBtnText}>Rebook</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}

      <SectionTitle title="Your impact" link="Details" onLink={() => navigate('metrics')} />
      <StatRow stats={[[home.impact.shifts, 'Shifts'], [home.impact.hours, 'Hours'], [home.impact.orgs, 'Orgs']]} />

      <Pressable
        onPress={() => navigate('premium')}
        accessibilityRole="button"
        accessibilityLabel={`${premium.tier === 'premium' ? (premium.source === 'trial' ? 'Premium trial' : 'Premium') : 'Free plan'}. ${premium.cap.used} of ${premium.cap.cap} matched shifts used this month`}
        style={{ marginTop: 24 }}
      >
        {({ pressed }) => (
          <Card tone="field" style={pressed && { backgroundColor: colors.fieldPressed }}>
            <Tag label={premium.tier === 'premium' ? (premium.source === 'trial' ? 'Premium trial' : 'Premium') : 'Free plan'} tone="accent" style={{ alignSelf: 'flex-start' }} />
            <Text style={app.upgradeTitle}>{premium.cap.used} of {premium.cap.cap} matched shifts used this month</Text>
            <Text style={app.upgradeBody}>
              {home.deeds.available} Deeds available{home.deeds.held ? ` · ${home.deeds.held} held for upcoming shifts` : ''}.
              {premium.source === 'trial' ? ` Trial ends ${new Date(premium.trial_ends_at).toLocaleDateString()}.` : ''}
            </Text>
          </Card>
        )}
      </Pressable>

      <View style={styles.navList}>
        {[
          ['Deeds', 'deeds', 'coin'],
          ['Premium & referrals', 'premium', 'star'],
          ['Safety & reporting', 'safety', 'shield-check'],
          ['Your profile', 'profile', 'person'],
          ['Account settings', 'settings', 'settings'],
        ].map(([label, target, icon]) => (
          <ListRow key={target} label={label} icon={icon} onPress={() => navigate(target)} />
        ))}
      </View>

      <DevClockBar sessionToken={sessionToken} onAdvanced={load} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // The Deeds badge floats over the top-right corner, so the greeting starts below it.
  badgeClearance: { height: 40 },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  weekday: { ...type.bodyS, color: colors.ink2, marginTop: 4 },
  bell: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  bellDot: {
    position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.unread,
    borderWidth: 2, borderColor: colors.surface,
  },
  ctaText: { ...type.body, color: colors.ink },
  upcomingGap: { marginTop: 8 },
  navList: { marginTop: 24, gap: 8 },
});
