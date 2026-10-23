import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { font, radii, touch, type } from '../theme/tokens';
import { api } from '../api/client';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { ErrorText, Footer, Icon, Input, Loading, PersonDisc, Toggle } from '../components/AppParts';

// Per-pairing chat (plotline "chat"): text only, polled. Opens with each
// side's auto-sent introduction of the other person; conversation starters
// arrive here on shift day. Phone numbers, emails and handles are blocked
// until both people switch on contact sharing.
const POLL_MS = 3000;

export default function ChatScreen({ sessionToken, pairingId, navigate, onBack }) {
  const [pairing, setPairing] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const lastId = useRef(0);
  const scrollRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const data = await api(sessionToken, `/pairings/${pairingId}/messages?after=${lastId.current}`);
      if (data.messages.length) {
        lastId.current = data.messages[data.messages.length - 1].id;
        setMessages((prev) => [...prev, ...data.messages]);
      }
    } catch (err) {
      setError(err);
    }
  }, [sessionToken, pairingId]);

  useEffect(() => {
    api(sessionToken, `/pairings/${pairingId}`).then(setPairing).catch(setError);
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [sessionToken, pairingId, poll]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    try {
      await api(sessionToken, `/pairings/${pairingId}/messages`, { method: 'POST', body: { body } });
      setDraft('');
      poll();
    } catch (err) {
      setError(err);
    }
  }

  async function toggleContactShare() {
    try {
      const share = await api(sessionToken, `/pairings/${pairingId}/contact-share`, { method: 'POST', body: { opt_in: !pairing.contact_share.me } });
      setPairing((prev) => ({ ...prev, contact_share: share }));
    } catch (err) {
      setError(err);
    }
  }

  const name = pairing?.partner.display_name ?? '';
  const share = pairing?.contact_share;
  const writable = pairing?.chat_open;
  const partnerId = pairing ? (pairing.partner.user_id ?? pairing.partner.id ?? name) : null;
  const [whenLabel, orgName] = pairing ? [pairing.shift.when_label, pairing.shift.org_name] : [];

  // The input row is the footer, so it rides above the keyboard on both platforms.
  return (
    <KeyboardAvoidingView style={s.container} behavior="padding">
      <OnboardingTopBar title="Chat" onBack={onBack} />
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {!pairing && !error ? <Loading /> : null}
        {pairing ? (
          <Pressable
            style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.tintPressed }]}
            onPress={() => navigate('pairing', { pairingId })}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${whenLabel}, ${orgName}`}
          >
            <PersonDisc size={48} userId={partnerId} initial={name} />
            <View style={{ flex: 1 }}>
              <Text style={[type.subtitle, { color: colors.ink }]}>{name}</Text>
              <Text style={[type.bodyS, { color: colors.ink2 }]}>{whenLabel}</Text>
              <Text style={[type.bodyS, { color: colors.ink2 }]}>{orgName}</Text>
            </View>
            <Icon name="chevron-right" size={24} color={colors.ink} />
          </Pressable>
        ) : null}

        <View style={{ gap: 12, paddingTop: 16 }}>
          {messages.map((m) => {
            if (m.kind === 'starter') {
              return (
                <Text key={m.id} style={styles.starter}>{m.body}</Text>
              );
            }
            if (m.from === 'system') {
              return <Text key={m.id} style={styles.system}>{m.body}</Text>;
            }
            const mine = m.from === 'me';
            return (
              <View key={m.id} style={mine ? styles.mine : styles.theirs}>
                <Text style={[type.body, { color: mine ? colors.onInk : colors.ink }]}>{m.body}</Text>
              </View>
            );
          })}
        </View>

        {share && writable ? (
          <Toggle
            style={{ marginTop: 20 }}
            label="Share contact details"
            description={share.me && share.partner ? 'You both opted in — numbers and handles can be shared.'
              : share.me ? `Waiting for ${name} to opt in too.` : 'Phone numbers, emails and socials stay hidden until you both opt in.'}
            value={share.me}
            onValueChange={toggleContactShare}
          />
        ) : null}
        <ErrorText error={error} />
      </ScrollView>
      {writable ? (
        <Footer style={styles.inputRow}>
          <Input
            wrapperStyle={{ flex: 1 }}
            accessibilityLabel={`Message ${name}`}
            placeholder={`Message ${name}…`}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            style={({ pressed }) => [styles.send, pressed && { backgroundColor: colors.inkPressed }]}
            onPress={send}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Icon name="send" size={24} color={colors.onInk} />
          </Pressable>
        </Footer>
      ) : pairing ? (
        <Footer>
          <Text style={[type.bodyS, { color: colors.ink2 }]}>
            {pairing.chat_closed_reason === 'pairing_ended' ? 'This chat is closed because the pairing was cancelled.' : 'This chat is closed.'}
          </Text>
        </Footer>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const bubble = { maxWidth: '82%', borderRadius: radii.field, paddingVertical: 12, paddingHorizontal: 16 };

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: touch.navRow,
    padding: 12,
    borderRadius: radii.notice,
    backgroundColor: colors.tint,
  },
  theirs: { ...bubble, alignSelf: 'flex-start', backgroundColor: colors.tint },
  mine: { ...bubble, alignSelf: 'flex-end', backgroundColor: colors.ink },
  system: { ...type.bodyS, color: colors.ink2, textAlign: 'center', paddingHorizontal: 8 },
  // Conversation starters are a quiet suggestion in the thread, not a control, so they are plain text.
  starter: { ...type.bodyS, fontFamily: font.textBold, color: colors.ink, textAlign: 'center', alignSelf: 'center', maxWidth: '92%' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  send: {
    width: touch.back,
    height: touch.back,
    borderRadius: touch.back / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
