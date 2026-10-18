import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api, timeUntil } from '../api/client';
import { Avatar, ErrorText, Loading, PillButton, Screen, SectionTitle, StatRow, StatusCard, InfoCard } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// Home dashboard (plotline "home"): the one place that always says what
// happens next. The status card picks the most urgent thing — a decision
// only the user can make first — so there's never a dead end.
const POLL_MS = 5000;

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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={s.eyebrow}>{weekday}</Text>
          <Text style={[s.h2, { marginBottom: 2 }]}>Hi, {home.profile.display_name}</Text>
        </View>
        <TouchableOpacity style={bell} onPress={() => navigate('notifications')} accessibilityLabel="Notifications">
          <Text style={{ fontSize: 15 }}>🔔</Text>
          {home.notifications_unread ? <View style={bellDot} /> : null}
        </TouchableOpacity>
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

      {card ? <StatusCard {...card} /> : null}

      {!hasOpenRequest && home.profile.verified && !home.matching_block ? (
        <View style={app.ctaInline}>
          <Text style={app.ctaInlineText}>
            {home.impact.shifts || home.bookings.length ? 'Ready for another one?' : 'Ready for your first shift?'} Tell us when you're free and we'll start looking.
          </Text>
          <PillButton label="Find your next shift" onPress={() => navigate('startMatching')} />
        </View>
      ) : null}

      {upcoming.length ? (
        <>
          <SectionTitle title="Upcoming" />
          {upcoming.map((b) => (
            <TouchableOpacity
              key={b.booking_id}
              style={app.discoverCard}
              onPress={() => navigate(b.pairing ? 'pairing' : 'booking', { pairingId: b.pairing?.id, bookingId: b.booking_id })}
            >
              <Text style={app.discoverTitle}>{b.shift.title}</Text>
              <Text style={app.discoverOrg}>{b.shift.org_name} · {b.shift.when_label}</Text>
              <Text style={app.discoverMeta}>
                {b.pairing
                  ? b.pairing.status === 'proposed'
                    ? b.pairing.partner_confirmed ? `${b.pairing.partner_name} confirmed — your turn` : `Proposed with ${b.pairing.partner_name}`
                    : `With ${b.pairing.partner_name}`
                  : b.status === 'attended' ? 'Checked in' : 'Solo spot'}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      {home.buddies.length ? (
        <>
          <SectionTitle title="Your buddies" link="See all" onLink={() => navigate('buddies')} />
          {home.buddies.map((b) => (
            <View key={b.buddy_id} style={app.buddyMini}>
              <Avatar name={b.display_name} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={app.buddyName}>{b.display_name}</Text>
                <Text style={app.buddySub}>{b.shifts_together} shift{b.shifts_together === 1 ? '' : 's'} together</Text>
              </View>
              {!hasOpenRequest ? (
                <TouchableOpacity style={app.miniBtn} onPress={() => navigate('startMatching', { buddy: b })}>
                  <Text style={app.miniBtnText}>Rebook</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      <SectionTitle title="Your impact" link="Details" onLink={() => navigate('metrics')} />
      <StatRow stats={[[home.impact.shifts, 'Shifts'], [home.impact.hours, 'Hours'], [home.impact.orgs, 'Orgs']]} />

      <TouchableOpacity style={app.upgradeCard} onPress={() => navigate('premium')}>
        <Text style={[s.eyebrow, { color: '#D98E3F', marginBottom: 0 }]}>
          {premium.tier === 'premium' ? (premium.source === 'trial' ? 'Premium trial' : 'Premium') : 'Free plan'}
        </Text>
        <Text style={app.upgradeTitle}>{premium.cap.used} of {premium.cap.cap} matched shifts used this month</Text>
        <Text style={app.upgradeBody}>
          {home.deeds.available} Deeds available{home.deeds.held ? ` · ${home.deeds.held} held for upcoming shifts` : ''}.
          {premium.source === 'trial' ? ` Trial ends ${new Date(premium.trial_ends_at).toLocaleDateString()}.` : ''}
        </Text>
      </TouchableOpacity>

      <View style={{ marginTop: 18 }}>
        {[
          ['Deeds', 'deeds'],
          ['Premium & referrals', 'premium'],
          ['Safety & reporting', 'safety'],
          ['Your profile', 'profile'],
          ['Account settings', 'settings'],
        ].map(([label, target]) => (
          <TouchableOpacity key={target} style={app.settingsRow} onPress={() => navigate(target)}>
            <Text style={app.settingsRowText}>{label}</Text>
            <Text style={app.settingsArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <DevClockBar sessionToken={sessionToken} onAdvanced={load} />
    </Screen>
  );
}

const bell = {
  width: 36, height: 36, borderRadius: 18, backgroundColor: '#FBF9F3', borderWidth: 1.5, borderColor: '#D7CEBB',
  alignItems: 'center', justifyContent: 'center',
};
const bellDot = { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#D98E3F' };
