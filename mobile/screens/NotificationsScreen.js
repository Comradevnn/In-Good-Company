import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import { ErrorText, Loading, Screen } from '../components/AppParts';

// In-app inbox (no push infrastructure in the prototype). Tapping an item
// opens the pairing or booking it's about.
export default function NotificationsScreen({ sessionToken, navigate, onBack }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(sessionToken, '/notifications')
      .then((data) => {
        setItems(data.notifications);
        return api(sessionToken, '/notifications/read', { method: 'POST' });
      })
      .catch(setError);
  }, [sessionToken]);

  function open(n) {
    if (n.ref_type === 'pairing') navigate(n.kind === 'bail_decision' ? 'bail' : 'pairing', { pairingId: n.ref_id });
    else if (n.ref_type === 'booking') navigate(n.kind === 'rate_shift' ? 'rating' : 'booking', { bookingId: n.ref_id });
  }

  if (!items) return <Screen title="Notifications" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  return (
    <Screen title="Notifications" onBack={onBack}>
      {items.length === 0 ? <Text style={s.rationale}>Nothing yet — updates about your matches and shifts will show up here.</Text> : null}
      {items.map((n) => (
        <TouchableOpacity key={n.id} style={app.discoverCard} onPress={() => open(n)} disabled={!n.ref_type}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[app.buddyName, { flex: 1 }]}>{!n.read_at ? '● ' : ''}{n.title}</Text>
            <Text style={app.buddySub}>{new Date(n.created_at).toLocaleDateString()}</Text>
          </View>
          {n.body ? <Text style={app.discoverMeta}>{n.body}</Text> : null}
        </TouchableOpacity>
      ))}
    </Screen>
  );
}
