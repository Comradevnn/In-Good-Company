import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font, radii } from '../theme/tokens';
import { api } from '../api/client';

// Dev builds only: fast-forwards the BACKEND's clock (POST /dev/clock/advance)
// so the waiting period, grace windows, shift day and the trial can be
// walked through in minutes. Affects everyone on that backend process.
export default function DevClockBar({ sessionToken, onAdvanced, jumps = [] }) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(null);
  if (!__DEV__) return null;

  async function advance(body) {
    setBusy(true);
    try {
      const data = await api(sessionToken, '/dev/clock/advance', { method: 'POST', body });
      setLabel(`server time +${data.offset_hours}h`);
      onAdvanced?.();
    } catch (err) {
      setLabel(err.message);
    } finally {
      setBusy(false);
    }
  }

  const buttons = [
    ['+1h', { hours: 1 }],
    ['+1 day', { days: 1 }],
    // The server refuses jumps into its past, so stale targets just show an error.
    ...jumps.filter(([, to]) => to).map(([text, to]) => [text, { to }]),
  ];
  return (
    <View style={bar}>
      <Text style={barLabel}>DEV CLOCK{label ? ` · ${label}` : ''}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {buttons.map(([text, body]) => (
          <Pressable
            key={text}
            style={({ pressed }) => [chip, pressed && { backgroundColor: colors.surfacePressed }, busy && { borderColor: colors.offBg }]}
            onPress={() => advance(body)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityState={{ disabled: busy }}
          >
            <Text style={chipText}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Quiet dev chrome: a tint card with small chips, in the app's own type.
const bar = { marginTop: 24, backgroundColor: colors.tint, borderRadius: radii.notice, padding: 12 };
const barLabel = { fontFamily: font.textBold, fontSize: 13, lineHeight: 18, color: colors.ink2 };
const chip = {
  minHeight: 44, justifyContent: 'center', borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.surface,
  borderRadius: radii.pill, paddingHorizontal: 14,
};
const chipText = { fontFamily: font.textSemiBold, fontSize: 14, lineHeight: 20, color: colors.ink };
