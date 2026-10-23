import { useCallback, useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { api } from '../api/client';
import { Card, ErrorText, Headline, Loading, PillButton, Screen, SectionTitle, Tag } from '../components/AppParts';

// Premium (mock subscription — no payment processor, no card details) and
// referrals. Premium only expands what your own account can do; it never
// changes who you're matched with or how fast.
export default function PremiumScreen({ sessionToken, onBack }) {
  const [premium, setPremium] = useState(null);
  const [referral, setReferral] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api(sessionToken, '/premium'), api(sessionToken, '/referral')]);
      setPremium(p);
      setReferral(r);
    } catch (err) {
      setError(err);
    }
  }, [sessionToken]);
  useEffect(() => {
    load();
  }, [load]);

  async function subscribe(plan) {
    setBusy(true);
    setError(null);
    try {
      await api(sessionToken, '/premium/subscribe', { method: 'POST', body: { plan } });
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!premium) return <Screen title="Premium" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const isPremium = premium.tier === 'premium';
  return (
    <Screen title="Premium" onBack={onBack}>
      <Headline>{isPremium ? (premium.source === 'trial' ? "You're on the Premium trial" : "You're Premium") : "You're on the free plan"}</Headline>
      <Text style={styles.lede}>
        {premium.source === 'trial' ? `Your trial ends ${new Date(premium.trial_ends_at).toLocaleDateString()}. ` : ''}
        {premium.source === 'subscription' && premium.premium_until ? `Paid through ${new Date(premium.premium_until).toLocaleDateString()}. ` : ''}
        Premium never changes who you're matched with or how fast.
      </Text>

      <Card tone="field" style={{ marginTop: 20 }}>
        <Tag label="Demo only — no real payment" tone="accent" style={{ marginBottom: 8 }} />
        {[
          ['Matched shifts this month', `${premium.cap.used} of ${premium.cap.cap}`],
          ['Buddy slots', `${premium.buddy_slots.used} of ${premium.buddy_slots.cap}`],
          ['Free Deeds each week', isPremium ? String(premium.weekly_grant) : '—'],
          ['Penalty-free late cancel this month', isPremium ? (premium.free_late_cancel_available ? 'Available' : 'Used') : '—'],
        ].map(([label, value]) => (
          <View key={label} style={styles.line}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </Card>

      {premium.source !== 'subscription' ? (
        <>
          <SectionTitle title="Go Premium" />
          <Text style={styles.lede}>More matched shifts each month, weekly free Deeds, more buddy slots, a partner age filter, and a penalty-free late cancel each month.</Text>
          {premium.plans.map((plan) => (
            <Card key={plan.plan} style={{ marginTop: 8 }}>
              <Text style={styles.planTitle}>{plan.plan === 'monthly' ? 'Monthly' : 'Annual'}</Text>
              <Text style={styles.label}>${plan.usd} / {plan.months === 1 ? 'month' : 'year'}</Text>
              <PillButton label="Subscribe (demo)" ghost onPress={() => subscribe(plan.plan)} disabled={busy} style={{ marginTop: 12 }} />
            </Card>
          ))}
          <Text style={styles.fine}>Demo subscription: nothing is charged and no card details are collected. Paid time starts when your trial ends.</Text>
        </>
      ) : null}

      {referral ? (
        <>
          <SectionTitle title="Invite friends" />
          <Text style={styles.lede}>
            When a friend signs up with your code and verifies their ID, you earn {referral.deeds_per_friend} free Deed (limited to one a week).
          </Text>
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.label}>Your code</Text>
            <View style={styles.code} accessible accessibilityLabel={`Your code: ${referral.code}`}>
              <Text style={styles.codeText} selectable>{referral.code}</Text>
            </View>
            <View style={styles.line}><Text style={styles.label}>Friends joined</Text><Text style={styles.value}>{referral.friends_joined}</Text></View>
            <View style={styles.line}><Text style={styles.label}>Deeds earned</Text><Text style={styles.value}>{referral.deeds_earned}</Text></View>
          </Card>
          <PillButton
            label="Share my code"
            ghost
            style={{ marginTop: 12 }}
            onPress={() => Share.share({ message: `Volunteer with me on In Good Company — use my code ${referral.code} when you sign up.` })}
          />
        </>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { ...type.bodyS, color: colors.ink2, marginTop: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 6 },
  label: { ...type.bodyS, color: colors.ink2, flexShrink: 1 },
  value: { ...type.subtitle, color: colors.ink },
  planTitle: { ...type.subtitleL, color: colors.ink },
  fine: { ...type.bodyS, color: colors.ink2, marginTop: 12 },
  code: {
    marginVertical: 8, minHeight: 56, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink,
  },
  codeText: { ...type.titleS, color: colors.ink },
});
