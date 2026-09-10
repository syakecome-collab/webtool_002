import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { Card, Stat, Field, Chips, Button, styles as ui } from '../components/ui';
import { useTheme } from '../theme';
import { SERVICES, WEATHERS } from '../types';
import type { Shift, Settings, Weather } from '../types';
import { hourlyRate, netEarnings, summarize, toISODate, workedMinutes, filterByPeriod } from '../lib/calc';
import { minutesToClock } from '../lib/csv';
import { parseClock, parseNumber, yen, hoursLabel } from '../lib/parse';

type Draft = {
  id: string | null;
  date: string;
  service: string;
  start: string;
  end: string;
  breakMinutes: string;
  deliveries: string;
  earnings: string;
  tips: string;
  expenses: string;
  distanceKm: string;
  weather: Weather;
  memo: string;
};

function emptyDraft(settings: Settings): Draft {
  return {
    id: null,
    date: toISODate(new Date()),
    service: settings.defaultService,
    start: '',
    end: '',
    breakMinutes: '0',
    deliveries: '',
    earnings: '',
    tips: '0',
    expenses: '0',
    distanceKm: '',
    weather: 'sunny',
    memo: '',
  };
}

function toDraft(shift: Shift): Draft {
  return {
    id: shift.id,
    date: shift.date,
    service: shift.service,
    start: minutesToClock(shift.startMinutes),
    end: minutesToClock(shift.endMinutes),
    breakMinutes: String(shift.breakMinutes),
    deliveries: String(shift.deliveries),
    earnings: String(shift.earnings),
    tips: String(shift.tips),
    expenses: String(shift.expenses),
    distanceKm: String(shift.distanceKm),
    weather: shift.weather,
    memo: shift.memo,
  };
}

