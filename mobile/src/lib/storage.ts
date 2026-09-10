import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Shift, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const SHIFTS_KEY = 'haitatsu.shifts.v1';
const SETTINGS_KEY = 'haitatsu.settings.v1';

/** 壊れた保存データでアプリが起動しなくなることを避けたいので、必ず形を検証する。 */
function isShift(value: unknown): value is Shift {
  const s = value as Shift;
  return !!s && typeof s.id === 'string' && typeof s.date === 'string'
    && typeof s.startMinutes === 'number' && typeof s.endMinutes === 'number';
}

export async function loadShifts(): Promise<Shift[]> {
  try {
    const raw = await AsyncStorage.getItem(SHIFTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isShift) : [];
  } catch {
    return [];
  }
}

export async function saveShifts(shifts: Shift[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
  } catch {
    /* 保存に失敗しても画面は動かし続ける */
  }
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 同上 */
  }
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.removeItem(SHIFTS_KEY);
  await AsyncStorage.removeItem(SETTINGS_KEY);
}
