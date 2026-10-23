import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { api } from '../api/client';
import {
  Card, DiscPair, EmptyState, ErrorText, Headline, LinkButton, Loading, PillButton, Screen,
} from '../components/AppParts';
import { lensFor, personKeyFor } from '../theme/people';

// The signed-in user's id is not passed to this screen; discs use the same placeholder as Home.
const ME = 'me';

// Volunteer buddies (plotline "buddies"). Rebooking with a buddy still goes
// through matching (and counts toward the monthly cap); either buddy can end
// it at any time without the other being notified.
export default function BuddiesScreen({ sessionToken, navigate, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => api(sessionToken, '/buddies').then(setData).catch(setError), [sessionToken]);
  useEffect(() => {
    load();
  }, [load]);

  function end(buddy) {
    Alert.alert(`End buddy status with ${buddy.display_name}?`, "They won't be notified. You can still be matched with new people anytime.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: () => api(sessionToken, `/buddies/${buddy.buddy_id}/end`, { method: 'POST' }).then(load).catch(setError) },
    ]);
  }

  if (!data) return <Screen title="Buddies" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  return (
    <Screen title="Buddies" onBack={onBack}>
      <Headline>Your volunteer buddies</Headline>
      <Text style={styles.lede}>
        {data.slots.used} of {data.slots.cap} buddy slot{data.slots.cap === 1 ? '' : 's'} on your plan. Either of you can end this anytime, no explanation needed.
      </Text>
      {data.buddies.length === 0 ? (
        <EmptyState body="No buddies yet. After a shift, if you and your partner both say you'd volunteer together again, you'll show up here." style={{ marginTop: 24 }} />
      ) : null}
      {data.buddies.map((b) => {
        const keyB = personKeyFor(b.user_id ?? b.buddy_id, ME);
        return (
          <Card key={b.buddy_id} style={styles.buddy}>
            <View style={styles.row}>
              <DiscPair
                r={24}
                d={28}
                colourA={colors.you}
                colourB={colors[keyB]}
                lens={lensFor('you', keyB)}
                youIcon
                initial={(b.display_name ?? '?').slice(0, 1)}
              />
              <View style={styles.flex}>
                <Text style={styles.name}>{b.display_name}</Text>
                <Text style={styles.sub}>{b.shifts_together} shift{b.shifts_together === 1 ? '' : 's'} together</Text>
                <Text style={styles.sub}>since {new Date(b.since).toLocaleDateString()}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.rebook, pressed && { backgroundColor: colors.surfacePressed }]}
                onPress={() => navigate('startMatching', { buddy: b })}
                accessibilityRole="button"
                accessibilityLabel={`Rebook with ${b.display_name}`}
              >
                <Text style={styles.rebookText}>Rebook</Text>
              </Pressable>
            </View>
            <LinkButton label="End buddy status" danger onPress={() => end(b)} style={{ alignSelf: 'flex-start' }} />
          </Card>
        );
      })}
      <Card style={{ marginTop: 24 }}>
        <Text style={styles.ctaText}>Want to meet someone new instead? Every new search, you choose.</Text>
        <PillButton label="Find a shift" ghost onPress={() => navigate('startMatching')} />
      </Card>
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lede: { ...type.bodyS, color: colors.ink2, marginTop: 8 },
  buddy: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { ...type.subtitle, color: colors.ink },
  sub: { ...type.bodyS, color: colors.ink2 },
  rebook: {
    minHeight: 48, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink,
    borderRadius: 999, paddingHorizontal: 16,
  },
  rebookText: { ...type.label, color: colors.ink },
  ctaText: { ...type.bodyS, color: colors.ink, marginBottom: 12 },
});
