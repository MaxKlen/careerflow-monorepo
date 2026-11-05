import React from 'react';
import { router } from 'expo-router';
import { View, Text } from 'react-native';
import { useCareer } from '../../CareerContext';
import { Button, Card, Header, Page, SectionTitle, Body, C } from '../../ui';

export default function HomeScreen() {
  const { ready, state, progress } = useCareer();
  if (!ready) return <Page><Body>Loading your offline workspace…</Body></Page>;
  const openTasks = state.tasks.filter((task) => task.status !== 'completed').length;
  const activeProjects = state.projects.filter((project) => !project.completed).length;
  const completedMilestones = state.milestones.filter((milestone) => milestone.completed).length;
  const profileDone = Boolean(state.profile.targetRole.trim() && state.profile.goals.trim());

  return (
    <Page>
      <Header title="Keep the journey moving." subtitle="One calm workspace for the next career step." />
      <View style={{ backgroundColor: C.ink, borderRadius: 22, padding: 19, gap: 12 }}>
        <Text style={{ color: C.mint, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }}>CAREER JOURNEY</Text>
        <Text style={{ color: '#ffffff', fontSize: 25, lineHeight: 30, fontWeight: '900' }}>{progress}% ready to move forward</Text>
        <Text style={{ color: '#c5d7db', fontSize: 14, lineHeight: 20 }}>Your progress stays on this device and remains available offline.</Text>
        <View style={{ height: 9, backgroundColor: '#314750', borderRadius: 8, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${progress}%`, backgroundColor: C.mint, borderRadius: 8 }} />
        </View>
        <Button onPress={() => router.push('/tasks')}>Open task board</Button>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { value: activeProjects, label: 'Active projects' },
          { value: openTasks, label: 'Open tasks' },
          { value: completedMilestones, label: 'Checkpoints' },
        ].map((item) => (
          <Card key={item.label} style={{ flex: 1, padding: 11 }}>
            <Text style={{ color: C.ink, fontSize: 21, fontWeight: '900' }}>{item.value}</Text>
            <Text style={{ color: C.muted, fontSize: 10, lineHeight: 14 }}>{item.label}</Text>
          </Card>
        ))}
      </View>
      <Card>
        <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }}>NEXT MOVE</Text>
        <SectionTitle>{profileDone ? 'Turn one priority into evidence' : 'Complete your career profile'}</SectionTitle>
        <Body>{profileDone ? 'Choose the smallest action that shows progress.' : 'Add your target role and one career goal so coaching can be specific.'}</Body>
        <Button secondary onPress={() => router.push(profileDone ? '/coach' : '/profile')}>{profileDone ? 'Open career coach' : 'Complete profile'}</Button>
      </Card>
      <Card>
        <SectionTitle>New workspace sections</SectionTitle>
        <Body>Organize fictional evidence examples and track application follow-through. CV and LinkedIn tools live under Profile; account and admin previews remain demo-only.</Body>
        <Button onPress={() => router.push('/evidence')}>Open Evidence Library</Button>
        <Button onPress={() => router.push('/applications')}>Open Applications</Button>
        <Button onPress={() => router.push('/job-search')}>Open Job Search</Button>
        <Button onPress={() => router.push('/join')}>Open Account / Join</Button>
        <Button secondary onPress={() => router.push('/admin')}>Open Admin dashboard</Button>
        <Button secondary onPress={() => router.push('/profile')}>Open Profile, CV & documents</Button>
      </Card>
      <Card>
        <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }}>AI SUPPORT</Text>
        <SectionTitle>Offline coach included</SectionTitle>
        <Body>The built-in coach works without internet. CV and LinkedIn writing suggestions are also generated locally from simple checks.</Body>
        <Button secondary onPress={() => router.push('/coach')}>Open coach</Button>
      </Card>
    </Page>
  );
}
