import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { Avatar, ErrorText } from '../components/AppParts';

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

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OnboardingTopBar title="Chat" onBack={onBack} />
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: 6 }]}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {pairing ? (
          <TouchableOpacity style={chatHeader} onPress={() => navigate('pairing', { pairingId })}>
            <Avatar name={name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={[app.h3, { fontSize: 15 }]}>{name}</Text>
              <Text style={[s.rationale, { marginTop: 0 }]}>{pairing.shift.when_label} · {pairing.shift.org_name}</Text>
            </View>
            <Text style={{ color: colors.inkSoft, fontSize: 16 }}>›</Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ gap: 12, paddingTop: 16 }}>
          {messages.map((m) => {
            if (m.kind === 'starter') {
              return <View key={m.id} style={app.starterChip}><Text style={app.starterChipText}>💡 {m.body}</Text></View>;
            }
            if (m.from === 'system') {
              return <View key={m.id} style={app.msgSystem}><Text style={app.msgSystemText}>{m.body}</Text></View>;
            }
            const mine = m.from === 'me';
            return (
              <View key={m.id} style={mine ? app.msgMe : app.msgThem}>
                <Text style={[app.msgText, mine && app.msgTextMe]}>{m.body}</Text>
              </View>
            );
          })}
        </View>

        {share ? (
          <TouchableOpacity style={[s.toggleRow, { marginTop: 18 }]} onPress={toggleContactShare}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Share contact details</Text>
              <Text style={[s.rationale, { marginTop: 2 }]}>
                {share.me && share.partner ? 'You both opted in — numbers and handles can be shared.'
                  : share.me ? `Waiting for ${name} to opt in too.` : 'Phone numbers, emails and socials stay hidden until you both opt in.'}
              </Text>
            </View>
            <View style={[s.switchTrack, share.me && s.switchTrackOn]}>
              <View style={[s.switchThumb, share.me && s.switchThumbOn]} />
            </View>
          </TouchableOpacity>
        ) : null}
        <ErrorText error={error} />
      </ScrollView>
      {writable ? (
        <View style={app.chatInputRow}>
          <TextInput
            style={app.chatInput}
            placeholder={`Message ${name}…`}
            placeholderTextColor={colors.inkSoft}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity style={app.sendBtn} onPress={send} accessibilityLabel="Send">
            <Text style={app.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      ) : pairing ? (
        <Text style={[s.rationale, { textAlign: 'center', padding: 18 }]}>This chat is closed because the pairing was cancelled.</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const chatHeader = { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line };
