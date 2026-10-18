import { useCallback, useEffect, useState } from 'react';
import { Share, Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api, timeUntil } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import PartnerCard from '../components/PartnerCard';
import { ErrorText, InfoCard, Loading, PillButton, Screen, ShiftCard } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// One pairing, whatever state it's in (plotline "match" + "partnerProfile"):
//   proposed   → see the exact shift and partner, confirm (Deeds held only
//                now) or decline; first-timers read the safety notice first;
//   confirmed  → partner, shift, chat, share my plans, cancel, report;
//   cancelled  → the "your match can't make it" choice, or what happened;
//   completed  → rate the shift.
const POLL_MS = 5000;
const ERROR_ACTIONS = {
  insufficient_deeds: ['Get Deeds', 'deeds'],
  monthly_cap_reached: ['See Premium', 'premium'],
};

export default function PairingScreen({ sessionToken, pairingId, navigate, onBack }) {
  const [pairing, setPairing] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [noticeRead, setNoticeRead] = useState(false);

  const load = useCallback(async () => {
    try {
      setPairing(await api(sessionToken, `/pairings/${pairingId}`));
    } catch (err) {
      setError(err);
    }
  }, [sessionToken, pairingId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!pairing) return <Screen title="Your shift" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;

  const p = pairing;
  const partnerName = p.partner.display_name;
  const nowMs = Date.parse(p.now); // server time, so the dev clock applies
  const proposedNeedsMe = p.status === 'proposed' && !p.me_confirmed;
  const errorAction = error?.code ? ERROR_ACTIONS[error.code] : null;
  const devJumps = [['→ shift start', p.shift.starts_at], ['→ shift end', p.shift.ends_at]];

  async function sharePlans() {
    const plan = await api(sessionToken, `/pairings/${pairingId}/share-plan`);
    await Share.share({ message: plan.message });
  }

  // ── Proposal: confirm or decline ──
  if (proposedNeedsMe) {
    const canConfirm = !p.safety_notice_required || noticeRead;
    // Each state gets its own keyed Screen so moving from the long proposal to
    // the shorter detail view starts at the top instead of a stale offset.
    return (
      <Screen
        key="proposal"
        title="Shift proposal"
        onBack={onBack}
        footer={(
          <PrimaryButton
            label={`Confirm & hold ${p.deeds.price} Deeds`}
            onPress={() => run(() => api(sessionToken, `/pairings/${pairingId}/confirm`, { method: 'POST', body: { safety_notice_ack: noticeRead } }))}
            disabled={busy || !canConfirm}
            loading={busy}
          />
        )}
      >
        <Text style={s.eyebrow}>We found you a shift</Text>
        <Text style={s.h2}>{p.shift.when_label}</Text>
        <Text style={s.rationale}>
          Here's exactly where you'd go and who with. Nothing is held until you confirm.
          {p.partner_confirmed ? ` ${partnerName} has already confirmed.` : ''} Respond within {timeUntil(p.proposal_expires_at, nowMs)}.
        </Text>
        <ShiftCard shift={p.shift} />
        {p.shift.description ? <Text style={[app.finetext, { marginTop: 10 }]}>{p.shift.description}</Text> : null}
        <PartnerCard sessionToken={sessionToken} pairingId={pairingId} partner={p.partner} />

        <View style={app.depositBox}>
          <View style={app.depositLine}>
            <Text style={app.depositLabel}>Held from your Deeds when you confirm</Text>
            <Text style={app.depositTotal}>{p.deeds.price}</Text>
          </View>
          <View style={app.depositLine}>
            <Text style={app.depositLabel}>You have available</Text>
            <Text style={app.depositLabel}>{p.deeds.available}</Text>
          </View>
          <Text style={app.finetext}>
            Show up and they all come back. Change your mind shortly after confirming and they're released, no questions asked.
            After that, backing out or not showing up means they go to the org. If {partnerName} cancels, you never pay for it.
          </Text>
        </View>

        {p.safety_notice_required ? (
          <InfoCard title={p.safety_notice.title}>
            {p.safety_notice.points.map((point) => (
              <Text key={point} style={app.safetyBody}>• {point}</Text>
            ))}
            <TouchableOpacity style={[s.toggleRow, { marginTop: 12 }]} onPress={() => setNoticeRead((v) => !v)}>
              <Text style={s.toggleLabel}>I've read this</Text>
              <View style={[s.switchTrack, noticeRead && s.switchTrackOn]}>
                <View style={[s.switchThumb, noticeRead && s.switchThumbOn]} />
              </View>
            </TouchableOpacity>
          </InfoCard>
        ) : null}

        <ErrorText error={error} />
        {errorAction ? <PillButton label={errorAction[0]} onPress={() => navigate(errorAction[1])} style={{ marginTop: 12 }} /> : null}

        <Text
          style={[app.quietLink, { marginTop: 22 }]}
          onPress={() => run(async () => {
            await api(sessionToken, `/pairings/${pairingId}/decline`, { method: 'POST', body: { keep_looking: true } });
            navigate('waiting', {}, { replace: true });
          })}
        >
          Not this one — keep looking
        </Text>
        <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={devJumps} />
      </Screen>
    );
  }

  // ── Bail: your partner backed out ──
  if (p.status === 'cancelled' && p.bail) {
    return (
      <Screen key="bail" title="Your shift" onBack={onBack}>
        <Text style={s.eyebrow}>Change of plans</Text>
        <Text style={s.h2}>{p.bail.backed_out_by_name} can't make it</Text>
        <ShiftCard shift={p.shift} />
        {p.bail.open ? (
          <>
            <Text style={[s.rationale, { marginTop: 14 }]}>You won't pay for their cancellation. Decide within {timeUntil(p.bail.deadline, nowMs)}.</Text>
            <PillButton label="Choose what happens next" onPress={() => navigate('bail', { pairingId })} style={{ marginTop: 14 }} />
          </>
        ) : (
          <InfoCard
            tone="ok"
            title={{ rematch: "We're finding you someone new", release: 'Your Deeds are back', auto_release: 'Your Deeds are back', no_response_release: 'Your Deeds are back' }[p.bail.choice] ?? 'Done'}
            body={p.bail.choice === 'rematch'
              ? "We'll propose a new partner for this same shift. Your spot and hold stay as they are."
              : 'Your held Deeds were released in full. Check Home for your spot — you may still be able to go solo.'}
          />
        )}
        <PillButton label="Back to home" ghost onPress={() => navigate('home', {}, { reset: true })} style={{ marginTop: 18 }} />
      </Screen>
    );
  }

  // ── Ended states ──
  if (['declined', 'expired'].includes(p.status) || (p.status === 'cancelled' && p.backed_out_by_me)) {
    const titles = { declined: 'This proposal was declined', expired: 'This proposal expired', cancelled: 'You cancelled this shift' };
    return (
      <Screen key="ended" title="Your shift" onBack={onBack}>
        <Text style={s.h2}>{titles[p.status]}</Text>
        <Text style={s.rationale}>
          {p.status === 'cancelled'
            ? `${partnerName} has been told and offered a new partner or their Deeds back.`
            : 'Any Deeds you had on hold for it are back in your balance.'}
        </Text>
        <PillButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} style={{ marginTop: 18 }} />
      </Screen>
    );
  }

  // ── Confirmed / waiting on partner / completed ──
  const started = Date.parse(p.shift.starts_at) <= nowMs;
  const checkedIn = p.my_booking.status === 'attended';
  const inGrace = p.my_booking.grace_ends_at && Date.parse(p.my_booking.grace_ends_at) > nowMs;

  return (
    <Screen
      key="detail"
      title="Your shift"
      onBack={onBack}
      footer={p.chat_open ? <PrimaryButton label={`Chat with ${partnerName}`} onPress={() => navigate('chat', { pairingId })} /> : null}
    >
      <Text style={s.eyebrow}>{p.status === 'completed' ? 'Shift complete' : p.status === 'proposed' ? "You're confirmed" : "You're paired"}</Text>
      <Text style={s.h2}>{p.shift.when_label}</Text>
      {p.status === 'proposed' ? (
        <InfoCard title={`Waiting for ${partnerName} to confirm`} body={`They have until ${new Date(p.proposal_expires_at).toLocaleString()}. If they don't, your Deeds come straight back and we keep looking.`} />
      ) : null}
      {p.status === 'confirmed' && started ? (
        <InfoCard
          tone={checkedIn ? 'ok' : undefined}
          title={checkedIn ? "✓ You're checked in" : "It's shift time"}
          body={checkedIn ? 'Your Deeds are back in your balance. Conversation starters will pop into your chat.' : 'Find the staff when you arrive and they will check you in.'}
        />
      ) : null}
      {p.status === 'completed' ? (
        <PillButton label="Rate the shift" onPress={() => navigate('rating', { bookingId: p.my_booking.id })} style={{ marginTop: 14 }} />
      ) : null}

      <PartnerCard sessionToken={sessionToken} pairingId={pairingId} partner={p.partner} />
      <ShiftCard shift={p.shift} />
      {p.my_booking.hold ? (
        <Text style={app.finetext}>
          {p.my_booking.hold.amount} Deeds {p.my_booking.hold.status === 'held' ? 'held for this shift' : p.my_booking.hold.status}.
          {inGrace ? ` Free to cancel until ${new Date(p.my_booking.grace_ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''}
        </Text>
      ) : null}

      {p.status === 'confirmed' ? (
        <View style={app.safetyCard}>
          <Text style={app.safetyTitle}>Share my plans</Text>
          <Text style={app.safetyBody}>Send someone you trust the time, the place and {partnerName}'s verified first name. Works with any contact.</Text>
          <PillButton label="Share my plans" ghost onPress={() => run(sharePlans)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      <TouchableOpacity style={app.safetyCard} onPress={() => navigate('safety', { pairingId, partnerName })}>
        <Text style={app.safetyTitle}>Something feel off?</Text>
        <Text style={app.safetyBody}>Report any concern — reviewed by a real person, not a bot.</Text>
      </TouchableOpacity>

      <ErrorText error={error} />
      {['confirmed', 'proposed'].includes(p.status) && !started ? (
        <Text style={[app.dangerLink, { marginTop: 22 }]} onPress={() => navigate('cancel', { bookingId: p.my_booking.id })}>
          Can't make it? Cancel your shift
        </Text>
      ) : null}
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={devJumps} />
    </Screen>
  );
}
