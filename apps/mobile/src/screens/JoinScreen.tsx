import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useCareer } from '../CareerContext';
import { MembershipTier } from '../domain';
import { Button, Card, Header, LabeledInput, Notice, Page, SegmentedTabs, SectionTitle, Body, C } from '../ui';

type JoinTab = 'login' | 'create' | 'plans';
const plans: { tier: MembershipTier; price: string; detail: string; status: string }[] = [
  { tier: 'Starter', price: '$0 · demo', detail: 'Local profile, tasks, career journey, and offline guidance.', status: 'Available as a local preview' },
  { tier: 'Plus', price: 'Not priced', detail: 'Illustrative expanded workspace and document features.', status: 'Planned · no billing' },
  { tier: 'Pro', price: 'Not priced', detail: 'Illustrative advanced career workspace and review tools.', status: 'Planned · no billing' },
];

export default function JoinScreen() {
  const { ready, workspace, setDemoAccount, clearDemoSession } = useCareer();
  const [tab, setTab] = useState<JoinTab>('login');
  const [displayName, setDisplayName] = useState('');
  if (!ready) return <Page><Body>Loading account preview…</Body></Page>;

  const chooseTier = (tier: MembershipTier) => {
    setDemoAccount(workspace.account.displayName || 'Sample member', tier);
    Alert.alert('Demo tier selected', `${tier} is selected only in this local preview. No account, paid membership, or entitlement was created.`);
  };

  return (
    <Page>
      <Header title="Account & membership" subtitle="Sign-in, join, and plan selection are visible here." />
      <Notice title="NO REAL LOGIN OR MEMBERSHIP">This $0 build has no account server, password storage, payment processor, or shared member records. Buttons only create a local demo state on this phone.</Notice>
      {workspace.account.demoActive ? (
        <Card>
          <Text style={{ color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>LOCAL DEMO SESSION</Text>
          <SectionTitle>{workspace.account.displayName || 'Sample member'}</SectionTitle>
          <Body>Selected sample tier: {workspace.account.tier}. This is not an authenticated account.</Body>
          <Button secondary onPress={clearDemoSession}>End demo session</Button>
        </Card>
      ) : null}
      <SegmentedTabs items={[{ value: 'login', label: 'Login' }, { value: 'create', label: 'Create profile' }, { value: 'plans', label: 'Membership tiers' }]} value={tab} onChange={setTab} />

      {tab === 'login' && (
        <Card>
          <SectionTitle>Login preview</SectionTitle>
          <Body>Real sign-in is not configured. No email or password is requested or stored. Use the sample action to preview how an account state appears in the app.</Body>
          <Button onPress={() => setDemoAccount('Sample member', workspace.account.tier)}>Continue as sample member</Button>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>The sample session is stored only in this app&apos;s local storage and can be cleared above.</Text>
        </Card>
      )}

      {tab === 'create' && (
        <Card>
          <SectionTitle>Create a local demo profile</SectionTitle>
          <Body>This form does not register a user. It stores only a display name and sample tier on this device; do not enter a password or sensitive data.</Body>
          <LabeledInput label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Example: Sample member" maxLength={60} />
          <Button onPress={() => { setDemoAccount(displayName || 'New sample member', 'Starter'); setDisplayName(''); Alert.alert('Demo profile ready', 'No real user account was created. This profile exists only on this device.'); }}>Create local demo profile</Button>
        </Card>
      )}

      {tab === 'plans' && (
        <>
          <Card>
            <SectionTitle>Membership levels</SectionTitle>
            <Body>Choose a sample tier to preview the UI. Paid plans have no price or live entitlement, and this screen cannot charge anyone.</Body>
          </Card>
          {plans.map((plan) => (
            <Card key={plan.tier}>
              <Text style={{ color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>{plan.status.toUpperCase()}</Text>
              <Text style={{ color: C.ink, fontSize: 20, fontWeight: '900' }}>{plan.tier}</Text>
              <Text style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>{plan.price}</Text>
              <Body>{plan.detail}</Body>
              <Button secondary={plan.tier !== 'Starter'} onPress={() => chooseTier(plan.tier)}>{plan.tier === 'Starter' ? 'Select free demo tier' : `Preview ${plan.tier} tier`}</Button>
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}
