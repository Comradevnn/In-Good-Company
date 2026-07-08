import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { BACKEND_URL } from '../config/api';

// DEMO ONLY — no real payment processing (no Apple/Google Pay, no card
// entry per plotline.html's payment screen). "Buy" calls POST
// /deeds/purchase, which just increments backend/db/schema.sql's
// deeds_balance column directly — a real balance now (needed since
// /matching/run gates on it and back-out spends it), just not a real
// purchase. Nothing here charges any money.
const PACKS = [
  { deeds: 5, price: 5 },
  { deeds: 25, price: 25 },
  { deeds: 50, price: 50 },
];

export default function DeedsScreen({ sessionToken, balance, onBalanceChange, onBack }) {
  const [justPurchased, setJustPurchased] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);

  async function handlePurchase(pack) {
    setPurchasing(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/deeds/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ deeds: pack.deeds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not complete purchase.');
      onBalanceChange?.(data.deeds_balance);
      setJustPurchased(pack);
      setTimeout(() => setJustPurchased(null), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <View style={s.container}>
      <OnboardingTopBar title="Deeds (demo)" onBack={onBack} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <Text style={s.eyebrow}>Demo only — no real payment</Text>
        <Text style={s.h2}>Your Deeds balance</Text>
        <Text style={s.rationale}>
          Deeds books one matched shift. Tapping "Buy" adds to your real balance (used by
          Find a match and Back out) — no money changes hands, nothing is actually charged.
        </Text>

        <View style={balanceCard}>
          <Text style={balanceNumber}>{balance ?? 0}</Text>
          <Text style={balanceLabel}>Deeds</Text>
          {justPurchased ? (
            <Text style={purchasedNote}>+{justPurchased.deeds} added ✓</Text>
          ) : null}
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <Text style={[s.label, { marginTop: 22 }]}>Buy Deeds</Text>
        {PACKS.map((pack) => (
          <TouchableOpacity
            key={pack.deeds}
            style={packRow}
            onPress={() => handlePurchase(pack)}
            disabled={purchasing}
          >
            <View>
              <Text style={packDeeds}>{pack.deeds} Deeds</Text>
              <Text style={packPrice}>${pack.price}</Text>
            </View>
            <View style={buyPill}>
              <Text style={buyPillText}>Buy</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const balanceCard = {
  marginTop: 18,
  borderRadius: 18,
  paddingVertical: 26,
  alignItems: 'center',
  backgroundColor: colors.ink,
};
const balanceNumber = {
  fontFamily: 'Fraunces_600SemiBold',
  fontSize: 40,
  color: '#F2EFE4',
};
const balanceLabel = {
  fontFamily: 'IBMPlexMono_500Medium',
  fontSize: 12,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: colors.ochre,
  marginTop: 2,
};
const purchasedNote = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 12.5,
  color: '#7ECB9B',
  marginTop: 8,
};
const packRow = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderWidth: 1.5,
  borderColor: colors.line,
  borderRadius: 14,
  padding: 14,
  marginTop: 10,
  backgroundColor: colors.surface,
};
const packDeeds = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 14.5,
  color: colors.ink,
};
const packPrice = {
  fontFamily: 'Inter_400Regular',
  fontSize: 12.5,
  color: colors.inkSoft,
  marginTop: 2,
};
const buyPill = {
  borderRadius: 999,
  paddingVertical: 8,
  paddingHorizontal: 18,
  backgroundColor: colors.moss,
};
const buyPillText = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 13,
  color: '#F6F4EA',
};
