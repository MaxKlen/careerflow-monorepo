import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCareer } from '../../CareerContext';
import { Card, Header, Page, Body, C } from '../../ui';

export default function JourneyScreen() {
  const { ready, state, progress, toggleMilestone } = useCareer();
  if (!ready) return <Page><Body>Loading journey…</Body></Page>;
  return (
    <Page>
      <Header title="Career journey" subtitle="Mark evidence as each checkpoint becomes real." />
      <Card>
        <Text style={{ color: C.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }}>{progress}% COMPLETE</Text>
        <View style={{ height: 9, backgroundColor: '#edf2f1', borderRadius: 8, overflow: 'hidden' }}>
          <View style={{ width: `${progress}%`, height: '100%', backgroundColor: C.mint }} />
        </View>
        {state.milestones.map((milestone, index) => (
          <Pressable key={milestone.id} accessibilityRole="checkbox" accessibilityState={{ checked: milestone.completed }} onPress={() => toggleMilestone(milestone.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ width: 34, height: 34, borderRadius: 18, borderWidth: 1, borderColor: milestone.completed ? C.mint : C.line, backgroundColor: milestone.completed ? C.mint : '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.ink, fontSize: 12, fontWeight: '900' }}>{milestone.completed ? '✓' : String(index + 1).padStart(2, '0')}</Text>
            </View>
            <Text style={{ flex: 1, color: milestone.completed ? C.muted : C.ink, fontSize: 14, fontWeight: '800', textDecorationLine: milestone.completed ? 'line-through' : 'none' }}>{milestone.name}</Text>
          </Pressable>
        ))}
      </Card>
    </Page>
  );
}
