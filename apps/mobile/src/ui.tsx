import React, { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, TextProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const C = {
  ink: '#10202b',
  muted: '#647783',
  line: '#dce6e9',
  paper: '#f7faf9',
  card: '#ffffff',
  mint: '#53d6b2',
  mintSoft: '#e1f7f0',
  gold: '#e9b84e',
  red: '#d96868',
  violet: '#8175d9',
  green: '#197a67',
};

export function Page({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, titleAccessibilityRole }: { title: string; subtitle: string; titleAccessibilityRole?: TextProps['accessibilityRole'] }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>CAREERFLOW</Text>
      <Text accessibilityRole={titleAccessibilityRole} style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ children, onPress, secondary = false, disabled = false }: { children: ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText, disabled && styles.buttonDisabledText]}>{children}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: TextProps['accessibilityRole'] }) {
  return <Text accessibilityRole={accessibilityRole} style={styles.sectionTitle}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Notice({ title = 'DEMO · LOCAL ONLY', children, titleAccessibilityRole }: { title?: string; children: ReactNode; titleAccessibilityRole?: TextProps['accessibilityRole'] }) {
  return (
    <View style={styles.notice}>
      <Text accessibilityRole={titleAccessibilityRole} style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function LabeledInput({ label, style, ...props }: TextInputProps & { label: string; style?: object }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={C.muted}
        style={[styles.input, props.multiline && styles.multiline, style]}
      />
    </View>
  );
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
      {items.map((item) => {
        const selected = value === item.value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.value)}
            style={[styles.segment, selected && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  content: { padding: 18, paddingBottom: 28, gap: 14 },
  header: { gap: 5, marginBottom: 2 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.7, color: C.muted },
  title: { fontSize: 27, fontWeight: '900', color: C.ink, lineHeight: 33 },
  subtitle: { fontSize: 14, lineHeight: 20, color: C.muted },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 15, gap: 11 },
  button: { backgroundColor: C.mint, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  buttonSecondary: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  buttonDisabled: { backgroundColor: '#e6ecec', borderColor: '#e6ecec' },
  buttonText: { color: C.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  buttonSecondaryText: { color: C.ink },
  buttonDisabledText: { color: C.muted },
  pressed: { opacity: 0.7 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', color: C.ink },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  notice: { backgroundColor: '#fff5df', borderColor: '#f0d79f', borderWidth: 1, borderRadius: 13, padding: 12, gap: 4 },
  noticeTitle: { color: '#785313', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  noticeText: { color: '#594f3d', fontSize: 12, lineHeight: 17 },
  field: { gap: 6 },
  fieldLabel: { color: C.ink, fontSize: 12, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fbfdfd', color: C.ink, fontSize: 14, minHeight: 44 },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  segmentRow: { gap: 7, paddingVertical: 2 },
  segment: { minHeight: 38, borderRadius: 99, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  segmentActive: { backgroundColor: C.ink, borderColor: C.ink },
  segmentText: { color: C.muted, fontSize: 11, fontWeight: '800' },
  segmentTextActive: { color: '#ffffff' },
});
