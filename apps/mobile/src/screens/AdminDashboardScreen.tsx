import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { MembershipTier } from '../domain';
import { Button, Card, Header, Notice, Page, SegmentedTabs, SectionTitle, Body, C } from '../ui';

type AdminTab = 'overview' | 'usage' | 'members' | 'billing' | 'plans';
type SampleMember = { id: string; name: string; tier: MembershipTier; status: 'Active' | 'Paused'; lastSeen: string };
const initialMembers: SampleMember[] = [
  { id: 'DEMO-1042', name: 'Sample member 1042', tier: 'Starter', status: 'Active', lastSeen: 'Today' },
  { id: 'DEMO-1037', name: 'Sample member 1037', tier: 'Plus', status: 'Active', lastSeen: 'Yesterday' },
  { id: 'DEMO-1018', name: 'Sample member 1018', tier: 'Starter', status: 'Paused', lastSeen: '3 days ago' },
  { id: 'DEMO-1006', name: 'Sample member 1006', tier: 'Pro', status: 'Active', lastSeen: '5 days ago' },
];
const week = [8, 10, 14, 9, 7, 5, 5];
const month = [18, 24, 20, 31, 27, 34, 29];
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const initialPlanVisibility: Record<MembershipTier, boolean> = { Starter: true, Plus: true, Pro: false };

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={{ flex: 1, minWidth: '44%', backgroundColor: '#f7faf9', borderWidth: 1, borderColor: C.line, borderRadius: 13, padding: 12, gap: 4 }}><Text style={{ color: C.ink, fontSize: 21, fontWeight: '900' }}>{value}</Text><Text style={{ color: C.muted, fontSize: 10, lineHeight: 14 }}>{label}</Text></View>;
}

