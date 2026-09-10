import { useColorScheme } from 'react-native';

const light = {
  bg: '#f4f5f7',
  surface: '#ffffff',
  border: '#e2e5ea',
  text: '#151a20',
  muted: '#69707a',
  accent: '#0b6bcb',
  accentInk: '#ffffff',
  good: '#1f7a4d',
  bad: '#c0392b',
  barTrack: '#e8ebf0',
};

const dark = {
  bg: '#101317',
  surface: '#191d23',
  border: '#2c323a',
  text: '#e9ecf1',
  muted: '#98a1ad',
  accent: '#4d9bff',
  accentInk: '#0b1017',
  good: '#4cc38a',
  bad: '#ef6a5a',
  barTrack: '#262c34',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
