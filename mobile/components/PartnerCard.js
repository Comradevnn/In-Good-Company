import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { app } from '../theme/appStyles';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { BACKEND_URL } from '../config/api';
import { verifySignedBadge } from '../verification/badgeVerify';
import { Avatar, Icon, TagPill } from './AppParts';

// Brief partner profile (direction B partner card: person-tint card, 64 person disc, Title L name). The verified badge is shown
// only when BOTH checks agree (D10, see backend/recryption/badgeStore.js):
// the server serves the badge only if Recryption's verify() passes, and the
// app re-verifies the Ed25519 signature on-device against the public key.
export default function PartnerCard({ sessionToken, pairingId, partner, onPress, compact }) {
  const [badge, setBadge] = useState(null); // null = checking

  useEffect(() => {
    let cancelled = false;
    setBadge(null);
    (async () => {
      try {
        const [badgeResponse, keyResponse] = await Promise.all([
          fetch(`${BACKEND_URL}/matching/partner-badge?pairing_id=${pairingId}`, { headers: { Authorization: `Bearer ${sessionToken}` } }),
          fetch(`${BACKEND_URL}/verification/public-key`),
        ]);
        const badgeData = await badgeResponse.json();
        const keyData = await keyResponse.json();
        const serverOk = badgeResponse.ok && badgeData?.verified === true && badgeData?.badge;
        const clientOk = serverOk ? verifySignedBadge(badgeData.badge, keyData?.public_key) : false;
        if (!cancelled) setBadge(Boolean(serverOk && clientOk));
      } catch {
        if (!cancelled) setBadge(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pairingId, sessionToken]);

  if (!partner) return null;
  const history = partner.history ?? {};
  const metaLines = [partner.occupation, partner.gender].filter(Boolean);

  return (
    <Pressable
      style={({ pressed }) => [app.partnerCard, pressed && onPress && { backgroundColor: colors.tintPressed }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={app.partnerTop}>
        <Avatar name={partner.display_name} size={64} userId={partner.user_id ?? partner.id ?? partner.display_name} />
        <View style={{ flex: 1 }}>
          <Text style={[type.titleL, { color: colors.ink }]}>{partner.display_name}{partner.age ? `, ${partner.age}` : ''}</Text>
          {metaLines.map((line, i) => (
            <Text key={i} style={app.partnerMeta}>{line}</Text>
          ))}
          {badge === null ? (
            <ActivityIndicator size="small" color={colors.ink} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
          ) : badge ? (
            <View style={app.badgeVerified}>
              <Icon name="shield-check" size={18} color={colors.ink} />
              <Text style={app.badgeVerifiedText}>Verified</Text>
            </View>
          ) : (
            <Text style={[app.partnerMeta, { marginTop: 8 }]}>Verification badge not confirmed</Text>
          )}
        </View>
        {onPress ? <Icon name="chevron-right" size={24} color={colors.ink} /> : null}
      </View>
      {partner.bio && !compact ? <Text style={app.blurb}>{`\u201C${partner.bio}\u201D`}</Text> : null}
      <View style={app.historyRow}>
        <TagPill label={history.shift_count ? `${history.shift_count} shift${history.shift_count === 1 ? '' : 's'}` : 'First shift with us'} />
        {(history.causes_volunteered?.length ? history.causes_volunteered : partner.causes ?? []).slice(0, 3).map((c, i) => (
          <TagPill key={i} label={c} />
        ))}
      </View>
      {!compact && history.public_org_ratings?.length ? (
        <Text style={[app.finetext, { marginTop: 12 }]}>
          Org feedback they've chosen to share: {history.public_org_ratings.map((r) => `${r.contribution} contribution (${r.cause_tags.join(', ')})`).join('; ')}
        </Text>
      ) : null}
    </Pressable>
  );
}
