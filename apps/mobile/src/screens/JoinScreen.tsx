import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useCareer } from '../CareerContext';
import { MembershipTier } from '../domain';
import { apiConfigured } from '../api';
import {
  Button,
  Card,
  Header,
  LabeledInput,
  Notice,
  Page,
  SegmentedTabs,
  SectionTitle,
  Body,
  C,
} from '../ui';

type JoinTab = 'login' | 'create' | 'plans';
const plans: {
  tier: MembershipTier;
  price: string;
  detail: string;
  status: string;
}[] = [
  {
    tier: 'Starter',
    price: '$0 · demo',
    detail: 'Local profile, tasks, career journey, and offline guidance.',
    status: 'Available as a local preview',
  },
  {
    tier: 'Plus',
    price: 'Not priced',
    detail: 'Illustrative expanded workspace and document features.',
    status: 'Planned · no billing',
  },
  {
    tier: 'Pro',
    price: 'Not priced',
    detail: 'Illustrative advanced career workspace and review tools.',
    status: 'Planned · no billing',
  },
];

export default function JoinScreen() {
  const {
    ready,
    workspace,
    authenticatedUser,
    signIn,
    signUp,
    signOut,
    setDemoAccount,
  } = useCareer();
  const [tab, setTab] = useState<JoinTab>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  if (!ready)
    return (
      <Page>
        <Body>Loading account preview…</Body>
      </Page>
    );

  const chooseTier = (tier: MembershipTier) => {
    setDemoAccount(workspace.account.displayName || 'Sample member', tier);
    Alert.alert(
      'Demo tier selected',
      `${tier} is selected only in this local preview. No account, paid membership, or entitlement was created.`,
    );
  };

  return (
    <Page>
      <Header
        title="Account & membership"
        subtitle="Sign-in, join, and plan selection are visible here."
      />
      <Notice
        title={apiConfigured() ? 'API-BACKED ACCOUNT' : 'LOCAL DEMO ACCOUNT'}
      >
        {apiConfigured()
          ? 'This build can sign in to the Fastify backend using EXPO_PUBLIC_API_URL. Session cookies are retained on this device.'
          : 'Set EXPO_PUBLIC_API_URL to use the real account API. Without it, the sample session remains local-only.'}
      </Notice>
      {authenticatedUser ? (
        <Card>
          <Text
            style={{
              color: C.green,
              fontSize: 10,
              fontWeight: '900',
              letterSpacing: 1,
            }}
          >
            SIGNED IN
          </Text>
          <SectionTitle>
            {authenticatedUser.displayName || authenticatedUser.email}
          </SectionTitle>
          <Body>{authenticatedUser.email}</Body>
          <Button secondary onPress={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      ) : workspace.account.demoActive ? (
        <Card>
          <Text
            style={{
              color: C.green,
              fontSize: 10,
              fontWeight: '900',
              letterSpacing: 1,
            }}
          >
            LOCAL DEMO SESSION
          </Text>
          <SectionTitle>
            {workspace.account.displayName || 'Sample member'}
          </SectionTitle>
          <Body>
            Selected sample tier: {workspace.account.tier}. This is not an
            authenticated account.
          </Body>
          <Button secondary onPress={() => void signOut()}>
            End demo session
          </Button>
        </Card>
      ) : null}
      <SegmentedTabs
        items={[
          { value: 'login', label: 'Login' },
          { value: 'create', label: 'Create profile' },
          { value: 'plans', label: 'Membership tiers' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'login' && (
        <Card>
          <SectionTitle>
            {apiConfigured() ? 'Sign in to CareerFlow' : 'Login preview'}
          </SectionTitle>
          {apiConfigured() ? (
            <>
              <LabeledInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <LabeledInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <Button
                onPress={() =>
                  void signIn(email.trim(), password)
                    .then(() =>
                      setNotice(
                        'Signed in and loaded your profile and applications.',
                      ),
                    )
                    .catch((error) =>
                      setNotice(
                        error instanceof Error
                          ? error.message
                          : 'Sign-in failed.',
                      ),
                    )
                }
              >
                Sign in
              </Button>
              <Body>
                Create an account in the Create profile tab if you do not have
                one.
              </Body>
            </>
          ) : (
            <>
              <Body>
                Set EXPO_PUBLIC_API_URL to use the real account API. Until then,
                this sample action only updates local device state.
              </Body>
              <Button
                onPress={() =>
                  setDemoAccount('Sample member', workspace.account.tier)
                }
              >
                Continue as sample member
              </Button>
            </>
          )}
          {notice ? (
            <Text style={{ color: C.green, fontSize: 11, lineHeight: 16 }}>
              {notice}
            </Text>
          ) : null}
        </Card>
      )}

      {tab === 'create' && (
        <Card>
          <SectionTitle>
            {apiConfigured()
              ? 'Create a CareerFlow account'
              : 'Create a local demo profile'}
          </SectionTitle>
          <Body>
            {apiConfigured()
              ? 'Creates a real candidate account on the configured Fastify backend.'
              : 'This form does not register a user. Set EXPO_PUBLIC_API_URL to enable real signup.'}
          </Body>
          <LabeledInput
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Example: Sample member"
            maxLength={60}
          />
          {apiConfigured() ? (
            <>
              <LabeledInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <LabeledInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <Button
                onPress={() =>
                  void signUp(email.trim(), password, displayName.trim())
                    .then(() => setNotice('Account created and signed in.'))
                    .catch((error) =>
                      setNotice(
                        error instanceof Error
                          ? error.message
                          : 'Sign-up failed.',
                      ),
                    )
                }
              >
                Create account
              </Button>
            </>
          ) : (
            <Button
              onPress={() => {
                setDemoAccount(displayName || 'New sample member', 'Starter');
                setDisplayName('');
                Alert.alert(
                  'Demo profile ready',
                  'No real user account was created. This profile exists only on this device.',
                );
              }}
            >
              Create local demo profile
            </Button>
          )}
        </Card>
      )}

      {tab === 'plans' && (
        <>
          <Card>
            <SectionTitle>Membership levels</SectionTitle>
            <Body>
              Choose a sample tier to preview the UI. Paid plans have no price
              or live entitlement, and this screen cannot charge anyone.
            </Body>
          </Card>
          {plans.map((plan) => (
            <Card key={plan.tier}>
              <Text
                style={{
                  color: C.green,
                  fontSize: 10,
                  fontWeight: '900',
                  letterSpacing: 0.8,
                }}
              >
                {plan.status.toUpperCase()}
              </Text>
              <Text style={{ color: C.ink, fontSize: 20, fontWeight: '900' }}>
                {plan.tier}
              </Text>
              <Text style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>
                {plan.price}
              </Text>
              <Body>{plan.detail}</Body>
              <Button
                secondary={plan.tier !== 'Starter'}
                onPress={() => chooseTier(plan.tier)}
              >
                {plan.tier === 'Starter'
                  ? 'Select free demo tier'
                  : `Preview ${plan.tier} tier`}
              </Button>
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}
