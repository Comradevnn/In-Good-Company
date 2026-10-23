import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { Card, Display, ErrorText, Headline, Icon, ListRow, Screen, SectionHeader, Tag } from '../components/AppParts';
import { BACKEND_URL } from '../config/api';
import { api } from '../api/client';

// DEMO ONLY — no real payment processing (no Apple/Google Pay, no card
// entry per plotline.html's payment screen). "Buy" calls POST
// /deeds/purchase, a mock purchase recorded in the backend's Deeds ledger.
// Nothing here charges any money. The screen also shows Deeds held for
// upcoming shifts and the recent ledger history.
const ENTRY_LABELS = {
  purchase: 'Bought',
  opening_balance: 'Starting balance',
  premium_grant: 'Weekly Premium Deeds',
  referral: 'Friend joined',
  hold: 'Held for a shift',
  release: 'Released back',
  return: 'Returned — you showed up',
  forfeit: 'Went to the org',
};
// Fallback only: the server's GET /deeds packs (deeds + usd) are what's shown
// once loaded. opening_balance is still written by the DB migration.
const FALLBACK_PACKS = [
  { deeds: 5, price: 5 },
  { deeds: 25, price: 25 },
  { deeds: 50, price: 50 },
];

export default function DeedsScreen({ sessionToken, balance, onBalanceChange, onBack, onPremium }) {
  const [justPurchased, setJustPurchased] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);
  const [ledger, setLedger] = useState(null);

  function loadLedger() {
    api(sessionToken, '/deeds').then((data) => {
      setLedger(data);
      onBalanceChange?.(data.available);
    }).catch(() => {});
  }
  useEffect(loadLedger, [sessionToken]);

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
      loadLedger();
      setJustPurchased(pack);
      setTimeout(() => setJustPurchased(null), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasing(false);
    }
  }

  const packs = Array.isArray(ledger?.packs) && ledger.packs.length
    ? ledger.packs.map((p) => ({ deeds: p.deeds, price: p.usd }))
    : FALLBACK_PACKS;

  return (
    <Screen title="Deeds (demo)" onBack={onBack}>
      <Headline>Your Deeds balance</Headline>
      <Text style={styles.body}>
        Confirming a matched shift holds Deeds; show up and they come back. Tapping "Buy" adds
        to your balance — no money changes hands, nothing is actually charged.
      </Text>

      <Card tone="ink" style={{ marginTop: 20 }}>
        <Tag label="Demo only — no real payment" tone="accent" />
        <Text
          style={[type.display, { color: colors.accent, marginTop: 16 }]}
          maxFontSizeMultiplier={1.3}
          accessibilityLabel={`${balance ?? 0} Deeds`}
        >
          {balance ?? 0}
        </Text>
        <Text style={[type.subtitle, { color: colors.onInk }]}>Deeds</Text>
        {justPurchased || ledger?.held ? <View style={styles.divider} /> : null}
        {justPurchased ? (
          <View style={styles.noteLine}>
            <Icon name="check" size={20} color={colors.accent} />
            <Text style={[type.label, { color: colors.accent }]}>+{justPurchased.deeds} added</Text>
          </View>
        ) : null}
        {ledger?.held ? (
          <Text style={[type.bodyS, { color: colors.onInk2, marginTop: justPurchased ? 4 : 0 }]}>
            {ledger.held} more held for upcoming shifts
          </Text>
        ) : null}
      </Card>

      <ErrorText error={error} />

      <SectionHeader title="Buy Deeds" />
      {packs.map((pack) => (
        <ListRow
          key={pack.deeds}
          label={`${pack.deeds} Deeds`}
          sublabel={`$${pack.price}`}
          onPress={purchasing ? undefined : () => handlePurchase(pack)}
          trailing={(
            <View style={[styles.buyPill, purchasing && { backgroundColor: colors.offBg }]}>
              <Text style={[type.button, { color: purchasing ? colors.offFg : colors.onInk }]} maxFontSizeMultiplier={1.3}>Buy</Text>
            </View>
          )}
        />
      ))}

      {onPremium ? (
        <ListRow
          icon="star"
          label="Premium includes free Deeds every week"
          onPress={onPremium}
          style={{ marginTop: 16 }}
        />
      ) : null}

      {ledger?.history?.length ? (
        <>
          <SectionHeader title="Recent activity" />
          {ledger.history.slice(0, 15).map((entry, i) => {
            const delta = entry.available_delta;
            return (
              <ListRow
                key={i}
                label={ENTRY_LABELS[entry.entry_type] ?? entry.entry_type}
                trailing={(
                  <Text style={[type.subtitle, { color: colors.ink }]}>
                    {entry.entry_type === 'forfeit' ? `−${-entry.held_delta}` : delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0'}
                  </Text>
                )}
              />
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...type.bodyS, color: colors.ink2, marginTop: 8 },
  divider: { marginTop: 16, marginBottom: 12, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.onInkLine },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buyPill: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