export default function AdminDashboardScreen() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [period, setPeriod] = useState<'7 days' | '30 days'>('7 days');
  const [members, setMembers] = useState(initialMembers);
  const [planVisibility, setPlanVisibility] = useState(initialPlanVisibility);
  const [query, setQuery] = useState('');
  const sampleActive = members.filter((member) => member.status === 'Active').length;
  const activity = period === '7 days' ? week : month;
  const visibleMembers = useMemo(() => members.filter((member) => `${member.name} ${member.id} ${member.tier}`.toLowerCase().includes(query.toLowerCase())), [members, query]);

  const toggleMember = (id: string) => setMembers((current) => current.map((member) => member.id === id ? { ...member, status: member.status === 'Active' ? 'Paused' : 'Active' } : member));
  const togglePlan = (tier: MembershipTier) => setPlanVisibility((current) => ({ ...current, [tier]: !current[tier] }));

  return (
    <Page>
      <Header title="Admin dashboard" subtitle="Usage, members, membership, and finances in one review screen." />
      <Notice title="SAMPLE ADMIN · PUBLIC DEMO UI">All user, activity, and transaction records are fictional. Controls change only these sample rows. There is no admin authentication, live analytics, payment provider, checkout, or real financial data.</Notice>
      <SegmentedTabs items={[{ value: 'overview', label: 'Overview' }, { value: 'usage', label: 'Usage' }, { value: 'members', label: 'Members' }, { value: 'billing', label: 'Payments' }, { value: 'plans', label: 'Plans' }]} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <>
          <Card>
            <SectionTitle>Usage overview · sample data</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Metric value="24" label="Sample accounts" />
              <Metric value={String(sampleActive + 8)} label="Sample active this week" />
              <Metric value="58" label="Illustrative sessions" />
              <Metric value="73" label="Sample career actions" />
            </View>
          </Card>
          <Card>
            <SectionTitle>Financial snapshot</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Metric value="$0.00" label="Collected in this demo" />
              <Metric value="$0.00" label="Outstanding demo balance" />
              <Metric value="$0.00" label="Refunds in demo" />
              <Metric value="0" label="Live transactions" />
            </View>
            <Body>Real collection totals require a payment provider and server-side transaction records; neither is connected.</Body>
          </Card>
          <Card>
            <SectionTitle>Recent sample events</SectionTitle>
            {['Task completed · Sample member 1042', 'Career profile updated · Sample member 1037', 'Journey checkpoint marked · Sample member 1018', 'New demo profile created · Sample member 1006'].map((event) => <Text key={event} style={{ color: C.muted, fontSize: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line }}>{event}</Text>)}
          </Card>
        </>
      )}

      {tab === 'usage' && (
        <>
          <Card>
            <SectionTitle>Usage monitoring</SectionTitle>
            <Body>Synthetic event counts only. No real phone or account activity is collected.</Body>
            <SegmentedTabs items={[{ value: '7 days', label: '7 days' }, { value: '30 days', label: '30 days' }]} value={period} onChange={setPeriod} />
            <View style={{ flexDirection: 'row', height: 145, alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, paddingTop: 10 }}>
              {activity.map((count, index) => (
                <View key={`${period}-${days[index]}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 5 }}>
                  <Text style={{ color: C.muted, fontSize: 9, fontWeight: '800' }}>{count}</Text>
                  <View style={{ height: 96, width: '72%', justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 7, backgroundColor: '#edf3f1' }}>
                    <View style={{ height: `${Math.max(12, count / Math.max(...activity) * 100)}%`, backgroundColor: C.mint, borderRadius: 7 }} />
                  </View>
                  <Text style={{ color: C.muted, fontSize: 8 }}>{days[index]}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Card>
            <SectionTitle>Sample usage controls</SectionTitle>
            <Body>Period filter: {period}. Active sample members: {sampleActive}. In a live system, these controls would need audited admin permissions.</Body>
            <Button secondary onPress={() => setPeriod(period === '7 days' ? '30 days' : '7 days')}>Switch reporting period</Button>
          </Card>
        </>
      )}

      {tab === 'members' && (
        <Card>
          <SectionTitle>Member review · sample records</SectionTitle>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search sample ID, name, or tier" placeholderTextColor={C.muted} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fbfdfd', color: C.ink, fontSize: 13, minHeight: 42 }} />
          <Body>Pause/activate controls affect these fictional rows only. They do not change any user&apos;s account.</Body>
          {visibleMembers.map((member) => (
            <View key={member.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: C.ink, fontSize: 13, fontWeight: '900', flex: 1 }}>{member.name}</Text>
                <Text style={{ color: member.status === 'Active' ? C.green : C.red, fontSize: 10, fontWeight: '900' }}>{member.status.toUpperCase()}</Text>
              </View>
              <Text style={{ color: C.muted, fontSize: 11 }}>{member.id} · {member.tier} · last active {member.lastSeen}</Text>
              <Button secondary onPress={() => toggleMember(member.id)}>{member.status === 'Active' ? 'Pause sample member' : 'Reactivate sample member'}</Button>
            </View>
          ))}
          {visibleMembers.length === 0 ? <Body>No matching sample records.</Body> : null}
        </Card>
      )}

      {tab === 'billing' && (
        <>
          <Card>
            <SectionTitle>Payments & collections</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Metric value="$0.00" label="Gross collections" />
              <Metric value="$0.00" label="Net collections" />
              <Metric value="$0.00" label="Refunds" />
              <Metric value="0" label="Settled transactions" />
            </View>
            <Body>No checkout, card details, subscription renewal, or collection is active in this demo.</Body>
          </Card>
          <Card>
            <SectionTitle>Payment types</SectionTitle>
            {[
              ['Card / debit', 'Not connected'],
              ['Apple Pay / wallet', 'Not connected'],
              ['Bank transfer', 'Not connected'],
              ['Cash / manual', 'Not connected'],
            ].map(([type, status]) => <View key={type} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}><Text style={{ color: C.ink, fontSize: 12, fontWeight: '800' }}>{type}</Text><Text style={{ color: C.muted, fontSize: 10 }}>{status}</Text></View>)}
          </Card>
          <Card>
            <SectionTitle>Sample collection ledger</SectionTitle>
            {[
              ['DEMO-2026-004', 'Starter', '$0.00'],
              ['DEMO-2026-003', 'Plus preview', '$0.00'],
              ['DEMO-2026-002', 'Starter', '$0.00'],
            ].map(([id, plan, amount]) => <View key={id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}><View style={{ flex: 1 }}><Text style={{ color: C.ink, fontSize: 11, fontWeight: '900' }}>{id}</Text><Text style={{ color: C.muted, fontSize: 10 }}>{plan} · not charged</Text></View><Text style={{ color: C.green, fontSize: 12, fontWeight: '900' }}>{amount}</Text></View>)}
          </Card>
        </>
      )}

      {tab === 'plans' && (
        <>
          <Card>
            <SectionTitle>Membership levels & controls</SectionTitle>
            <Body>Tier controls below change the illustrative dashboard only. There are no live prices, entitlements, or renewals.</Body>
          </Card>
          {([
            ['Starter', 'Free preview', 'Core career workspace, tasks, profile, and offline coach.'],
            ['Plus', 'Planned · not priced', 'Illustrative expanded limits and document workspace.'],
            ['Pro', 'Planned · not priced', 'Illustrative advanced workspace for future review.'],
          ] as const).map(([tier, price, detail]) => (
            <Card key={tier}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: C.ink, fontSize: 17, fontWeight: '900' }}>{tier}</Text>
                <Text style={{ color: C.green, fontSize: 11, fontWeight: '900' }}>{planVisibility[tier] ? 'VISIBLE IN DEMO' : 'HIDDEN IN DEMO'}</Text>
              </View>
              <Text style={{ color: C.green, fontSize: 12, fontWeight: '800' }}>{price}</Text>
              <Body>{detail}</Body>
              <Button secondary onPress={() => togglePlan(tier)}>{planVisibility[tier] ? 'Hide sample tier' : 'Show sample tier'}</Button>
            </Card>
          ))}
        </>
      )}
      <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' }}>This tab is an unprotected prototype. Do not use real users, payment data, or confidential business information here.</Text>
    </Page>
  );
}
