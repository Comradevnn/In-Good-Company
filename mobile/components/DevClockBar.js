import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {buttons.map(([text, body]) => (
          <TouchableOpacity key={text} style={chip} onPress={() => advance(body)} disabled={busy}>
            <Text style={chipText}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const bar = { marginTop: 26, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 12, padding: 10 };
const barLabel = { fontFamily: 'IBMPlexMono_500Medium', fontSize: 10.5, color: colors.inkSoft, letterSpacing: 1 };
const chip = { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 };
const chipText = { fontFamily: 'IBMPlexMono_400Regular', fontSize: 11, color: colors.inkSoft };
