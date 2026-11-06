import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font, type } from '../theme/tokens';
import { api, timeUntil } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { Button, Card, ErrorText, Footer, Headline, Loading, PersonDisc, Screen, ShiftCard, Tag } from '../components/AppParts';

// "Your match can't make it" (plotline "partnerNotice"): an active choice,
// never a silent default — a new partner for the same shift, or the held
// Deeds back in full. The person backed out on never pays.
export default function BailDecisionScreen({ sessionToken, pairingId, navigate, onBack }) {
  const [pairing, setPairing] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => api(sessionToken, `/pairings/${pairingId}`).then(setPairing).catch(setError), [sessionToken, pairingId]);
  useEffect(() => {
    load();
  }, [load]);

  async function choose(choice) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api(sessionToken, `/pairings/${pairingId}/bail-decision`, { method: 'POST', body: { choice } }));
    } catch (err) {
      setError(err);
      // A closed decision: reload so the choice buttons give way to what happened.
      if (err.code === 'decision_expired') await load();
    } finally {
      setBusy(false);
    }
  }

  if (!pairing) return <Screen title="Change of plans" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const name = pairing.bail?.backed_out_by_name ?? 'Your match';
  const partnerId = pairing.partner ? (pairing.partner.user_id ?? pairing.partner.id ?? name) : name;

  if (result) {
    return (
      <Screen key="done" title="Change of plans" footer={<PrimaryButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} />}>
        <Headline style={{ marginBottom: 8 }}>{result.choice === 'rematch' ? "We're on it" : 'Your Deeds are back'}</Headline>
        <Text style={[type.body, { color: colors.ink2 }]}>
          {result.choice === 'rematch'
            ? "We're looking for someone new for this same shift. Your spot and hold stay as they are — we'll let you know the moment there's a match. If we can't find anyone in time, your Deeds are released in full."
            : 'Your held Deeds were released in full and your spot was freed up.'}
        </Text>
      </Screen>
    );
  }

  const open = pairing.bail?.open;
  const toHome = <PrimaryButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} />;

  // Nothing to decide: the org called the shift off, or the decision is already closed.
  if (pairing.cancelled_by_org || !pairing.bail) {
    return (
      <Screen key="closed" title="Change of plans" onBack={onBack} footer={toHome}>
        <Headline style={{ marginBottom: 8 }}>{pairing.cancelled_by_org ? 'The org had to cancel this shift' : 'Nothing to decide here'}</Headline>
        <Text style={[type.body, { color: colors.ink2 }]}>
          {pairing.cancelled_by_org ? 'Any Deeds you had on hold are back in your balance.' : 'This decision is no longer open.'}
        </Text>
        <ShiftCard shift={pairing.shift} />
      </Screen>
    );
  }
  if (!open) {
    const choice = pairing.bail.choice;
    return (
      <Screen key="decided" title="Change of plans" onBack={onBack} footer={toHome}>
        <Headline style={{ marginBottom: 8 }}>{choice === 'rematch' ? "We're finding you someone new" : 'Your Deeds are back'}</Headline>
        <Text style={[type.body, { color: colors.ink2 }]}>
          {choice === 'rematch'
            ? "This decision has already been made. We'll propose a new partner for this same shift."
            : choice
              ? 'This decision has already been made. Your held Deeds were released in full.'
              : "The time to decide has passed, so your held Deeds were released in full."}
        </Text>
        <ShiftCard shift={pairing.shift} />
      </Screen>
    );
  }
  return (
    <Screen
      title="Change of plans"
      onBack={onBack}
      footer={open ? (
        <Footer style={{ gap: 12 }} error={error}>
          <Button label="Find me someone new" onPress={() => choose('rematch')} disabled={busy} />
          <Button label="Just give them back" ghost onPress={() => choose('release')} disabled={busy} />
        </Footer>
      ) : null}
    >
      <Tag label="Your match canceled" tone="accent" style={{ marginBottom: 12 }} />
      <Headline style={{ marginBottom: 8 }}>{name} can't make it</Headline>
      <Card tone="person" style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <PersonDisc size={64} userId={partnerId} initial={name} />
          <View style={{ flex: 1 }}>
            <Text style={[type.titleL, { color: colors.ink }]}>{name}</Text>
            <Text style={[type.bodyS, { color: colors.ink2, marginTop: 2 }]}>can't make {pairing.shift.when_label} anymore</Text>
          </View>
        </View>
      </Card>
      <ShiftCard shift={pairing.shift} />
      {open ? (
        <Text style={[type.body, { fontFamily: font.textSemiBold, color: colors.ink, marginTop: 16 }]}>
          Want us to find you someone new, or would you rather get your Deeds back? You have {timeUntil(pairing.bail.deadline, Date.parse(pairing.now))} to decide — if we don't hear from you, we'll give them back.
        </Text>
      ) : (
        <Text style={[type.body, { color: colors.ink2, marginTop: 16 }]}>This decision has already been made.</Text>
      )}
    </Screen>
  );
}
