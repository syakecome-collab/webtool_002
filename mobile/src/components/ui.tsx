import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      {title ? <Text style={[styles.cardTitle, { color: t.muted }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'good' | 'bad' }) {
  const t = useTheme();
  const color = tone === 'good' ? t.good : tone === 'bad' ? t.bad : t.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: t.muted }]}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        {unit ? <Text style={[styles.statUnit, { color: t.muted }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export function Field({ label, value, onChangeText, keyboardType = 'default', placeholder, suffix }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'number-pad';
  placeholder?: string;
  suffix?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      <View style={styles.fieldInputRow}>
        <TextInput
          style={[styles.input, { backgroundColor: t.bg, borderColor: t.border, color: t.text }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={t.muted}
          accessibilityLabel={label}
        />
        {suffix ? <Text style={[styles.suffix, { color: t.muted }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : 'transparent' },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? t.accentInk : t.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary' }: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'plain' | 'danger';
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : 'transparent';
  const fg = variant === 'primary' ? t.accentInk : variant === 'danger' ? t.bad : t.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'primary' ? t.accent : t.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** 依存を増やしたくないので棒グラフは View だけで描く */
export function Bars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      {data.map((d, i) => (
        <View key={`${d.label}-${i}`} style={styles.barRow}>
          <Text style={[styles.barLabel, { color: t.muted }]} numberOfLines={1}>{d.label}</Text>
          <View style={[styles.barTrack, { backgroundColor: t.barTrack }]}>
            <View style={[styles.barFill, { backgroundColor: t.accent, width: `${Math.max(2, (d.value / max) * 100)}%` }]} />
          </View>
          <Text style={[styles.barValue, { color: t.text }]}>{format(d.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '600', marginBottom: 10, letterSpacing: 0.4 },
  stat: { minWidth: 96, flexGrow: 1, flexBasis: '30%', marginBottom: 10 },
  statLabel: { fontSize: 11, marginBottom: 2 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statUnit: { fontSize: 11, marginLeft: 2 },
  field: { flexGrow: 1, flexBasis: '46%', marginBottom: 10, paddingRight: 8 },
  fieldLabel: { fontSize: 11, marginBottom: 4 },
  fieldInputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, fontSize: 16 },
  suffix: { fontSize: 12, marginLeft: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6 },
  chipText: { fontSize: 13 },
  button: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', marginTop: 6 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barLabel: { width: 62, fontSize: 12 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7 },
  barValue: { width: 74, fontSize: 12, textAlign: 'right' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});
