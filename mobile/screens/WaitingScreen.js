import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import { ErrorText, Loading, PillButton, Screen, SectionTitle } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// The waiting period (plotline "waiting"): a visible, honest status that
// says what we're looking for and what's missing, plus alternatives so the
// user is never left with nothing to do. Polls the backend; when a proposal
// lands it hands straight over to the pairing screen.
const POLL_MS = 5000;

// plotline's converging-paths motif, drawn with plain Views (no SVG
// dependency): two people, dotted lines, a pulsing meeting point.
function Converge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.18, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const dots = (color, fromLeft) => Array.from({ length: 6 }, (_, i) => (
    <View key={i} style={{
      position: 'absolute', width: 6, height: 2.5, borderRadius: 2, backgroundColor: color,
      left: fromLeft ? 26 + i * 17 : 228 - i * 17, top: 22 + i * 15,
      transform: [{ rotate: fromLeft ? '40deg' : '-40deg' }],
    }} />
  ));
  return (
    <View style={{ width: 260, height: 140 }}>
      <View style={{ position: 'absolute', left: 15, top: 15, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4F6F52' }} />
      <View style={{ position: 'absolute', right: 15, top: 15, width: 10, height: 10, borderRadius: 5, backgroundColor: '#D98E3F' }} />
      {dots('#4F6F52', true)}
      {dots('#D98E3F', false)}
      <Animated.View style={{ position: 'absolute', left: 117, top: 102, width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(32,41,31,0.4)', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pulse }] }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#20291F' }} />
      </Animated.View>
    </View>
  );
}

export default function WaitingScreen({ sessionToken, navigate, onBack, onProfileChanged }) {
  const [request, setRequest] = useState(undefined);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api(sessionToken, '/requests/current');
      setRequest(data.request);
      if (data.request?.proposal_pairing_id) {
        navigate('pairing', { pairingId: data.request.proposal_pairing_id }, { replace: true });
      }
    } catch (err) {
      setError(err);
    }
  }, [sessionToken, navigate]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const adjust = (body) => run(async () => {
    await api(sessionToken, '/requests/current/adjust', { method: 'POST', body });
    onProfileChanged?.();
  });
  const rsvp = (shiftId) => run(async () => {
    const booking = await api(sessionToken, `/shifts/${shiftId}/rsvp-solo`, { method: 'POST' });
    navigate('booking', { bookingId: booking.booking_id }, { replace: true });
  });

  if (request === undefined) return <Screen title="Matching" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  if (!request) {
    return (
      <Screen title="Matching" onBack={onBack}>
        <Text style={s.h2}>You're not looking right now</Text>
        <Text style={s.rationale}>Tell us when you're free and we'll start looking for a partner and a shift.</Text>
        <PillButton label="Find a shift" onPress={() => navigate('startMatching', {}, { replace: true })} style={{ marginTop: 18 }} />
      </Screen>
    );
  }

  const noMatch = request.status === 'no_match';
  const waitedDays = Math.floor(request.waited_hours / 24);
  const waited = waitedDays >= 1 ? `${waitedDays} day${waitedDays === 1 ? '' : 's'}` : `${request.waited_hours} hour${request.waited_hours === 1 ? '' : 's'}`;

  return (
    <Screen title={noMatch ? 'No match yet' : 'Matching'} onBack={onBack}>
      <View style={app.waitWrap}>
        {!noMatch ? <Converge /> : null}
        <Text style={app.waitStatus}>{request.headline}</Text>
        <Text style={app.waitSub}>{request.detail}</Text>
        {!noMatch ? (
          <Text style={[app.finetext, { textAlign: 'center' }]}>
            Searching for {waited} · {request.window_start} → {request.window_end} · {request.travel_radius_miles} mi
            {request.buddy_name ? ` · with ${request.buddy_name}` : ''}
          </Text>
        ) : null}
        {request.taking_longer && !noMatch ? (
          <Text style={[app.finetext, { textAlign: 'center' }]}>This is taking longer than usual. Any of the options below can speed it up.</Text>
        ) : null}
        {!noMatch ? (
          <Text style={[app.finetext, { textAlign: 'center' }]}>
            We'll stop by {new Date(request.search_deadline).toLocaleDateString()} rather than leave you hanging, and suggest what to try next.
          </Text>
        ) : null}
      </View>

      <ErrorText error={error} />

      {request.alternatives.length ? <SectionTitle title={noMatch ? 'Ways to get matched' : 'While you wait'} /> : null}
      {request.alternatives.map((alt) => (
        <View key={alt.type} style={app.discoverCard}>
          <Text style={app.discoverTitle}>{alt.title}</Text>
          <Text style={app.discoverMeta}>{alt.body}</Text>
          {alt.type === 'solo_rsvp'
            ? alt.shifts.map((shift) => (
              <View key={shift.id} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={app.buddyName}>{shift.title}</Text>
                  <Text style={app.buddySub}>{shift.org_name} · {shift.when_label}</Text>
                </View>
                <PillButton label="RSVP solo" ghost disabled={busy} onPress={() => rsvp(shift.id)} />
              </View>
            ))
            : (
              <PillButton
                label={{ widen_radius: 'Widen my distance', nearby_date: 'Use these dates', add_cause: 'Add this cause' }[alt.type]}
                ghost
                disabled={busy}
                style={{ marginTop: 10, alignSelf: 'flex-start' }}
                onPress={() => adjust(
                  alt.type === 'widen_radius' ? { travel_radius_miles: alt.travel_radius_miles }
                    : alt.type === 'nearby_date' ? { window_start: alt.window_start, window_end: alt.window_end }
                      : { add_cause: alt.cause },
                )}
              />
            )}
        </View>
      ))}
      {request.reason === 'waiting_for_buddy' ? (
        <PillButton label="Open up to a new partner" ghost style={{ marginTop: 14 }} disabled={busy} onPress={() => adjust({ drop_buddy: true })} />
      ) : null}
      {request.reason === 'monthly_cap_reached' ? (
        <PillButton label="See Premium" style={{ marginTop: 14 }} onPress={() => navigate('premium')} />
      ) : null}
      {request.reason === 'verification_incomplete' ? (
        <PillButton label="Verify your ID" style={{ marginTop: 14 }} onPress={() => navigate('verify')} />
      ) : null}

      <View style={{ marginTop: 26, gap: 14 }}>
        {noMatch ? (
          <>
            <PillButton label="Search new dates" onPress={() => run(async () => {
              await api(sessionToken, '/requests/current/dismiss', { method: 'POST' });
              navigate('startMatching', {}, { replace: true });
            })} />
            <Text style={app.quietLink} onPress={() => run(async () => {
              await api(sessionToken, '/requests/current/dismiss', { method: 'POST' });
              onBack();
            })}>Not now</Text>
          </>
        ) : (
          <Text style={app.dangerLink} onPress={() => run(async () => {
            await api(sessionToken, '/requests/current/cancel', { method: 'POST' });
            onBack();
          })}>
            {request.kind === 'rematch' ? 'Stop looking and give me my Deeds back' : request.kind === 'solo_rsvp' ? "Stop looking — I'll go solo" : 'Stop looking'}
          </Text>
        )}
      </View>

      <DevClockBar sessionToken={sessionToken} onAdvanced={load} />
    </Screen>
  );
}
