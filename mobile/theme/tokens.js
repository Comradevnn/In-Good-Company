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

// Size / line height / tracking per role. letterSpacing is in px (em x size).
// Colour is left to the caller.
export const type = {
  display: { fontFamily: font.black, fontSize: 56, lineHeight: 54, letterSpacing: -1.12 },
  displayS: { fontFamily: font.black, fontSize: 48, lineHeight: 52, letterSpacing: -0.96 },
  headline: { fontFamily: font.black, fontSize: 36, lineHeight: 40, letterSpacing: -0.54 },
  titleL: { fontFamily: font.black, fontSize: 28, lineHeight: 32, letterSpacing: -0.28 },
  titleM: { fontFamily: font.black, fontSize: 26, lineHeight: 30, letterSpacing: -0.26 },
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