export default function RecordScreen({ shifts, settings, onSave, onDelete }: {
  shifts: Shift[];
  settings: Settings;
  onSave: (shift: Shift) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(settings));
  const [open, setOpen] = useState(false);

  const today = useMemo(() => summarize(filterByPeriod(shifts, 'day')), [shifts]);
  const recent = useMemo(
    () => [...shifts].sort((a, b) => (a.date === b.date ? b.startMinutes - a.startMinutes : b.date.localeCompare(a.date))).slice(0, 30),
    [shifts],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function submit() {
    const startMinutes = parseClock(draft.start);
    const endMinutes = parseClock(draft.end);
    if (startMinutes === null || endMinutes === null) {
      Alert.alert('時刻を確認してください', '開始と終了を「9:00」や「0900」の形で入力してください。');
      return;
    }
    const distanceKm = parseNumber(draft.distanceKm);
    const typedExpenses = parseNumber(draft.expenses);
    // 経費が未入力でも、設定の燃費目安があれば距離から概算する
    const expenses = typedExpenses > 0 || settings.fuelCostPerKm <= 0
      ? typedExpenses
      : Math.round(distanceKm * settings.fuelCostPerKm);

    onSave({
      id: draft.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: draft.date,
      service: draft.service,
      startMinutes,
      endMinutes,
      breakMinutes: parseNumber(draft.breakMinutes),
      deliveries: parseNumber(draft.deliveries),
      earnings: parseNumber(draft.earnings),
      tips: parseNumber(draft.tips),
      expenses,
      distanceKm,
      weather: draft.weather,
      memo: draft.memo.trim(),
    });
    setDraft(emptyDraft(settings));
    setOpen(false);
  }

  function edit(shift: Shift) {
    setDraft(toDraft(shift));
    setOpen(true);
  }

  function confirmDelete(shift: Shift) {
    Alert.alert('この記録を削除しますか？', `${shift.date} ${shift.service}`, [
      { text: 'やめる', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => onDelete(shift.id) },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={local.scroll} keyboardShouldPersistTaps="handled">
      <Card title="今日">
        <View style={ui.row}>
          <Stat label="手取り" value={yen(today.net)} tone={today.net > 0 ? 'good' : undefined} />
          <Stat label="実質時給" value={yen(today.hourlyRate)} />
          <Stat label="件数" value={String(today.deliveries)} unit="件" />
          <Stat label="実働" value={hoursLabel(today.minutes)} />
          <Stat label="1件単価" value={yen(today.perDelivery)} />
          <Stat label="件/時" value={String(today.deliveriesPerHour)} />
        </View>
      </Card>

      {open ? (
        <Card title={draft.id ? '記録を編集' : '記録を追加'}>
          <Text style={[local.sectionLabel, { color: t.muted }]}>サービス</Text>
          <Chips options={SERVICES.map((s) => ({ key: s, label: s }))} value={draft.service} onChange={(v) => set('service', v)} />

          <Text style={[local.sectionLabel, { color: t.muted }]}>天気</Text>
          <Chips
            options={WEATHERS.map((w) => ({ key: w.key, label: `${w.icon} ${w.label}` }))}
            value={draft.weather}
            onChange={(v) => set('weather', v)}
          />

          <View style={ui.row}>
            <Field label="日付" value={draft.date} onChangeText={(v) => set('date', v)} placeholder="2026-09-10" />
            <Field label="休憩" value={draft.breakMinutes} onChangeText={(v) => set('breakMinutes', v)} keyboardType="number-pad" suffix="分" />
            <Field label="開始" value={draft.start} onChangeText={(v) => set('start', v)} placeholder="11:00" />
            <Field label="終了" value={draft.end} onChangeText={(v) => set('end', v)} placeholder="20:00" />
            <Field label="件数" value={draft.deliveries} onChangeText={(v) => set('deliveries', v)} keyboardType="number-pad" suffix="件" />
            <Field label="報酬" value={draft.earnings} onChangeText={(v) => set('earnings', v)} keyboardType="number-pad" suffix="円" />
            <Field label="チップ" value={draft.tips} onChangeText={(v) => set('tips', v)} keyboardType="number-pad" suffix="円" />
            <Field label="経費" value={draft.expenses} onChangeText={(v) => set('expenses', v)} keyboardType="number-pad" suffix="円" />
            <Field label="走行距離" value={draft.distanceKm} onChangeText={(v) => set('distanceKm', v)} keyboardType="decimal-pad" suffix="km" />
            <Field label="メモ" value={draft.memo} onChangeText={(v) => set('memo', v)} placeholder="鳴らない時間帯など" />
          </View>

          {settings.fuelCostPerKm > 0 && parseNumber(draft.expenses) === 0 && parseNumber(draft.distanceKm) > 0 ? (
            <Text style={[local.hint, { color: t.muted }]}>
              経費が未入力なので、距離 × {settings.fuelCostPerKm}円/km ＝ {yen(parseNumber(draft.distanceKm) * settings.fuelCostPerKm)} として保存します。
            </Text>
          ) : null}

          <Button label={draft.id ? '更新する' : '保存する'} onPress={submit} />
          <Button label="やめる" variant="plain" onPress={() => { setDraft(emptyDraft(settings)); setOpen(false); }} />
        </Card>
      ) : (
        <Button label="＋ 稼働を記録する" onPress={() => setOpen(true)} />
      )}

      <Text style={[local.listHeading, { color: t.muted }]}>記録（新しい順）</Text>
      {recent.length === 0 ? (
        <Card>
          <Text style={{ color: t.muted }}>まだ記録がありません。稼働が終わったら、件数と報酬を入れてください。</Text>
        </Card>
      ) : (
        recent.map((s) => (
          <Pressable key={s.id} onPress={() => edit(s)} onLongPress={() => confirmDelete(s)} accessibilityRole="button">
            <View style={[local.item, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={local.itemHead}>
                <Text style={[local.itemDate, { color: t.text }]}>{s.date}</Text>
                <Text style={[local.itemService, { color: t.muted }]}>{s.service}</Text>
                <Text style={[local.itemNet, { color: t.good }]}>{yen(netEarnings(s))}</Text>
              </View>
              <Text style={[local.itemSub, { color: t.muted }]}>
                {minutesToClock(s.startMinutes)}〜{minutesToClock(s.endMinutes)}・{hoursLabel(workedMinutes(s))}・{s.deliveries}件・時給{yen(hourlyRate(s))}
              </Text>
            </View>
          </Pressable>
        ))
      )}
      <Text style={[local.hint, { color: t.muted }]}>記録をタップすると編集、長押しで削除できます。</Text>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  scroll: { padding: 14, paddingBottom: 28 },
  sectionLabel: { fontSize: 11, marginBottom: 6 },
  listHeading: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  item: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'baseline' },
  itemDate: { fontSize: 15, fontWeight: '700' },
  itemService: { fontSize: 12, marginLeft: 8, flex: 1 },
  itemNet: { fontSize: 15, fontWeight: '700' },
  itemSub: { fontSize: 12, marginTop: 4 },
  hint: { fontSize: 11, marginTop: 8 },
});
