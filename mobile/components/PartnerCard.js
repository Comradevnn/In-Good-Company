import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { app } from '../theme/appStyles';
import { BACKEND_URL } from '../config/api';
import { verifySignedBadge } from '../verification/badgeVerify';
import { Avatar, TagPill } from './AppParts';

// Brief partner profile (plotline .partner-card). The verified badge is shown
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
  const meta = [partner.occupation, partner.gender].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity style={app.partnerCard} onPress={onPress} disabled={!onPress}>
      <View style={app.partnerTop}>
        <Avatar name={partner.display_name} />
        <View style={{ flex: 1 }}>
          <Text style={app.h3}>{partner.display_name}{partner.age ? `, ${partner.age}` : ''}</Text>
          {meta ? <Text style={app.partnerMeta}>{meta}</Text> : null}
          {badge === null ? (
            <ActivityIndicator size="small" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
          ) : badge ? (
            <View style={app.badgeVerified}><Text style={app.badgeVerifiedText}>✓ Verified</Text></View>
          ) : (
            <Text style={[app.partnerMeta, { marginTop: 4 }]}>Verification badge not confirmed</Text>
          )}
        </View>
        {onPress ? <Text style={{ color: '#5B6459', fontSize: 16 }}>›</Text> : null}
      </View>
      {partner.bio && !compact ? <Text style={app.blurb}>"{partner.bio}"</Text> : null}
      <View style={app.historyRow}>
        <TagPill label={history.shift_count ? `${history.shift_count} shift${history.shift_count === 1 ? '' : 's'}` : 'First shift with us'} />
        {(history.causes_volunteered?.length ? history.causes_volunteered : partner.causes ?? []).slice(0, 3).map((c) => (
          <TagPill key={c} label={c} />
        ))}
      </View>
      {!compact && history.public_org_ratings?.length ? (
        <Text style={[app.finetext, { marginTop: 10 }]}>
          Org feedback they've chosen to share: {history.public_org_ratings.map((r) => `${r.contribution} contribution (${r.cause_tags.join(', ')})`).join('; ')}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}
