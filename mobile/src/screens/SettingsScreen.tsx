import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Card, Stat, Field, Button, styles as ui } from '../components/ui';
import { useTheme } from '../theme';
import type { Shift, Settings } from '../types';
import { buildCSV, taxSummary } from '../lib/csv';
import { parseNumber, yen } from '../lib/parse';
import { summarize } from '../lib/calc';

export default function SettingsScreen({ shifts, settings, onChangeSettings, onClearAll }: {
  shifts: Shift[];
  settings: Settings;
  onChangeSettings: (next: Settings) => void;
  onClearAll: () => void;
}) {
  const t = useTheme();
  const [goal, setGoal] = useState(settings.monthlyGoal ? String(settings.monthlyGoal) : '');
  const [fuel, setFuel] = useState(settings.fuelCostPerKm ? String(settings.fuelCostPerKm) : '');

  const year = new Date().getFullYear();
  const tax = useMemo(() => taxSummary(shifts, year), [shifts, year]);
  const all = useMemo(() => summarize(shifts), [shifts]);

  function applySettings() {
    onChangeSettings({
      ...settings,
      monthlyGoal: parseNumber(goal),
      fuelCostPerKm: parseNumber(fuel),
    });
    Alert.alert('保存しました');
  }

  async function exportCSV() {
    if (shifts.length === 0) {
      Alert.alert('書き出す記録がありません');
      return;
    }
    try {
      const file = new File(Paths.cache, `haitatsu-${year}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(buildCSV(shifts));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: '記録を書き出す', UTI: 'public.comma-separated-values-text' });
      } else {
        Alert.alert('書き出しました', file.uri);
      }
    } catch (error) {
      Alert.alert('書き出しに失敗しました', error instanceof Error ? error.message : String(error));
    }
  }

  function confirmClear() {
    Alert.alert('すべての記録を削除しますか？', 'この操作は取り消せません。先に CSV を書き出しておくことをおすすめします。', [
      { text: 'やめる', style: 'cancel' },
      { text: '削除する', style: 'destructive', onPress: onClearAll },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={local.scroll} keyboardShouldPersistTaps="handled">
      <Card title="目標と経費の設定">
        <View style={ui.row}>
          <Field label="月の目標（手取り）" value={goal} onChangeText={setGoal} keyboardType="number-pad" suffix="円" placeholder="200000" />
          <Field label="ガソリン代の目安" value={fuel} onChangeText={setFuel} keyboardType="decimal-pad" suffix="円/km" placeholder="8" />
        </View>
        <Text style={[local.note, { color: t.muted }]}>
          ガソリン代を入れておくと、経費を空欄で保存したときに走行距離から自動で概算します。
        </Text>
        <Button label="設定を保存" onPress={applySettings} />
      </Card>

      <Card title={`${year}年の申告用サマリ`}>
        <View style={ui.row}>
          <Stat label="売上（報酬＋チップ）" value={yen(tax.income)} />
          <Stat label="経費" value={yen(tax.expenses)} tone={tax.expenses > 0 ? 'bad' : undefined} />
          <Stat label="差引" value={yen(tax.profit)} tone={tax.profit > 0 ? 'good' : undefined} />
          <Stat label="稼働日数" value={String(tax.shifts)} unit="回" />
        </View>
        <Text style={[local.note, { color: t.muted }]}>
          記録した金額をそのまま合計した値です。実際の申告では、支払調書や明細と突き合わせて確認してください。
        </Text>
      </Card>

      <Card title="書き出し">
        <Text style={[local.note, { color: t.muted, marginTop: 0 }]}>
          全 {all.shifts} 件の記録を CSV で書き出します。Excel・Googleスプレッドシート・会計ソフトにそのまま読み込めます。
        </Text>
        <Button label="CSV を書き出す" onPress={exportCSV} />
      </Card>

      <Card title="データの扱い">
        <Text style={[local.body, { color: t.text }]}>
          記録はこの端末の中だけに保存されます。アカウント登録も通信もありません。{'\n'}
          アプリを削除すると記録も消えるので、CSV の書き出しでバックアップしてください。
        </Text>
        <Text style={[local.note, { color: t.muted }]}>
          広告の表示にのみ、広告配信事業者との通信が発生します。
        </Text>
      </Card>

      <Card title="この端末のデータ">
        <Button label="すべての記録を削除" variant="danger" onPress={confirmClear} />
      </Card>

      <Text style={[local.version, { color: t.muted }]}>配達ノート v1.0.0 / {Platform.OS}</Text>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  scroll: { padding: 14, paddingBottom: 28 },
  note: { fontSize: 11, marginTop: 8, lineHeight: 16 },
  body: { fontSize: 13, lineHeight: 20 },
  version: { fontSize: 11, textAlign: 'center', marginTop: 8 },
});
