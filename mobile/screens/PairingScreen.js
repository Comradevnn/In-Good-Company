import { useCallback, useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { font, HEAD_TEXT, radii, touch, type } from '../theme/tokens';
import { lensFor, onLensFor, personKeyFor } from '../theme/people';
import { api, timeUntil } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import PartnerCard from '../components/PartnerCard';
import {
  Bullet, Button, Card, DiscPair, DiscPairApart, ErrorText, factLines, Headline, Icon, InfoCard, KeyboardScroll, LinkButton, ListRow, Loading,
  Screen, ShiftCard, Tag, Toggle, TopBar,
} from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// One pairing, whatever state it's in (plotline "match" + "partnerProfile"):
//   proposed   - see the exact shift and partner, confirm (Deeds held only
//                now) or decline; first-timers read the safety notice first;
//   confirmed  - partner, shift, chat, share my plans, cancel, report;
//   cancelled  - the "your match can't make it" choice, or what happened;
//   completed  - rate the shift.
const POLL_MS = 5000;
const ERROR_ACTIONS = {
  insufficient_deeds: ['Get Deeds', 'deeds'],
  monthly_cap_reached: ['See Premium', 'premium'],
};

// The shift label is "Day · start–end"; the hero lens shows it as up to three lines.
function lensLines(label) {
  const [day, time] = String(label ?? '').split(' · ');
  if (!time) return [String(label ?? '')];
  const [start, end] = time.split('–');
  return end ? [day, start, `–${end}`] : [day, start];
}

// Same id the partner card uses for the partner's disc, so the colour matches everywhere.
const partnerIdOf = (partner) => partner.user_id ?? partner.id ?? partner.display_name;

export default function PairingScreen({ sessionToken, pairingId, navigate, onBack }) {
  const [pairing, setPairing] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [noticeRead, setNoticeRead] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
  const partnerKey = personKeyFor(partnerIdOf(p.partner), null);
  const nowMs = Date.parse(p.now); // server time, so the dev clock applies
  const proposedNeedsMe = p.status === 'proposed' && !p.me_confirmed;
  const errorAction = error?.code ? ERROR_ACTIONS[error.code] : null;
  const devJumps = [['Jump to shift start', p.shift.starts_at], ['Jump to shift end', p.shift.ends_at]];

  async function sharePlans() {
    const plan = await api(sessionToken, `/pairings/${pairingId}/share-plan`);
    await Share.share({ message: plan.message });
  }

  // ── Proposal: confirm or decline ──
  if (proposedNeedsMe) {
    const canConfirm = !p.safety_notice_required || noticeRead;
    // The big pair is sized to the screen: 280 discs at 390 wide, the lens holding the shift.
    const r = Math.min(150, Math.floor((width - 10) / 2.714));
    const d = Math.round((r * 5) / 7);
    const k = r / 140;
    const lines = lensLines(p.shift.when_label);
    const lineSizes = [[22, 28], [38, 42], [26, 32]].map(([size, line]) => ({ fontSize: Math.round(size * k), lineHeight: Math.round(line * k) }));
    // Each state gets its own keyed frame so moving from the long proposal to
    // the shorter detail view starts at the top instead of a stale offset.
    return (
      <View key="proposal" style={s.container}>
        <KeyboardScroll
          header={(
            <View style={{ backgroundColor: colors.field, paddingTop: insets.top }}>
              <TopBar title="Shift proposal" onBack={onBack} />
            </View>
          )}
          footer={(
            <PrimaryButton
              label={`Confirm & hold ${p.deeds.price} Deeds`}
              onPress={() => run(() => api(sessionToken, `/pairings/${pairingId}/confirm`, { method: 'POST', body: { safety_notice_ack: noticeRead } }))}
              disabled={busy || !canConfirm}
              loading={busy}
              error={error}
            />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <View style={styles.hero}>
            <View style={styles.heroTag}>
              <Tag label="We found you a shift" />
            </View>
            <DiscPair
              r={r}
              d={d}
              colourA={colors.you}
              colourB={colors[partnerKey]}
              lens={lensFor('you', partnerKey)}
              youIcon
              initial={partnerName}
              style={{ alignSelf: 'center', marginTop: 16 }}
            >
              {lines.map((line, i) => (
                <Text
                  key={i}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.2}
                  style={[styles.lensLine, lineSizes[lines.length === 1 ? 1 : i], { color: onLensFor('you', partnerKey) }]}
                >
                  {line}
                </Text>
              ))}
            </DiscPair>
          </View>

          <View style={styles.body}>
            <Text style={[type.body, { color: colors.ink }]}>
              Here's exactly where you'd go and who with. Nothing is held until you confirm.
              {p.partner_confirmed ? ` ${partnerName} has already confirmed.` : ''} Respond within {timeUntil(p.proposal_expires_at, nowMs)}.
            </Text>
            <ShiftCard shift={p.shift} description={p.shift.description} />
            <PartnerCard sessionToken={sessionToken} pairingId={pairingId} partner={p.partner} />

            <Card tone="ink" style={{ marginTop: 16 }}>
              <View style={styles.depositLine}>
                <Text style={[type.body, { color: colors.onInk, fontFamily: font.textBold, flex: 1 }]}>Held from your Deeds when you confirm</Text>
                <Text {...HEAD_TEXT} style={[styles.numeral, { color: colors.accent }]} numberOfLines={1}>{p.deeds.price}</Text>
              </View>
              <View style={[styles.depositLine, styles.depositDivider]}>
                <Text style={[type.body, { color: colors.onInk, fontFamily: font.textBold, flex: 1 }]}>You have available</Text>
                <Text {...HEAD_TEXT} style={[styles.numeral, { color: colors.onInk }]} numberOfLines={1}>{p.deeds.available}</Text>
              </View>
              <Text style={[type.bodyS, { color: colors.onInk2, marginTop: 16 }]}>
                Show up and they all come back. Change your mind shortly after confirming and they're released, no questions asked.
                After that, backing out or not showing up means they go to the org. If {partnerName} cancels, you never pay for it.
              </Text>
            </Card>

            {p.safety_notice_required ? (
              <Card tone="field" style={{ marginTop: 16 }}>
                <View style={styles.noticeHead}>
                  <Icon name="shield-check" size={24} color={colors.ink} />
                  <Text style={[type.titleS, { color: colors.ink, flex: 1 }]} accessibilityRole="header">{p.safety_notice.title}</Text>
                </View>
                <View style={{ marginTop: 14, gap: 12 }}>
                  {p.safety_notice.points.map((point) => (
                    <Bullet key={point}>{point}</Bullet>
                  ))}
                </View>
                <Toggle label="I've read this" value={noticeRead} onValueChange={setNoticeRead} style={{ marginTop: 14 }} />
              </Card>
            ) : null}

            {errorAction ? <Button label={errorAction[0]} onPress={() => navigate(errorAction[1])} ghost style={{ marginTop: 12 }} /> : null}

            <LinkButton
              label="Not this one — keep looking"
              style={{ marginTop: 12 }}
              onPress={() => run(async () => {
                await api(sessionToken, `/pairings/${pairingId}/decline`, { method: 'POST', body: { keep_looking: true } });
                navigate('waiting', {}, { replace: true });
              })}
            />
            <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={devJumps} />
          </View>
        </KeyboardScroll>
      </View>
    );
  }

  // ── Bail: your partner backed out ──
  if (p.status === 'cancelled' && p.bail) {
    return (
      <Screen
        key="bail"
        title="Your shift"
        onBack={onBack}
        footer={p.bail.open
          ? <PrimaryButton label="Choose what happens next" onPress={() => navigate('bail', { pairingId })} />
          : <PrimaryButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} />}
      >
        <Tag label="Change of plans" tone="accent" style={{ marginBottom: 12 }} />
        <Headline>{p.bail.backed_out_by_name} can't make it</Headline>
        <ShiftCard shift={p.shift} />
        {p.bail.open ? (
          <>
            <Text style={[type.body, { color: colors.ink2, marginTop: 16 }]}>You won't pay for their cancellation. Decide within {timeUntil(p.bail.deadline, nowMs)}.</Text>
            <LinkButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} style={{ marginTop: 12 }} />
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
      </Screen>
    );
  }

  // ── Ended states ──
  if (['declined', 'expired'].includes(p.status) || (p.status === 'cancelled' && p.backed_out_by_me)) {
    const titles = { declined: 'This proposal was declined', expired: 'This proposal expired', cancelled: 'You cancelled this shift' };
    const apartR = Math.min(85, Math.floor((width - 2 * touch.pageMargin) / 4.17));
    return (
      <Screen
        key="ended"
        title="Your shift"
        onBack={onBack}
        footer={<PrimaryButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} />}
      >
        <DiscPairApart r={apartR} colourA={colors.you} colourB={colors[partnerKey]} youIcon initial={partnerName} style={{ marginTop: 8 }} />
        <Headline style={{ marginTop: 24, fontSize: 40, lineHeight: 44 }}>{titles[p.status]}</Headline>
        <Text style={[type.body, { color: colors.ink, marginTop: 10 }]}>
          {p.status === 'cancelled'
            ? `${partnerName} has been told and offered a new partner or their Deeds back.`
            : 'Any Deeds you had on hold for it are back in your balance.'}
        </Text>
      </Screen>
    );
  }

  // ── Confirmed / waiting on partner / completed ──
  const started = Date.parse(p.shift.starts_at) <= nowMs;
  const checkedIn = p.my_booking.status === 'attended';
  const inGrace = p.my_booking.grace_ends_at && Date.parse(p.my_booking.grace_ends_at) > nowMs;
  const rateInFooter = p.status === 'completed' && !p.chat_open;
  const rate = () => navigate('rating', { bookingId: p.my_booking.id });

  return (
    <Screen
      key="detail"
      title="Your shift"
      onBack={onBack}
      footer={p.chat_open
        ? <PrimaryButton label={`Chat with ${partnerName}`} onPress={() => navigate('chat', { pairingId })} error={error} />
        : rateInFooter ? <PrimaryButton label="Rate the shift" onPress={rate} error={error} /> : null}
    >
      <Tag
        label={p.status === 'completed' ? 'Shift complete' : p.status === 'proposed' ? "You're confirmed" : "You're paired"}
        tone="accent"
        style={{ marginBottom: 12 }}
      />
      <Headline>{factLines(p.shift.when_label)}</Headline>
      {p.status === 'proposed' ? (
        <InfoCard title={`Waiting for ${partnerName} to confirm`} body={`They have until ${new Date(p.proposal_expires_at).toLocaleString()}. If they don't, your Deeds come straight back and we keep looking.`} />
      ) : null}
      {p.status === 'confirmed' && started ? (
        <InfoCard
          tone={checkedIn ? 'ok' : undefined}
          title={checkedIn ? "You're checked in" : "It's shift time"}
          body={checkedIn ? 'Your Deeds are back in your balance. Conversation starters will pop into your chat.' : 'Find the staff when you arrive and they will check you in.'}
        />
      ) : null}
      {p.status === 'completed' && !rateInFooter ? (
        <Button label="Rate the shift" ghost onPress={rate} style={{ marginTop: 16 }} />
      ) : null}

      <ShiftCard shift={p.shift} />
      <PartnerCard sessionToken={sessionToken} pairingId={pairingId} partner={p.partner} />
      {p.my_booking.hold ? (
        <Text style={app.finetext}>
          {p.my_booking.hold.amount} Deeds {p.my_booking.hold.status === 'held' ? 'held for this shift' : p.my_booking.hold.status}.
          {inGrace ? ` Free to cancel until ${new Date(p.my_booking.grace_ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''}
        </Text>
      ) : null}

      <View style={{ marginTop: 16 }}>
        {p.status === 'confirmed' ? (
          <ListRow
            icon="send"
            label="Share my plans"
            sublabel={`Send someone you trust the time, the place and ${partnerName}'s verified first name. Works with any contact.`}
            onPress={() => run(sharePlans)}
          />
        ) : null}
        <ListRow
          icon="flag"
          label="Something feel off?"
          sublabel="Report any concern — reviewed by a real person, not a bot."
          onPress={() => navigate('safety', { pairingId, partnerName })}
        />
      </View>

      {!(p.chat_open || rateInFooter) ? <ErrorText error={error} /> : null}
      {['confirmed', 'proposed'].includes(p.status) && !started ? (
        <LinkButton label="Can't make it? Cancel your shift" danger style={{ marginTop: 16 }} onPress={() => navigate('cancel', { bookingId: p.my_booking.id })} />
      ) : null}
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={devJumps} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.field,
    borderBottomLeftRadius: radii.hero,
    borderBottomRightRadius: radii.hero,
    paddingTop: 8,
    paddingBottom: 32,
  },
  heroTag: { paddingHorizontal: touch.pageMargin },
  body: { paddingHorizontal: touch.pageMargin, paddingTop: 24 },
  lensLine: { fontFamily: font.black, letterSpacing: -0.4, textAlign: 'center', alignSelf: 'stretch' },
  numeral: { ...type.display, textAlign: 'right' },
  depositLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  depositDivider: { marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.onInkLine },
  noticeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
