import { Appearance } from 'react-native';

/**
 * Tokens portados desde DMS Boletas web:
 * - src/styles/tokens.css (light)
 * - src/styles/theme.css (dark)
 *
 * La app móvil no mantiene una paleta paralela. Se toma el esquema del sistema
 * al arrancar la aplicación y se conservan los mismos tokens semánticos.
 */
export const lightColors = Object.freeze({
  primary: '#af101a',
  primaryStrong: '#930010',
  primaryContainer: '#d32f2f',
  primarySoft: '#fff0ee',
  surface: '#fcf9f8',
  surfaceLow: '#f6f3f2',
  surfaceCard: '#ffffff',
  surfaceContainer: '#f0eded',
  surfaceHigh: '#eae7e7',
  text: '#1b1c1c',
  muted: '#5f5e5e',
  variant: '#5b403d',
  outline: '#8f6f6c',
  outlineSoft: '#e4beba',
  success: '#16845b',
  successSoft: '#e6f6ee',
  warning: '#c77800',
  warningSoft: '#fff3dc',
  danger: '#ba1a1a',
  dangerSoft: '#ffdad6',
});

export const darkColors = Object.freeze({
  primary: '#ff6b73',
  primaryStrong: '#ff5661',
  primaryContainer: '#8f252c',
  primarySoft: '#35191c',
  surface: '#121010',
  surfaceLow: '#191616',
  surfaceCard: '#211d1d',
  surfaceContainer: '#2a2525',
  surfaceHigh: '#342e2e',
  text: '#f6eeee',
  muted: '#cbbdbd',
  variant: '#e0c3c0',
  outline: '#9d8380',
  outlineSoft: '#4e3c3b',
  success: '#62d7a4',
  successSoft: '#15382b',
  warning: '#ffc260',
  warningSoft: '#3b2b12',
  danger: '#ff8b82',
  dangerSoft: '#411c1b',
});

export const colors = Object.freeze(
  Appearance.getColorScheme() === 'dark' ? darkColors : lightColors,
);

export const spacing = Object.freeze({
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
});

export const radius = Object.freeze({
  sm: 10,
  md: 14,
  lg: 20,
  overlay: 22,
});

export const sizing = Object.freeze({
  touchTargetMin: 44,
  controlHeight: 52,
  buttonHeight: 48,
});
