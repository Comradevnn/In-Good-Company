import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app, RATING_SCALE } from '../theme/appStyles';
import { type } from '../theme/tokens';
import OnboardingTopBar from './OnboardingTopBar';
import Icon from './Icon';
import { DiscPair, PersonDisc } from './Discs';
import { Button, ErrorLine, KeyboardScroll, SectionHeader, Tag } from './Controls';

// Small building blocks shared by the post-onboarding screens, so each
// screen file stays about its own flow. The new shared pieces (Icon, discs, controls) live in
// their own files and are re-exported here so screens import from one place.
export * from './Icon';
export { default as Icon } from './Icon';
export * from './Discs';
export * from './Controls';

// Standard screen frame: white ground, top bar (title + back) below the status bar, scroll body,
// and an optional footer (usually a PrimaryButton). Without a top bar the frame applies the top
// inset itself; `hero` (a HeroField) replaces the bar and pads for the inset on its own. Keyboard
// handling lives in KeyboardScroll.
export function Screen({ title, onBack, children, footer, refreshing, onRefresh, scrollRef, hero }) {
  const insets = useSafeAreaInsets();
  const hasBar = Boolean(title || onBack);
  const header = hero ?? (hasBar ? <OnboardingTopBar title={title ?? ''} onBack={onBack} /> : null);
  return (
    <View style={[s.container, !header && { paddingTop: insets.top }]}>
      <KeyboardScroll header={header} footer={footer} scrollRef={scrollRef} refreshing={refreshing} onRefresh={onRefresh}>
        {children}
      </KeyboardScroll>
    </View>
  );
}

