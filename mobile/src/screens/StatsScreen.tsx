import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Card, Stat, Chips, Bars, styles as ui } from '../components/ui';
import { useTheme } from '../theme';
import type { Shift, Settings } from '../types';
import { summarize, filterByPeriod, byWeekday, byWeather, byService, dailyNet } from '../lib/calc';
import type { Period, Breakdown } from '../lib/calc';
import { yen, hoursLabel } from '../lib/parse';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: '今日' },
  { key: 'week', label: '今週' },
  { key: 'month', label: '今月' },
  { key: 'year', label: '今年' },
  { key: 'all', label: '全期間' },
];

function Ranking({ title, rows, note }: { title: string; rows: Breakdown[]; note: string }) {
  const t = useTheme();
  if (rows.length === 0) return null;
  return (
    <Card title={title}>
      <Bars
        data={rows.map((r) => ({ label: r.label, value: r.totals.hourlyRate }))}
        format={(v) => yen(v)}
      />
      <Text style={[local.note, { color: t.muted }]}>{note}</Text>
    </Card>
  );
}

export default function StatsScreen({ shifts, settings }: { shifts: Shift[]; settings: Settings }) {
  const t = useTheme();
  const [period, setPeriod] = useState<Period>('month');

  const scoped = useMemo(() => filterByPeriod(shifts, period), [shifts, period]);
  const totals = useMemo(() => summarize(scoped), [scoped]);
  const month = useMemo(() => summarize(filterByPeriod(shifts, 'month')), [shifts]);
  const daily = useMemo(() => dailyNet(shifts, 14), [shifts]);

  const goal = settings.monthlyGoal;
  const progress = goal > 0 ? Math.min(1, month.net / goal) : 0;

  return (
    <ScrollView contentContainerStyle={local.scroll}>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />

      <Card title={`${PERIODS.find((p) => p.key === period)?.label}の成績`}>
        <View style={ui.row}>
          <Stat label="手取り" value={yen(totals.net)} tone={totals.net > 0 ? 'good' : undefined} />
          <Stat label="実質時給" value={yen(totals.hourlyRate)} />
          <Stat label="件数" value={String(totals.deliveries)} unit="件" />
          <Stat label="実働" value={hoursLabel(totals.minutes)} />
          <Stat label="1件単価" value={yen(totals.perDelivery)} />
          <Stat label="件/時" value={String(totals.deliveriesPerHour)} />
          <Stat label="報酬" value={yen(totals.earnings)} />
          <Stat label="経費" value={yen(totals.expenses)} tone={totals.expenses > 0 ? 'bad' : undefined} />
          <Stat label="走行" value={String(totals.distanceKm)} unit="km" />
        </View>
      </Card>

      {goal > 0 ? (
        <Card title="今月の目標">
          <View style={[local.track, { backgroundColor: t.barTrack }]}>
            <View style={[local.fill, { backgroundColor: t.accent, width: `${progress * 100}%` }]} />
          </View>
          <Text style={[local.goalText, { color: t.text }]}>
            {yen(month.net)} / {yen(goal)}（{Math.round(progress * 100)}%）
          </Text>
          <Text style={[local.note, { color: t.muted }]}>
            {month.net >= goal ? '目標を達成しています。' : `あと ${yen(goal - month.net)}。今の実質時給なら約 ${Math.ceil((goal - month.net) / Math.max(1, month.hourlyRate))} 時間です。`}
          </Text>
        </Card>
      ) : null}

      <Card title="直近 14 日の手取り">
        <Bars
          data={daily.map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.net }))}
          format={(v) => (v === 0 ? '—' : yen(v))}
        />
      </Card>

      <Ranking title="曜日別の実質時給" rows={byWeekday(shifts)} note="出る曜日を決めるときの目安です。記録が増えるほど精度が上がります。" />
      <Ranking title="天気別の実質時給" rows={byWeather(shifts)} note="雨の日に出る価値を自分の数字で確かめられます。" />
      <Ranking title="サービス別の実質時給" rows={byService(shifts)} note="掛け持ちしている場合、どれを主軸にするかの判断に使えます。" />

      {shifts.length === 0 ? (
        <Card>
          <Text style={{ color: t.muted }}>記録を入れると、曜日・天気・サービス別の実質時給がここに出ます。</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  scroll: { padding: 14, paddingBottom: 28 },
  track: { height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  fill: { height: '100%', borderRadius: 6 },
  goalText: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 11, marginTop: 8, lineHeight: 16 },
});
