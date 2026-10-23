import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { DEEDS_BADGE_RESERVE, HEAD_TEXT, font, footerShadow, radii, touch, type } from '../theme/tokens';
import Icon from './Icon';
import { DiscPairApart } from './Discs';

// Shared controls for direction B ("Overprint"): design-candidates/B/direction.md sections 4 to 7.
// Pressed states are one shade darker (derived tokens); there is no scale or motion.

// ---------------------------------------------------------------------------------------------
// Text

const HEADING_LEVELS = new Set(['display', 'displayS', 'headline']);

// level is a key of the type scale. Display, Display S and Headline stop growing at 1.3x.
export function Heading({ level = 'headline', style, children, ...rest }) {
  const capped = HEADING_LEVELS.has(level) ? HEAD_TEXT : null;
  return (
    <Text {...capped} {...rest} style={[type[level], { color: colors.ink }, style]}>
      {children}
    </Text>
  );
}
export const Display = (props) => <Heading level="display" {...props} />;
export const DisplayS = (props) => <Heading level="displayS" {...props} />;
export const Headline = (props) => <Heading level="headline" {...props} />;

// alert icon + one sentence in danger, for under a field row.
export function ErrorLine({ message, style }) {
  if (!message) return null;
  return (
    <View style={[styles.errorLine, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="alert" size={20} color={colors.danger} />
      <Text style={styles.errorLineText}>{message}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Frame: keyboard handling, footer, top bar, hero field

// Android is edge-to-edge (the window no longer shrinks for the keyboard), so the frame pads itself
// with KeyboardAvoidingView and the footer rides above the keyboard; on iOS the scroll body insets
// itself. header sits above the scroll body, footer below it.
export function KeyboardScroll({
  children, header, footer, scrollRef, refreshing, onRefresh, style, scrollStyle, contentContainerStyle,
}) {
  return (
    <KeyboardAvoidingView style={[styles.flex, style]} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={[s.scroll, scrollStyle]}
        contentContainerStyle={contentContainerStyle ?? s.scrollContent}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={colors.ink}
              colors={[colors.ink]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

// The white bar at the bottom of a screen: the one shadow in the app, padded by the bottom inset
// (or just above the keyboard while it is open).
export function Footer({ children, style }) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const bottom = keyboard ? 16 : Math.max(insets.bottom, 16);
  return <View style={[styles.footer, footerShadow, { paddingBottom: bottom }, style]}>{children}</View>;
}

export function BackButton({ onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [
        styles.back,
        !onPress && { borderColor: colors.offBg },
        pressed && { backgroundColor: colors.surfacePressed },
        style,
      ]}
    >
      <Icon name="arrow-left" size={24} color={onPress ? colors.ink : colors.offFg} />
    </Pressable>
  );
}

// 56 tall bar: 48 back circle with the title beside it, left aligned. Transparent over paper or a
// field; onField gives it the field's own fill (for a bar pinned over scrolled content).
// It does not apply the top inset: HeroField and OnboardingTopBar do. The last DEEDS_BADGE_RESERVE of
// the bar stays empty (after `right`) for the Deeds badge App.js floats there on volunteer screens.
export function TopBar({ title, onBack, onField = false, right, style }) {
  return (
    <View style={[styles.topBar, onField && { backgroundColor: colors.field }, style]}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      {title ? (
        <Text style={styles.topTitle} numberOfLines={1} maxFontSizeMultiplier={1.3} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View style={styles.flex} />
      )}
      {right}
      <View style={{ width: DEEDS_BADGE_RESERVE }} />
    </View>
  );
}

// A full-bleed field region that runs under the status bar and rounds its bottom edge. It pads for the
// status bar itself, so an OnboardingTopBar placed inside it takes insetTop={false}.
export function HeroField({ children, style }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.hero, { paddingTop: insets.top }, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------------------------
// Buttons and links

// 56 pill. Primary is ink; ghost is the secondary button (surface fill, 2px ink border).
export function Button({ label, onPress, disabled, loading, ghost, style, accessibilityLabel }) {
  const textColor = disabled ? colors.offFg : ghost ? colors.ink : colors.onInk;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        ghost
          ? [styles.buttonGhost, disabled && { borderColor: colors.offBg }, pressed && !disabled && { backgroundColor: colors.surfacePressed }]
          : [{ backgroundColor: disabled ? colors.offBg : pressed ? colors.inkPressed : colors.ink }],
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={disabled ? colors.offFg : ghost ? colors.ink : colors.onInk} />
      ) : (
        <Text style={[type.button, { color: textColor }]} maxFontSizeMultiplier={1.3}>{label}</Text>
      )}
    </Pressable>
  );
}

// Quiet link: 48 tall, Figtree 700 16, underlined.
export function LinkButton({ label, onPress, danger, align = 'center', style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, { justifyContent: align === 'right' ? 'flex-end' : 'center' }, pressed && { opacity: 0.7 }, style]}
    >
      <Text style={[styles.linkText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Tags, chips, toggle

const TAG_TONES = {
  surface: { backgroundColor: colors.surface, color: colors.ink },
  outline: { backgroundColor: colors.surface, color: colors.ink, borderWidth: 2, borderColor: colors.ink },
  accent: { backgroundColor: colors.accent, color: colors.ink },
  ink: { backgroundColor: colors.ink, color: colors.onInk },
};

// 32 pill, not a control. tone: 'surface' | 'outline' | 'accent' | 'ink'.
export function Tag({ label, tone = 'surface', icon, style }) {
  const { color, ...box } = TAG_TONES[tone] ?? TAG_TONES.surface;
  return (
    <View style={[styles.tag, box, tone === 'outline' && { paddingHorizontal: 12 }, style]}>
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Text style={[type.label, { color }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

// Single-select chip: 48 pill. Selected = selected fill, 2px ink border and a check.
export function Chip({ label, selected = false, onPress, disabled, style }) {
  const fg = disabled ? colors.offFg : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && { borderColor: colors.offBg, backgroundColor: colors.surface },
        pressed && !disabled && { backgroundColor: selected ? colors.fieldPressed : colors.surfacePressed },
        style,
      ]}
    >
      {selected ? <Icon name="check" size={18} color={fg} /> : null}
      <Text style={[type.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

// 56 x 32 track with a 2px ink border, drawn by hand (not the platform Switch) so both platforms look
// the same. The whole row, at least 56 tall, is the target.
export function Toggle({ value, onValueChange, label, description, disabled, style }) {
  const on = Boolean(value);
  return (
    <Pressable
      onPress={() => onValueChange?.(!on)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={[label, description].filter(Boolean).join('. ') || undefined}
      accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
      style={[styles.toggleRow, style]}
    >
      <View style={styles.flex}>
        {label ? <Text style={[styles.toggleLabel, disabled && { color: colors.offFg }]}>{label}</Text> : null}
        {description ? <Text style={styles.toggleDescription}>{description}</Text> : null}
      </View>
      <View
        style={[
          s.switchTrack,
          on && s.switchTrackOn,
          disabled && { backgroundColor: colors.offBg, borderColor: colors.offBg },
        ]}
      >
        <View style={[s.switchThumb, on && s.switchThumbOn, disabled && { backgroundColor: colors.offFg }]} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Rows, headers, cards

// Nav row: 64 tall, radius 24, tint fill, 40 surface icon circle, 24 chevron. Rows sit 8 apart.
export function ListRow({ label, sublabel, icon, onPress, trailing, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.tintPressed }, style]}
    >
      {icon ? (
        <View style={styles.iconWell}>
          <Icon name={icon} size={24} color={colors.ink} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Text style={[type.subtitle, { color: colors.ink }]}>{label}</Text>
        {sublabel ? <Text style={[type.bodyS, { color: colors.ink2 }]}>{sublabel}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-right" size={24} color={colors.ink} /> : null)}
    </Pressable>
  );
}

// Title L left, link right (48 tall target). 24 above, 4 below.
export function SectionHeader({ title, link, onLink, style }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={[type.titleL, { color: colors.ink, flexShrink: 1 }]} accessibilityRole="header">{title}</Text>
      {link ? (
        <Pressable onPress={onLink} disabled={!onLink} accessibilityRole="link" accessibilityLabel={link} style={styles.sectionLink}>
          <Text style={styles.linkText}>{link}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const CARD_FILL = {
  tint: colors.tint,
  person: colors.person1Tint,
  field: colors.fieldTint,
  accent: colors.accentTint,
  ink: colors.ink,
};

// Radius 28, 20 padding, no border or shadow. Cards never nest.
export function Card({ tone = 'tint', children, style }) {
  return (
    <View style={[styles.card, { backgroundColor: CARD_FILL[tone] ?? colors.tint }, tone === 'ink' && { padding: 24 }, style]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Form fields

// Label above (Label, ink), the control, and an error line under it.
export function Field({ label, error, children, style }) {
  return (
    <View style={style}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      {children}
      {error ? <ErrorLine message={typeof error === 'string' ? error : error.message} style={{ marginTop: 10 }} /> : null}
    </View>
  );
}

// TextInput with the B chrome. Every TextInput prop passes through. Focused = 2px ink border plus a
// 4px selected ring (a wrapping View, since RN has no spread shadows). Error = danger border, danger
// tint, alert icon and the message under it.
export function Input({ label, error, style, multiline, onFocus, onBlur, editable = true, wrapperStyle, ...rest }) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const borderColor = !editable ? colors.offBg : hasError ? colors.danger : focused ? colors.ink : colors.edge;
  return (
    <Field label={label} error={error} style={wrapperStyle}>
      <View style={[styles.ring, focused && !hasError && { backgroundColor: colors.selected }]}>
        <View>
          <TextInput
            accessibilityLabel={rest.accessibilityLabel ?? label}
            placeholderTextColor={colors.ink3}
            cursorColor={colors.ink}
            selectionHandleColor={colors.ink}
            selectionColor={Platform.OS === 'ios' ? colors.ink : colors.selected}
            {...rest}
            multiline={multiline}
            editable={editable}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[
              s.input,
              multiline && s.textarea,
              { borderColor, backgroundColor: hasError ? colors.dangerTint : colors.surface },
              hasError && { paddingRight: 48 },
              !editable && { color: colors.offFg },
              style,
            ]}
          />
          {hasError ? (
            <View style={styles.errorIcon} pointerEvents="none">
              <Icon name="alert" size={24} color={colors.danger} />
            </View>
          ) : null}
        </View>
      </View>
    </Field>
  );
}

// ---------------------------------------------------------------------------------------------
// Empty and error states

// The expired-state illustration (two discs apart, dashed ring) with a Headline and Body. No bare "No data".
export function EmptyState({ title, body, children, style }) {
  const { width } = useWindowDimensions();
  const r = Math.min(85, Math.floor((width - 2 * touch.pageMargin) / 4.17));
  return (
    <View style={[styles.empty, style]}>
      <DiscPairApart r={r} />
      {title ? <Headline style={{ marginTop: 24 }}>{title}</Headline> : null}
      {body ? <Text style={[type.body, { color: colors.ink2, marginTop: 8 }]}>{body}</Text> : null}
      {children}
    </View>
  );
}

// Screens pass their own words; there is no default copy here.
export function ErrorState({ title, body, onRetry, retryLabel, style }) {
  return (
    <View style={[styles.errorState, style]}>
      <Icon name="alert" size={32} color={colors.danger} />
      {title ? <Heading level="titleL" style={{ marginTop: 16 }}>{title}</Heading> : null}
      {body ? <Text style={[type.body, { color: colors.ink2, marginTop: 8 }]}>{body}</Text> : null}
      {onRetry && retryLabel ? <Button label={retryLabel} onPress={onRetry} ghost style={{ marginTop: 24 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  errorLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorLineText: { ...type.bodyS, fontFamily: font.textBold, color: colors.danger, flex: 1 },

  footer: {
    paddingTop: 16,
    paddingHorizontal: touch.pageMargin,
    backgroundColor: colors.paper,
  },
  back: {
    width: touch.back,
    height: touch.back,
    borderRadius: touch.back / 2,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    height: touch.topBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  topTitle: { ...type.subtitleL, color: colors.ink, flex: 1 },
  hero: {
    backgroundColor: colors.field,
    borderBottomLeftRadius: radii.hero,
    borderBottomRightRadius: radii.hero,
  },

  button: {
    minHeight: touch.button,
    borderRadius: radii.pill,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink },
  link: { minHeight: touch.link, flexDirection: 'row', alignItems: 'center' },
  linkText: { fontFamily: font.textBold, fontSize: 16, lineHeight: 22, color: colors.ink, textDecorationLine: 'underline' },

  tag: {
    height: touch.tag,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
  },
  chip: {
    minHeight: touch.chip,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.selected, borderColor: colors.ink },
  toggleRow: { minHeight: touch.switchRow, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  toggleLabel: { ...type.fieldValue, fontFamily: font.textBold, color: colors.ink },
  toggleDescription: { ...type.bodyS, color: colors.ink2, marginTop: 2 },

  listRow: {
    minHeight: touch.navRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.notice,
    backgroundColor: colors.tint,
    marginTop: 8,
  },
  iconWell: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: touch.link,
    marginTop: 24,
    marginBottom: 4,
  },
  sectionLink: { minHeight: touch.link, justifyContent: 'center' },
  card: { borderRadius: radii.card, padding: 20 },

  ring: { padding: 4, margin: -4, borderRadius: radii.notice },
  errorIcon: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },

  empty: { paddingTop: 24 },
  errorState: { paddingTop: 24 },
});
