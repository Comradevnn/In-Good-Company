import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import { Avatar, ErrorText, Loading, PillButton, Screen } from '../components/AppParts';

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
      <Text style={s.eyebrow}>Buddies</Text>
      <Text style={s.h2}>Your volunteer buddies</Text>
      <Text style={s.rationale}>
        {data.slots.used} of {data.slots.cap} buddy slot{data.slots.cap === 1 ? '' : 's'} on your plan. Either of you can end this anytime, no explanation needed.
      </Text>
      {data.buddies.length === 0 ? (
        <Text style={[s.rationale, { marginTop: 18 }]}>No buddies yet. After a shift, if you and your partner both say you'd volunteer together again, you'll show up here.</Text>
      ) : null}
      {data.buddies.map((b) => (
        <View key={b.buddy_id} style={[app.buddyMini, { marginTop: 16 }]}>
          <Avatar name={b.display_name} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={app.buddyName}>{b.display_name}</Text>
            <Text style={app.buddySub}>{b.shifts_together} shift{b.shifts_together === 1 ? '' : 's'} together · since {new Date(b.since).toLocaleDateString()}</Text>
            <Text style={[app.buddySub, { color: '#B4543A', marginTop: 4 }]} onPress={() => end(b)}>End buddy status</Text>
          </View>
          <TouchableOpacity style={app.miniBtn} onPress={() => navigate('startMatching', { buddy: b })}>
            <Text style={app.miniBtnText}>Rebook</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={app.ctaInline}>
        <Text style={app.ctaInlineText}>Want to meet someone new instead? Every new search, you choose.</Text>
        <PillButton label="Find a shift" ghost onPress={() => navigate('startMatching')} />
      </View>
      <ErrorText error={error} />
    </Screen>
  );
}
