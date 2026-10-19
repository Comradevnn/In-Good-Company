import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app, RATING_SCALE } from '../theme/appStyles';
import OnboardingTopBar from './OnboardingTopBar';

// Small building blocks shared by the post-onboarding screens, so each
// screen file stays about its own flow.

// Standard screen frame: plotline topbar (title + back), scroll body, and an
// optional footer (usually a PrimaryButton). A focused field lower in a form
// mustn't end up behind the keyboard: on iOS the scroll body insets itself; on
// Android (edge-to-edge, so the window no longer shrinks for the keyboard) the
// frame pads itself and the scroll view brings the focused field into view.
export function Screen({ title, onBack, children, footer, refreshing, onRefresh, scrollRef }) {
  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      {title || onBack ? <OnboardingTopBar title={title ?? ''} onBack={onBack} /> : null}
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

export function Loading({ label }) {
  return (
    <View style={{ paddingTop: 40, alignItems: 'center' }}>
      <ActivityIndicator />
      {label ? <Text style={[s.rationale, { marginTop: 12 }]}>{label}</Text> : null}
    </View>
  );
}

export function Avatar({ name, size = 56 }) {
  return (
    <View style={[app.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[app.avatarText, { fontSize: size * 0.36 }]}>{(name ?? '?').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function SectionTitle({ title, link, onLink }) {
  return (
    <View style={app.sectionTitleRow}>
      <Text style={app.sectionTitle}>{title}</Text>
      {link ? <Text style={app.sectionLink} onPress={onLink}>{link}</Text> : null}
    </View>
  );
}

export function TagPill({ label }) {
  return (
    <View style={app.tagPill}>
      <Text style={app.tagPillText}>{label}</Text>
    </View>
  );
}

export function PillButton({ label, onPress, disabled, ghost, style }) {
  return (
    <TouchableOpacity
      style={[ghost ? app.ghostBtn : app.pillBtn, disabled && { opacity: 0.5 }, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={ghost ? app.ghostBtnText : app.pillBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// plotline .shift-card: dark card, ochre eyebrow, label/value rows.
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
      <Text style={app.shiftEyebrow}>{eyebrow}{shift.daytime ? '  ·  ☀︎ Daytime' : ''}</Text>
      <Text style={app.shiftTitle}>{shift.org_name ?? shift.org?.name}</Text>
      {rows.map(([label, value], i) => (
        <View key={label} style={[app.shiftRow, i === 0 && app.shiftRowFirst]}>
          <Text style={app.shiftRowLabel}>{label}</Text>
          <Text style={app.shiftRowValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

// plotline .status-card (moss) / .status-card.waiting (ink).
export function StatusCard({ eyebrow, title, body, onPress, waiting }) {
  return (
    <TouchableOpacity style={[app.statusCard, waiting && app.statusCardWaiting]} onPress={onPress} disabled={!onPress}>
      <Text style={[app.statusEyebrow, waiting && app.statusEyebrowWaiting]}>{eyebrow}</Text>
      <View style={app.statusRow}>
        <View style={{ flex: 1 }}>
          <Text style={app.statusTitle}>{title}</Text>
          {body ? <Text style={[app.statusBody, waiting && app.statusBodyWaiting]}>{body}</Text> : null}
        </View>
        {onPress ? <Text style={app.statusArrow}>→</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function InfoCard({ title, body, tone, children }) {
  return (
    <View style={[app.safetyCard, tone === 'ok' && app.safetyCardOk, tone === 'warn' && app.safetyCardWarn]}>
      {title ? <Text style={[app.safetyTitle, tone === 'ok' && app.safetyTitleOk, tone === 'warn' && app.safetyTitleWarn]}>{title}</Text> : null}
      {body ? <Text style={[app.safetyBody, tone === 'warn' && app.safetyBodyWarn]}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function StatRow({ stats }) {
  return (
    <View style={app.statRow}>
      {stats.map(([num, label]) => (
        <View key={label} style={app.statBox}>
          <Text style={app.statNum}>{num ?? '—'}</Text>
          <Text style={app.statLbl}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// plotline 5-point icon rating (bad … good).
export function RatingIcons({ value, onChange }) {
  return (
    <View>
      <View style={app.iconRateRow}>
        {RATING_SCALE.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[app.iconRateBtn, { backgroundColor: r.color }, value === r.value && app.iconRateBtnSelected]}
            onPress={() => onChange(r.value)}
            accessibilityLabel={r.label}
          >
            <Text style={app.iconRateText}>{r.icon}</Text>
          </TouchableOpacity>
        ))}
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
  return <Text style={s.errorText}>{typeof error === 'string' ? error : error.message}</Text>;
}

export { colors };
