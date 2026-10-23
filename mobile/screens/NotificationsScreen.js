import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { radii, type } from '../theme/tokens';
import { api } from '../api/client';
import { EmptyState, ErrorText, Loading, Screen } from '../components/AppParts';

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
    else if (n.ref_type === 'matching') navigate('startMatching');
  }

  if (!items) return <Screen title="Notifications" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  return (
    <Screen title="Notifications" onBack={onBack}>
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" body="Updates about your matches and shifts will show up here." />
      ) : null}
      {items.map((n) => (
        <Pressable
          key={n.id}
          style={({ pressed }) => [styles.row, pressed && n.ref_type && { backgroundColor: colors.tintPressed }]}
          onPress={() => open(n)}
          disabled={!n.ref_type}
          accessibilityRole={n.ref_type ? 'button' : undefined}
          accessibilityLabel={`${!n.read_at ? 'Unread. ' : ''}${n.title}${n.body ? `. ${n.body}` : ''}. ${new Date(n.created_at).toLocaleDateString()}`}
        >
          <View style={styles.dotSlot}>{!n.read_at ? <View style={styles.dot} /> : null}</View>
          <View style={styles.text}>
            <Text style={styles.title}>{n.title}</Text>
            {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
            <Text style={styles.date}>{new Date(n.created_at).toLocaleDateString()}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8,
    borderRadius: radii.notice, paddingVertical: 16, paddingHorizontal: 16, backgroundColor: colors.tint,
  },
  dotSlot: { width: 12, paddingTop: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.unread },
  text: { flex: 1 },
  title: { ...type.subtitle, color: colors.ink },
  body: { ...type.bodyS, color: colors.ink2, marginTop: 4 },
  date: { ...type.bodyS, color: colors.ink2, marginTop: 4 },
});
