import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const colors = {
  ink: '#10202b',
  muted: '#647783',
  line: '#dce6e9',
  card: '#ffffff',
  paper: '#f7faf9',
  mint: '#53d6b2',
  mintSoft: '#e1f7f0',
  gold: '#e9b84e',
  red: '#d96868',
};

const metrics = [
  { label: 'Sample accounts', value: '24' },
  { label: 'Active this week', value: '11' },
  { label: 'Sample sessions', value: '58' },
  { label: 'Completed actions', value: '73' },
];

const activity = [
  { day: 'Mon', events: 8 },
  { day: 'Tue', events: 10 },
  { day: 'Wed', events: 14 },
  { day: 'Thu', events: 9 },
  { day: 'Fri', events: 7 },
  { day: 'Sat', events: 5 },
  { day: 'Sun', events: 5 },
];

const tiers = [
  { name: 'Starter', note: 'Free · no payment', members: '18 sample accounts', detail: 'Local projects, tasks, profile, milestones, and offline access.' },
  { name: 'Plus', note: 'Planned · not priced', members: '5 sample accounts', detail: 'Illustrative expanded limits; no live entitlement.' },
  { name: 'Pro', note: 'Planned · not priced', members: '1 sample account', detail: 'Illustrative advanced tier; no live entitlement.' },
];

const paymentRows = [
  { ref: 'DEMO-004', tier: 'Starter', amount: '$0.00' },
  { ref: 'DEMO-003', tier: 'Plus', amount: '$0.00' },
  { ref: 'DEMO-002', tier: 'Starter', amount: '$0.00' },
];

export default function AdminDemoCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.outerCard}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>ADMIN PREVIEW</Text>
          <Text style={styles.title}>Usage, memberships &amp; payments</Text>
          <Text style={styles.subtitle}>A private phone-sized demo with synthetic data only.</Text>
        </View>
        <View style={styles.demoBadge}><Text style={styles.demoBadgeText}>DEMO</Text></View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
      >
        <Text style={styles.expandButtonText}>{expanded ? 'Close admin preview' : 'Open admin preview'}</Text>
        <Text style={styles.expandChevron}>{expanded ? '−' : '+'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.previewBody}>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>DEMO DATA ONLY · $0.00</Text>
            <Text style={styles.noticeCopy}>No real users, analytics, payment provider, or checkout are connected. These examples cannot charge anyone or change an account.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Usage overview · last 7 days</Text>
            <View style={styles.metricGrid}>
              {metrics.map((metric) => (
                <View key={metric.label} style={styles.metricCard}>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.smallLabel}>Sample activity events by day</Text>
            <View accessibilityLabel="Synthetic sample activity chart" style={styles.chartRow}>
              {activity.map((item) => (
                <View key={item.day} style={styles.chartColumn}>
                  <Text style={styles.chartCount}>{item.events}</Text>
                  <View style={styles.chartTrack}>
                    <View style={[styles.chartBar, { height: `${(item.events / 14) * 100}%` }]} />
                  </View>
                  <Text style={styles.chartDay}>{item.day}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Membership levels</Text>
            <Text style={styles.sectionCaption}>Illustrative tiers · no live plans or pricing</Text>
            {tiers.map((tier) => (
              <View key={tier.name} style={styles.tierCard}>
                <View style={styles.tierTop}>
                  <Text style={styles.tierName}>{tier.name}</Text>
                  <Text style={styles.tierMembers}>{tier.members}</Text>
                </View>
                <Text style={styles.tierNote}>{tier.note}</Text>
                <Text style={styles.tierDetail}>{tier.detail}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.tierTop}>
              <Text style={styles.sectionTitle}>Payment activity</Text>
              <Text style={styles.zeroTotal}>$0.00</Text>
            </View>
            <Text style={styles.sectionCaption}>Example ledger only · no payment method or transaction processing</Text>
            {paymentRows.map((row) => (
              <View key={row.ref} style={styles.paymentRow}>
                <View style={styles.paymentCopy}>
                  <Text style={styles.paymentRef}>{row.ref} · {row.tier}</Text>
                  <Text style={styles.paymentStatus}>Demo only · not charged</Text>
                </View>
                <Text style={styles.paymentAmount}>{row.amount}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.footer}>All records above are fictional. No external service is contacted.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 17, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  headerCopy: { flex: 1, gap: 5 },
  kicker: { color: '#197a67', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  demoBadge: { backgroundColor: colors.mintSoft, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  demoBadgeText: { color: '#197a67', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  expandButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: colors.ink, paddingHorizontal: 14 },
  expandButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  expandChevron: { color: colors.mint, fontSize: 23, lineHeight: 25, fontWeight: '700' },
  pressed: { opacity: 0.76 },
  previewBody: { gap: 16 },
  notice: { backgroundColor: '#fff5df', borderColor: '#f0d79f', borderWidth: 1, borderRadius: 13, padding: 12, gap: 5 },
  noticeTitle: { color: '#785313', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  noticeCopy: { color: '#594f3d', fontSize: 12, lineHeight: 18 },
  section: { gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '800', flexShrink: 1 },
  sectionCaption: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: -6 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { width: '48%', minHeight: 78, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 11, justifyContent: 'center', gap: 4 },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  smallLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  chartRow: { height: 124, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 },
  chartColumn: { flex: 1, alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' },
  chartCount: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  chartTrack: { height: 84, width: '75%', minWidth: 16, backgroundColor: '#eef3f2', borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', backgroundColor: colors.mint, borderRadius: 7 },
  chartDay: { color: colors.muted, fontSize: 9 },
  tierCard: { backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: 13, padding: 12, gap: 5 },
  tierTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tierName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  tierMembers: { color: colors.muted, fontSize: 10, textAlign: 'right', flexShrink: 1 },
  tierNote: { color: '#197a67', fontSize: 11, fontWeight: '800' },
  tierDetail: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  zeroTotal: { color: '#197a67', fontSize: 14, fontWeight: '900' },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  paymentCopy: { flex: 1, gap: 3 },
  paymentRef: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  paymentStatus: { color: colors.muted, fontSize: 10 },
  paymentAmount: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  footer: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
