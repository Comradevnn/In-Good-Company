import { useCallback, useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import { ErrorText, Loading, PillButton, Screen, SectionTitle } from '../components/AppParts';

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
      <Text style={s.eyebrow}>Demo only — no real payment</Text>
      <Text style={s.h2}>{isPremium ? (premium.source === 'trial' ? "You're on the Premium trial" : "You're Premium") : "You're on the free plan"}</Text>
      <Text style={s.rationale}>
        {premium.source === 'trial' ? `Your trial ends ${new Date(premium.trial_ends_at).toLocaleDateString()}. ` : ''}
        {premium.source === 'subscription' && premium.premium_until ? `Paid through ${new Date(premium.premium_until).toLocaleDateString()}. ` : ''}
        Premium never changes who you're matched with or how fast.
      </Text>

      <View style={app.depositBox}>
        {[
          ['Matched shifts this month', `${premium.cap.used} of ${premium.cap.cap}`],
          ['Buddy slots', `${premium.buddy_slots.used} of ${premium.buddy_slots.cap}`],
          ['Free Deeds each week', isPremium ? String(premium.weekly_grant) : '—'],
          ['Penalty-free late cancel this month', isPremium ? (premium.free_late_cancel_available ? 'Available' : 'Used') : '—'],
        ].map(([label, value]) => (
          <View key={label} style={app.depositLine}>
            <Text style={app.depositLabel}>{label}</Text>
            <Text style={app.depositTotal}>{value}</Text>
          </View>
        ))}
      </View>

      {premium.source !== 'subscription' ? (
        <>
          <SectionTitle title="Go Premium" />
          <Text style={s.rationale}>More matched shifts each month, weekly free Deeds, more buddy slots, a partner age filter, and a penalty-free late cancel each month.</Text>
          {premium.plans.map((plan) => (
            <View key={plan.plan} style={[app.discoverCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <View>
                <Text style={app.discoverTitle}>{plan.plan === 'monthly' ? 'Monthly' : 'Annual'}</Text>
                <Text style={app.discoverOrg}>${plan.usd} / {plan.months === 1 ? 'month' : 'year'}</Text>
              </View>
              <PillButton label="Subscribe (demo)" onPress={() => subscribe(plan.plan)} disabled={busy} />
            </View>
          ))}
          <Text style={app.finetext}>Demo subscription: nothing is charged and no card details are collected. Paid time starts when your trial ends.</Text>
        </>
      ) : null}

      {referral ? (
        <>
          <SectionTitle title="Invite friends" />
          <Text style={s.rationale}>
            When a friend signs up with your code and verifies their ID, you earn {referral.deeds_per_friend} free Deed (limited to one a week).
          </Text>
          <View style={app.depositBox}>
            <View style={app.depositLine}><Text style={app.depositLabel}>Your code</Text><Text style={[app.depositTotal, { fontFamily: 'IBMPlexMono_500Medium' }]}>{referral.code}</Text></View>
            <View style={app.depositLine}><Text style={app.depositLabel}>Friends joined</Text><Text style={app.depositTotal}>{referral.friends_joined}</Text></View>
            <View style={app.depositLine}><Text style={app.depositLabel}>Deeds earned</Text><Text style={app.depositTotal}>{referral.deeds_earned}</Text></View>
          </View>
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
