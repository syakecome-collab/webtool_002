import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './src/theme';
import type { Shift, Settings } from './src/types';
import { DEFAULT_SETTINGS } from './src/types';
import { loadShifts, saveShifts, loadSettings, saveSettings, clearAll } from './src/lib/storage';
import { AdBanner, initAds } from './src/components/Banner';
import RecordScreen from './src/screens/RecordScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

type Tab = 'record' | 'stats' | 'settings';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'record', label: '記録', icon: '📝' },
  { key: 'stats', label: '分析', icon: '📊' },
  { key: 'settings', label: '設定', icon: '⚙️' },
];

export default function App() {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('record');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initAds();
    (async () => {
      const [loadedShifts, loadedSettings] = await Promise.all([loadShifts(), loadSettings()]);
      setShifts(loadedShifts);
      setSettings(loadedSettings);
      setReady(true);
    })();
  }, []);

  const persist = useCallback((next: Shift[]) => {
    setShifts(next);
    void saveShifts(next);
  }, []);

  const handleSave = useCallback((shift: Shift) => {
    setShifts((current) => {
      const index = current.findIndex((s) => s.id === shift.id);
      const next = index >= 0
        ? current.map((s) => (s.id === shift.id ? shift : s))
        : [...current, shift];
      void saveShifts(next);
      return next;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setShifts((current) => {
      const next = current.filter((s) => s.id !== id);
      void saveShifts(next);
      return next;
    });
  }, []);

  const handleSettings = useCallback((next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  }, []);

  const handleClearAll = useCallback(() => {
    persist([]);
    setSettings(DEFAULT_SETTINGS);
    void clearAll();
  }, [persist]);

  return (
    <SafeAreaProvider>
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
      <StatusBar style="auto" />
      <View style={[styles.header, { borderColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>配達ノート</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>その日の数字を、その日のうちに</Text>
      </View>

      {!ready ? (
        <View style={styles.loading}><ActivityIndicator color={t.accent} /></View>
      ) : tab === 'record' ? (
        <RecordScreen shifts={shifts} settings={settings} onSave={handleSave} onDelete={handleDelete} />
      ) : tab === 'stats' ? (
        <StatsScreen shifts={shifts} settings={settings} />
      ) : (
        <SettingsScreen shifts={shifts} settings={settings} onChangeSettings={handleSettings} onClearAll={handleClearAll} />
      )}

      <AdBanner />

      <View style={[styles.tabs, { backgroundColor: t.surface, borderColor: t.border }]}>
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <Pressable
              key={item.key}
              style={styles.tab}
              onPress={() => setTab(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
            >
              <Text style={styles.tabIcon}>{item.icon}</Text>
              <Text style={[styles.tabLabel, { color: active ? t.accent : t.muted }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { fontSize: 18 },
  tabLabel: { fontSize: 11, marginTop: 2, fontWeight: '600' },
});
