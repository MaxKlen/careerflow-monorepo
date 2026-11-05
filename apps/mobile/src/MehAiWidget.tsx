import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { offlineCoach } from './coach';
import { useCareer } from './CareerContext';
import { C } from './ui';

/**
 * A deliberately local-only assistant surface for the demo.
 * Keep this component on offlineCoach: premium connected AI is not enabled here.
 */
export default function MehAiWidget() {
  const { ready, state } = useCareer();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const guidance = useMemo(() => offlineCoach(state), [state]);

  const open = () => {
    setSelectedAction(null);
    setVisible(true);
  };

  const close = () => setVisible(false);

  if (!ready) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open MEH AI offline career assistant"
        accessibilityHint="Opens preloaded career guidance that works without internet"
        onPress={open}
        style={({ pressed }) => [
          styles.floatingButton,
          { bottom: Math.max(insets.bottom + 66, 78) },
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.floatingMark}>✦</Text>
        <Text style={styles.floatingLabel}>MEH AI</Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <View style={styles.backdrop}>
          <View style={[styles.panel, { marginBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.panelHeader}>
              <View style={styles.titleGroup}>
                <Text style={styles.eyebrow}>MEH AI · OFFLINE DEMO</Text>
                <Text style={styles.title}>A small next step</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close MEH AI assistant"
                hitSlop={10}
                onPress={close}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.disclosure}>
              Preloaded guidance from your on-device career state. Premium online AI is a future paid feature and is not enabled in this demo.
            </Text>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={styles.guidanceTitle}>{guidance.title}</Text>
              <Text style={styles.body}>{guidance.body}</Text>

              <Text style={styles.actionHeading}>TRY A SAMPLE ACTION</Text>
              {guidance.actions.map((action) => {
                const selected = selectedAction === action;
                return (
                  <Pressable
                    key={action}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Use sample action: ${action}`}
                    onPress={() => setSelectedAction(action)}
                    style={({ pressed }) => [styles.action, selected && styles.actionSelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.actionText, selected && styles.actionTextSelected]}>{action}</Text>
                    <Text style={[styles.actionArrow, selected && styles.actionTextSelected]}>{selected ? '✓' : '›'}</Text>
                  </Pressable>
                );
              })}

              {selectedAction ? (
                <View accessibilityLiveRegion="polite" style={styles.selectedNote}>
                  <Text style={styles.selectedLabel}>CURRENT FOCUS</Text>
                  <Text style={styles.selectedText}>{selectedAction}</Text>
                  <Text style={styles.selectedHint}>Keep it small, then return to your task board when you have one concrete outcome.</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the full offline coach"
                onPress={() => {
                  close();
                  router.push('/coach');
                }}
                style={({ pressed }) => [styles.fullCoachButton, pressed && styles.pressed]}
              >
                <Text style={styles.fullCoachText}>Open full offline coach</Text>
              </Pressable>
              <Text style={styles.source}>Source: built-in offlineCoach · no network calls</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: C.ink,
    shadowColor: '#10202b',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  floatingMark: { color: C.mint, fontSize: 17, fontWeight: '900' },
  floatingLabel: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  pressed: { opacity: 0.72 },
  backdrop: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, backgroundColor: 'rgba(16,32,43,.48)' },
  panel: { maxHeight: '82%', borderRadius: 22, backgroundColor: C.paper, padding: 18, shadowColor: '#10202b', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleGroup: { flex: 1, gap: 4 },
  eyebrow: { color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: C.ink, fontSize: 21, lineHeight: 27, fontWeight: '900' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#e8f0ee' },
  closeText: { color: C.ink, fontSize: 25, lineHeight: 27, fontWeight: '400' },
  disclosure: { marginTop: 11, color: '#594f3d', backgroundColor: '#fff5df', borderWidth: 1, borderColor: '#f0d79f', borderRadius: 12, padding: 10, fontSize: 11, lineHeight: 16 },
  content: { gap: 10, paddingTop: 14, paddingBottom: 2 },
  guidanceTitle: { color: C.ink, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  body: { color: C.muted, fontSize: 13, lineHeight: 19 },
  actionHeading: { marginTop: 4, color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  action: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: '#ffffff' },
  actionSelected: { borderColor: C.mint, backgroundColor: C.mintSoft },
  actionText: { flex: 1, color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  actionTextSelected: { color: C.green },
  actionArrow: { color: C.muted, fontSize: 20, lineHeight: 20 },
  selectedNote: { gap: 3, padding: 10, borderRadius: 11, backgroundColor: '#edf7f4' },
  selectedLabel: { color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  selectedText: { color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '900' },
  selectedHint: { color: C.muted, fontSize: 11, lineHeight: 16 },
  fullCoachButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: C.mint, paddingHorizontal: 14 },
  fullCoachText: { color: C.ink, fontSize: 13, fontWeight: '900' },
  source: { color: C.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
});
