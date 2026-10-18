import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, InfoCard, Loading, Screen, SectionTitle } from '../components/AppParts';

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
      <Screen title="Safety" footer={<PrimaryButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} />}>
        <Text style={s.h2}>Thank you for telling us</Text>
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
      footer={category ? <PrimaryButton label="Send report" onPress={submit} disabled={busy} loading={busy} /> : null}
    >
      <Text style={s.eyebrow}>Safety</Text>
      <Text style={s.h2}>{partnerName ? `Report a concern about ${partnerName}` : 'Staying safe'}</Text>
      <InfoCard title={notice.title}>
        {notice.points.map((p) => <Text key={p} style={app.safetyBody}>• {p}</Text>)}
      </InfoCard>

      <SectionTitle title="Report a concern" />
      <Text style={s.rationale}>Reviewed by a real person, not a bot.{partnerName ? '' : ' To report a partner, open the report from their shift.'}</Text>
      <View style={s.chipGrid}>
        {notice.categories.map((c) => (
          <TouchableOpacity key={c} style={[s.chip, category === c && s.chipSelected]} onPress={() => setCategory(c)}>
            <Text style={[s.chipText, category === c && s.chipTextSelected]}>{CATEGORY_LABELS[c] ?? c}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.field}>
        <Text style={s.label}>What happened? (optional)</Text>
        <TextInput
          style={[s.input, s.textarea]}
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="Anything that helps our team understand"
          placeholderTextColor={colors.inkSoft}
        />
      </View>
      {pairingId ? (
        <TouchableOpacity style={s.toggleRow} onPress={() => setCancelPairing((v) => !v)}>
          <Text style={s.toggleLabel}>Also take me out of this pairing (no cost to me)</Text>
          <View style={[s.switchTrack, cancelPairing && s.switchTrackOn]}><View style={[s.switchThumb, cancelPairing && s.switchThumbOn]} /></View>
        </TouchableOpacity>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}
