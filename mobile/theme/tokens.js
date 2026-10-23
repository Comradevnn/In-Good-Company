import { Platform } from 'react-native';
import { colors } from './colors';

// Design tokens for direction B ("Overprint"): design-candidates/B/direction.md.
// Colours never live here; they come from the role tokens in colors.js.

export const font = {
  black: 'Gabarito_900Black',
  extraBold: 'Gabarito_800ExtraBold',
  bold: 'Gabarito_700Bold',
  textMedium: 'Figtree_500Medium',
  textSemiBold: 'Figtree_600SemiBold',
  textBold: 'Figtree_700Bold',
};

// Gabarito's natural line height is about 1.2em, so the tight heading line heights below it (Display
// 56/54, Display S 48/52, Headline 36/40, Title L 28/32, Title M 26/30) let Android clip the top of
// the glyphs on the first line. Android only: a top padding of 0.12em gives the ascenders room.
// Padding rather than a taller lineHeight keeps the line spacing between wrapped lines the same on
// both platforms, and iOS (which draws the glyphs outside the line box) is untouched.
const androidHeadroom = (size) => Platform.select({ android: { paddingTop: Math.round(size * 0.12) }, default: null });

// Size / line height / tracking per role. letterSpacing is in px (em x size).
// Colour is left to the caller.
export const type = {
  display: { fontFamily: font.black, fontSize: 56, lineHeight: 54, letterSpacing: -1.12, ...androidHeadroom(56) },
  displayS: { fontFamily: font.black, fontSize: 48, lineHeight: 52, letterSpacing: -0.96, ...androidHeadroom(48) },
  headline: { fontFamily: font.black, fontSize: 36, lineHeight: 40, letterSpacing: -0.54, ...androidHeadroom(36) },
  titleL: { fontFamily: font.black, fontSize: 28, lineHeight: 32, letterSpacing: -0.28, ...androidHeadroom(28) },
  titleM: { fontFamily: font.black, fontSize: 26, lineHeight: 30, letterSpacing: -0.26, ...androidHeadroom(26) },
  titleS: { fontFamily: font.black, fontSize: 22, lineHeight: 28 },
  subtitleL: { fontFamily: font.extraBold, fontSize: 20, lineHeight: 26 },
  subtitle: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  button: { fontFamily: font.extraBold, fontSize: 18, lineHeight: 24, letterSpacing: 0.09 },
  fieldValue: { fontFamily: font.textSemiBold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: font.textMedium, fontSize: 16, lineHeight: 24 },
  bodyS: { fontFamily: font.textMedium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: font.textBold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: font.textBold, fontSize: 13, lineHeight: 18 },
};

// Display, Display S and Headline stop growing here so big heads do not collapse the layout.
export const DISPLAY_FONT_SCALE = 1.3;

// Spread onto a Text that uses the display, displayS or headline style: <Text {...HEAD_TEXT} style={type.headline}>.
// (The Display, DisplayS and Headline components already do this.)
export const HEAD_TEXT = { maxFontSizeMultiplier: DISPLAY_FONT_SCALE };

// Width the top bars leave free on the right for the Deeds badge that App.js floats there on volunteer
// screens (a 48 tall pill, 12 from the edge). OnboardingTopBar and TopBar reserve it.
export const DEEDS_BADGE_RESERVE = 104;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radii = { field: 20, notice: 24, card: 28, hero: 32, pill: 999 };

// Minimum sizes, in dp/pt.
export const touch = {
  min: 44,
  back: 48,
  chip: 48,
  link: 48,
  field: 56,
  button: 56,
  switchRow: 56,
  navRow: 64,
  topBar: 56,
  tag: 32,
  pageMargin: 24,
};

// The one shadow in the app: the footer bar. Android's elevation casts downward, so a 1px top edge
// keeps the bar's upper boundary visible there.
export const footerShadow = Platform.select({
  ios: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  default: {
    elevation: 8,
    shadowColor: colors.shadow,
    borderTopWidth: 1,
    borderTopColor: colors.tint,
  },
});
