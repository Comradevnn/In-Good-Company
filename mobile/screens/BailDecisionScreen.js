import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api, timeUntil } from '../api/client';
import { Avatar, ErrorText, Loading, PillButton, Screen, ShiftCard } from '../components/AppParts';

// "Your match can't make it" (plotline "partnerNotice"): an active choice,
// never a silent default — a new partner for the same shift, or the held
// Deeds back in full. The person backed out on never pays.
export default function BailDecisionScreen({ sessionToken, pairingId, navigate, onBack }) {
  const [pairing, setPairing] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(sessionToken, `/pairings/${pairingId}`).then(setPairing).catch(setError);
  }, [sessionToken, pairingId]);

  async function choose(choice) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api(sessionToken, `/pairings/${pairingId}/bail-decision`, { method: 'POST', body: { choice } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!pairing) return <Screen title="Change of plans" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const name = pairing.bail?.backed_out_by_name ?? 'Your match';

  if (result) {
    return (
      <Screen key="done" title="Change of plans">
        <Text style={s.h2}>{result.choice === 'rematch' ? "We're on it" : 'Your Deeds are back'}</Text>
        <Text style={s.rationale}>
          {result.choice === 'rematch'
            ? "We're looking for someone new for this same shift. Your spot and hold stay as they are — we'll let you know the moment there's a match. If we can't find anyone in time, your Deeds are released in full."
            : 'Your held Deeds were released in full and your spot was freed up.'}
        </Text>
        <PillButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} style={{ marginTop: 18 }} />
      </Screen>
    );
  }

  return (
    <Screen title="Change of plans" onBack={onBack}>
      <Text style={s.eyebrow}>Your match canceled</Text>
      <Text style={s.h2}>{name} can't make it</Text>
      <View style={app.partnerCard}>
        <View style={app.partnerTop}>
          <Avatar name={name} />
          <View style={{ flex: 1 }}>
            <Text style={app.h3}>{name}</Text>
            <Text style={app.partnerMeta}>can't make {pairing.shift.when_label} anymore</Text>
          </View>
        </View>
      </View>
      <ShiftCard shift={pairing.shift} />
      {pairing.bail?.open ? (
        <>
          <Text style={[s.rationale, { marginTop: 16, fontFamily: 'Inter_600SemiBold' }]}>
            Want us to find you someone new, or would you rather get your Deeds back? You have {timeUntil(pairing.bail.deadline, Date.parse(pairing.now))} to decide — if we don't hear from you, we'll give them back.
          </Text>
          <View style={app.yesNoRow}>
            <PillButton label="Find me someone new" onPress={() => choose('rematch')} disabled={busy} style={{ flex: 1 }} />
            <PillButton label="Just give them back" ghost onPress={() => choose('release')} disabled={busy} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <Text style={[s.rationale, { marginTop: 16 }]}>This decision has already been made.</Text>
      )}
      <ErrorText error={error} />
    </Screen>
  );
}
