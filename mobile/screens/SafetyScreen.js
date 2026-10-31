import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { Bullet, Card, Chip, ErrorText, Headline, Heading, Input, Loading, Screen, SectionHeader, Toggle } from '../components/AppParts';

// Safety: the pre-shift safety notice and the in-app report flow. Reports
// are stored for a person to review and permanently stop the two people
// being paired again. Reporting a current partner can also take you out of
// that pairing at no cost.
const CATEGORY_LABELS = {
  made_me_uncomfortable: 'Made me uncomfortable',
  inappropriate_messages: 'Inappropriate messages',
  no_show_or_unreliable: 'No-show or unreliable',
  safety_concern: 'Safety concern',
  other: 'Something else',
};

export default function SafetyScreen({ sessionToken, pairingId, partnerName, navigate, onBack }) {
  const [notice, setNotice] = useState(null);
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [cancelPairing, setCancelPairing] = useState(false);
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(sessionToken, '/safety/notice').then(setNotice).catch(setError);
  }, [sessionToken]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setSent(await api(sessionToken, '/safety/reports', {
        method: 'POST',
        body: { category, description, pairing_id: pairingId, cancel_pairing: cancelPairing },
      }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen key="done" title="Safety" footer={<PrimaryButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} />}>
        <Headline>Thank you for telling us</Headline>
        <Text style={s.rationale}>
          A real person will review your report.{partnerName ? ` You won't be paired with ${partnerName} again.` : ''}
          {sent.cancelled ? ' You have been taken out of the pairing, with no cost to you.' : ''}
        </Text>
      </Screen>
    );
  }
  if (!notice) return <Screen title="Safety" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;

  return (
    <Screen
      title="Safety"
      onBack={onBack}
      footer={category ? <PrimaryButton label="Send report" onPress={submit} disabled={busy} loading={busy} error={error} /> : null}
    >
      <Headline>{partnerName ? `Report a concern about ${partnerName}` : 'Staying safe'}</Headline>
      <Card tone="field" style={styles.notice}>
        <Heading level="titleS">{notice.title}</Heading>
        {notice.points.map((p) => <Bullet key={p}>{p}</Bullet>)}
      </Card>

      <SectionHeader title="Report a concern" />
      <Text style={s.rationale}>Reviewed by a real person, not a bot.{partnerName ? '' : ' To report a partner, open the report from their shift.'}</Text>
      <View style={styles.chipGrid}>
        {notice.categories.map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c] ?? c} selected={category === c} onPress={() => setCategory(c)} role="radio" />
        ))}
      </View>
      <Input
        wrapperStyle={s.field}
        label="What happened? (optional)"
        multiline
        value={description}
        onChangeText={setDescription}
        placeholder="Anything that helps our team understand"
      />
      {pairingId ? (
        <Toggle
          style={s.field}
          label="Also take me out of this pairing (no cost to me)"
          value={cancelPairing}
          onValueChange={setCancelPairing}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { marginTop: 16 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
});
