import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { Button, ErrorText, factLines, Footer, Headline, InfoCard, LinkButton, Loading, Screen, ShiftCard, Tag } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// A booking without a partner: a solo RSVP, or a spot kept after a pairing
// ended. No Deeds are held; cancelling just frees the spot.
export default function BookingScreen({ sessionToken, bookingId, navigate, onBack }) {
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api(sessionToken, `/bookings/${bookingId}`).then((b) => {
      if (b.pairing && b.pairing.status !== 'cancelled') navigate('pairing', { pairingId: b.pairing.id }, { replace: true });
      else setBooking(b);
    }).catch(setError);
  }, [sessionToken, bookingId, navigate]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (!booking) return <Screen title="Your spot" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const attended = booking.status === 'attended';
  const toHome = () => navigate('home', {}, { reset: true });
  const canRate = attended && booking.ended;
  return (
    <Screen
      title="Your spot"
      onBack={onBack}
      footer={canRate ? (
        <Footer style={{ gap: 12 }}>
          <Button label="Rate the shift" onPress={() => navigate('rating', { bookingId })} />
          <Button label="Back to home" ghost onPress={toHome} />
        </Footer>
      ) : <PrimaryButton label="Back to home" onPress={toHome} />}
    >
      <Tag label={booking.kind === 'solo' ? 'Solo spot' : 'Your shift'} tone="accent" style={{ marginBottom: 12 }} />
      <Headline>{factLines(booking.shift.when_label)}</Headline>
      {booking.status === 'confirmed' && !booking.started ? (
        <Text style={[type.body, { color: colors.ink2, marginTop: 8 }]}>You're booked. We'll still try to pair you with someone before it starts — if we do, you'll get a proposal to confirm.</Text>
      ) : null}
      <ShiftCard shift={booking.shift} />
      {booking.started && booking.status === 'confirmed' ? (
        <InfoCard title="It's shift time" body="Find the staff when you arrive and they will check you in." />
      ) : null}
      {attended ? <InfoCard tone="ok" title="You're checked in" body="Thanks for showing up." /> : null}
      {booking.status === 'confirmed' && !booking.started ? (
        <LinkButton label="Can't make it? Cancel your spot" danger style={{ marginTop: 16 }} onPress={() => navigate('cancel', { bookingId })} />
      ) : null}
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={[['Jump to shift start', booking.shift.starts_at], ['Jump to shift end', booking.shift.ends_at]]} />
    </Screen>
  );
}