// Static loading state: two discs at 50% overlap with the lens, an optional label, a small spinner.
export function Loading({ label }) {
  return (
    <View
      style={{ paddingTop: 48, alignItems: 'center' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <DiscPair r={40} d={40} colourA={colors.you} colourB={colors.person1} lens={colors.lens1} />
      {label ? <Text style={[type.titleL, { color: colors.ink, textAlign: 'center', marginTop: 24 }]}>{label}</Text> : null}
      <ActivityIndicator color={colors.ink} style={{ marginTop: 16 }} />
    </View>
  );
}

// A person disc: userId and meId pick the person's fixed colour, and none gives person1.
export function Avatar({ name, size = 56, userId, meId }) {
  return (
    <PersonDisc
      size={size}
      userId={userId}
      meId={meId}
      personKey={userId == null ? 'person1' : undefined}
      initial={(name ?? '?').slice(0, 1)}
    />
  );
}

export function SectionTitle({ title, link, onLink }) {
  return <SectionHeader title={title} link={link} onLink={onLink} />;
}

export function TagPill({ label }) {
  return <Tag label={label} tone="outline" />;
}

export function PillButton({ label, onPress, disabled, ghost, style }) {
  return <Button label={label} onPress={onPress} disabled={disabled} ghost={ghost} style={style} />;
}

const SHIFT_ROW_ICONS = { Cause: 'heart', When: 'calendar', Where: 'map-pin', Task: 'flag' };

// B shift card: tint card, ink "The shift" tag with the accent Daytime tag, org name, one fact per row.
export function ShiftCard({ shift, eyebrow = 'The shift' }) {
  if (!shift) return null;
  const rows = [
    ['Cause', (shift.cause_tags ?? []).join(', ')],
    ['When', shift.when_label],
    ['Where', shift.location_label],
    ['Task', shift.title],
  ].filter(([, value]) => value);
  return (
    <View style={app.shiftCard}>
      <View style={app.shiftTags}>
        <Tag label={eyebrow} tone="ink" />
        {shift.daytime ? <Tag label="Daytime" tone="accent" icon="sun" /> : null}
      </View>
      <Text style={app.shiftTitle}>{shift.org_name ?? shift.org?.name}</Text>
      {rows.map(([label, value], i) => (
        <View key={label} style={[app.shiftRow, i === 0 && app.shiftRowFirst]}>
          <View style={app.shiftRowIcon}>
            <Icon name={SHIFT_ROW_ICONS[label]} size={24} color={colors.ink} />
          </View>
          <View style={app.shiftRowText}>
            <Text style={app.shiftRowLabel}>{label}</Text>
            <Text style={app.shiftRowValue}>{value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// B Home status card: field fill (tint when waiting), tag on top, Title M, Body, and a 48 ink circle
// with a chevron when it can be tapped. `pair` (optional, off by default) draws the small cropped
// disc pair in the corner: { meId, partnerId, icon = 'clock' }.
export function StatusCard({ eyebrow, title, body, onPress, waiting, pair }) {
  const pairR = 40;
  return (
    <Pressable
      style={({ pressed }) => [
        app.statusCard,
        waiting && app.statusCardWaiting,
        pressed && onPress && { backgroundColor: waiting ? colors.tintPressed : colors.fieldPressed },
      ]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[eyebrow, title, body].filter(Boolean).join('. ')}
    >
      {pair ? (
        <DiscPair
          r={pairR}
          d={44}
          meId={pair.meId}
          partnerId={pair.partnerId}
          ring
          style={{ position: 'absolute', top: -20, right: -40 }}
        >
          <Icon name={pair.icon ?? 'clock'} size={24} color={colors.onLens} />
        </DiscPair>
      ) : null}
      <Text style={[app.statusEyebrow, waiting && app.statusEyebrowWaiting]}>{eyebrow}</Text>
      <View style={app.statusRow}>
        <View style={{ flex: 1 }}>
          <Text style={app.statusTitle}>{title}</Text>
          {body ? <Text style={[app.statusBody, waiting && app.statusBodyWaiting]}>{body}</Text> : null}
        </View>
        {onPress ? (
          <View style={app.statusArrow}>
            <Icon name="chevron-right" size={24} color={colors.onInk} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const INFO_ICON = {
  ok: { name: 'check', fill: colors.success, color: colors.onSuccess },
  warn: { name: 'alert', fill: colors.accent, color: colors.ink },
  default: { name: 'info', fill: colors.accent, color: colors.ink },
};

// Notice card: radius 24; tone default = tint, 'ok' = success tint, 'warn' = field tint.
export function InfoCard({ title, body, tone, children }) {
  const icon = INFO_ICON[tone] ?? INFO_ICON.default;
  const hasText = Boolean(title || body);
  return (
    <View style={[app.safetyCard, tone === 'ok' && app.safetyCardOk, tone === 'warn' && app.safetyCardWarn]}>
      {hasText ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: icon.fill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon.name} size={20} color={icon.color} />
          </View>
          <View style={{ flex: 1 }}>
            {title ? <Text style={[app.safetyTitle, tone === 'ok' && app.safetyTitleOk, tone === 'warn' && app.safetyTitleWarn]}>{title}</Text> : null}
            {body ? <Text style={[app.safetyBody, tone === 'ok' && app.safetyBodyOk, tone === 'warn' && app.safetyBodyWarn]}>{body}</Text> : null}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

// One tint card, columns of Display numerals over a Label. Numerals shrink to fit their column.
export function StatRow({ stats }) {
  return (
    <View style={app.statRow}>
      {stats.map(([num, label]) => (
        <View key={label} style={app.statBox} accessible accessibilityLabel={`${label}: ${num ?? 'none'}`}>
          <Text style={app.statNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} maxFontSizeMultiplier={1.3}>
            {num ?? '—'}
          </Text>
          <Text style={app.statLbl}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// 1 to 5 rating: five 56 circle choice buttons showing the number (no emoji), "Bad" and "Good" under the ends.
export function RatingIcons({ value, onChange }) {
  return (
    <View>
      <View style={app.iconRateRow} accessibilityRole="radiogroup">
        {RATING_SCALE.map((r) => {
          const selected = value === r.value;
          return (
            <Pressable
              key={r.value}
              style={({ pressed }) => [
                app.iconRateBtn,
                selected && app.iconRateBtnSelected,
                pressed && { backgroundColor: selected ? colors.fieldPressed : colors.surfacePressed },
              ]}
              onPress={() => onChange(r.value)}
              accessibilityRole="radio"
              accessibilityLabel={r.label}
              accessibilityState={{ checked: selected }}
            >
              <Text style={app.iconRateText} maxFontSizeMultiplier={1.3}>{r.value}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={app.iconRateLabels}>
        <Text style={app.iconRateLabel}>Bad</Text>
        <Text style={app.iconRateLabel}>Good</Text>
      </View>
    </View>
  );
}

export function ErrorText({ error }) {
  if (!error) return null;
  return <ErrorLine message={typeof error === 'string' ? error : error.message} style={{ marginTop: 12 }} />;
}

export { colors };
