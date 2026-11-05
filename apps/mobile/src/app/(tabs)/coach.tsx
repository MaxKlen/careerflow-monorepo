import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { CoachResult, connectedCoach, offlineCoach } from '../../coach';
import { useCareer } from '../../CareerContext';
import { Button, Card, Header, Notice, Page, SectionTitle, Body, C } from '../../ui';

function coachDestination(endpoint?: string) {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).origin;
  } catch {
    return 'the configured coach service';
  }
}

export default function CoachScreen() {
  const { ready, state } = useCareer();
  const [result, setResult] = useState<CoachResult | null>(null);
  const [loading, setLoading] = useState(false);
  if (!ready) return <Page><Body>Loading coach…</Body></Page>;

  const endpoint = process.env.EXPO_PUBLIC_COACH_ENDPOINT;
  const destination = coachDestination(endpoint);
  const offline = !endpoint;

  const run = async (shareWithConnectedCoach: boolean) => {
    setLoading(true);
    try {
      const connected = shareWithConnectedCoach ? await connectedCoach(state) : null;
      setResult(connected || offlineCoach(state));
    } catch {
      setResult(offlineCoach(state));
    } finally {
      setLoading(false);
    }
  };

  const requestCoachingNote = () => {
    if (offline) {
      void run(false);
      return;
    }

    Alert.alert(
      'Share career data with the connected coach?',
      `Choosing “Share once” sends your career profile, task records (including notes, status, priority, and dates), and milestone records to ${destination} for processing. CV, LinkedIn, and saved document drafts are not included. This choice applies only to this request.`,
      [
        { text: 'Use offline', style: 'cancel', onPress: () => void run(false) },
        { text: 'Share once', onPress: () => void run(true) },
      ],
    );
  };

  return (
    <Page>
      <Header title="Career coach" subtitle="Practical support that stays useful when you are offline." />
      <View style={{ backgroundColor: C.ink, borderRadius: 18, padding: 18, gap: 8 }}>
        <Text style={{ color: C.mint, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }}>{offline ? 'OFFLINE MODE' : 'OPTIONAL CONNECTED MODE'}</Text>
        <Text style={{ color: '#ffffff', fontSize: 18, lineHeight: 24, fontWeight: '900' }}>{offline ? 'Guidance is ready on this device.' : 'Connected suggestions are optional; each request asks before sharing.'}</Text>
      </View>
      <Card>
        {result ? <>
          <Text style={{ color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>COACHING NOTE</Text>
          <SectionTitle>{result.title}</SectionTitle>
          <Body>{result.body}</Body>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800' }}>{result.source === 'offline' ? 'Built-in offline coach' : 'Connected coach response'}</Text>
          <Text style={{ color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 4 }}>TRY THIS</Text>
          {result.actions.map((action) => <Text key={action} style={{ color: C.ink, fontSize: 13, lineHeight: 19 }}>• {action}</Text>)}
        </> : <>
          <SectionTitle>Ready when you are</SectionTitle>
          <Body>{offline
            ? 'Get a grounded next step based on your career profile, tasks, and milestones. CV and LinkedIn drafts are not sent to this coach.'
            : `Before any connected request, you can review the data and destination (${destination}) and choose to share once or stay offline. CV, LinkedIn, and document drafts are not included.`}</Body>
        </>}
        <Button onPress={requestCoachingNote} disabled={loading}>{loading ? 'Thinking…' : 'Get a coaching note'}</Button>
      </Card>
      <Notice title="INFORMATIONAL ONLY">CareerFlow organizes and tracks career activities. Suggestions are rule-based in offline mode and should be checked for accuracy; they do not apply for jobs or replace professional advice.</Notice>
    </Page>
  );
}
