import React, { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { CandidateOpportunity } from '../domain';
import {
  MAX_CANDIDATE_OPPORTUNITY_RECORDS,
  MAX_OPPORTUNITY_KEYWORD_LENGTH,
  MAX_OPPORTUNITY_KEYWORDS,
  createOpportunityApplicationDraft,
  filterSearchOpportunities,
  isOpportunityTracked,
  matchOpportunityPhrases,
  toSearchOpportunities,
  validateOpportunityEntry,
} from '../opportunities';
import type { CandidateOpportunityInput, OpportunityEntryErrors, OpportunitySourceFilter, SearchOpportunity } from '../opportunities';
import { useCareer } from '../CareerContext';
import { Body, Button, C, Card, Header, LabeledInput, Notice, Page, SegmentedTabs, SectionTitle } from '../ui';

type EntryDraft = {
  company: string;
  role: string;
  location: string;
  type: string;
  summary: string;
  keywordsText: string;
};

type SortOrder = 'overlap' | 'title';

const blankEntry: EntryDraft = { company: '', role: '', location: '', type: '', summary: '', keywordsText: '' };
const sourceFilters: { value: OpportunitySourceFilter; label: string }[] = [
  { value: 'all', label: 'All roles' },
  { value: 'sample', label: 'Fictional samples' },
  { value: 'candidate', label: 'My local entries' },
];
const sortFilters: { value: SortOrder; label: string }[] = [
  { value: 'overlap', label: 'Text overlap' },
  { value: 'title', label: 'Role title A–Z' },
];

function toInput(draft: EntryDraft): CandidateOpportunityInput {
  return {
    company: draft.company.trim(),
    role: draft.role.trim(),
    location: draft.location.trim(),
    type: draft.type.trim(),
    summary: draft.summary.trim(),
    keywords: draft.keywordsText.split(/\r?\n/).map((phrase) => phrase.trim()).filter(Boolean),
  };
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Text accessibilityRole="alert" style={{ color: '#a63232', fontSize: 12, lineHeight: 17 }}>{children}</Text>;
}

function OpportunityCard({
  opportunity,
  cvText,
  tracked,
  onTrack,
  onEdit,
  onRemove,
}: {
  opportunity: SearchOpportunity;
  cvText: string;
  tracked: boolean;
  onTrack: (opportunity: SearchOpportunity) => void;
  onEdit: (opportunity: CandidateOpportunity) => void;
  onRemove: (opportunity: CandidateOpportunity) => void;
}) {
  const comparison = cvText.trim() ? matchOpportunityPhrases(cvText, opportunity.keywords) : null;
  return (
    <Card>
      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>
        {opportunity.source === 'sample' ? `${opportunity.category} · FICTIONAL SAMPLE` : 'YOUR LOCAL ENTRY'}
      </Text>
      <SectionTitle accessibilityRole="header">{opportunity.role}</SectionTitle>
      <Text style={{ color: C.ink, fontSize: 14, fontWeight: '800' }}>{opportunity.company}</Text>
      {(opportunity.location || opportunity.type) ? (
        <Text style={{ color: C.muted, fontSize: 12 }}>{[opportunity.location, opportunity.type].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {opportunity.summary ? <Body>{opportunity.summary}</Body> : null}
      {comparison ? (
        <View accessibilityLabel={`Exact phrase comparison for ${opportunity.role}`} style={{ backgroundColor: '#f1f8f6', borderRadius: 12, padding: 11, gap: 6 }}>
          <Text style={{ color: C.ink, fontSize: 13, fontWeight: '900' }}>CV text overlap: {comparison.matchedPhrases.length} of {opportunity.keywords.length} listed phrases ({comparison.overlapPercent}%)</Text>
          <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}><Text style={{ color: C.ink, fontWeight: '800' }}>Found in saved CV: </Text>{comparison.matchedPhrases.length ? comparison.matchedPhrases.join(' · ') : 'None of these exact phrases'}</Text>
          <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}><Text style={{ color: C.ink, fontWeight: '800' }}>Not found in saved CV: </Text>{comparison.missingPhrases.length ? comparison.missingPhrases.join(' · ') : 'None'}</Text>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>Text overlap only. Exact listed phrases are checked with case, spacing, and most punctuation normalized; C, C++, and C# remain distinct. Synonyms and meaning are not inferred. This is not a job-fit, experience, or qualification assessment.</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: '#f1f8f6', borderRadius: 12, padding: 11, gap: 5 }}>
          <Text style={{ color: C.ink, fontSize: 13, fontWeight: '900' }}>Listed phrases</Text>
          <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>{opportunity.keywords.join(' · ')}</Text>
          <Text style={{ color: C.muted, fontSize: 11 }}>Import or paste fictional CV text in Profile to compare exact phrase overlap.</Text>
        </View>
      )}
      <Button onPress={() => onTrack(opportunity)} disabled={tracked} secondary={tracked}>
        {tracked ? 'Already in Applications' : opportunity.source === 'sample' ? 'Track sample role' : 'Track local role'}
      </Button>
      {opportunity.source === 'candidate' ? (
        <>
          <Button secondary onPress={() => onEdit(opportunity)}>Edit local entry</Button>
          <Button secondary onPress={() => onRemove(opportunity)}>Remove local entry</Button>
        </>
      ) : null}
    </Card>
  );
}

export default function OpportunitySearchScreen() {
  const { ready, state, workspace, careerSaveStatus, addApplication, addOpportunity, updateOpportunity, removeOpportunity } = useCareer();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<OpportunitySourceFilter>('all');
  const [workType, setWorkType] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('overlap');
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingOpportunityId, setEditingOpportunityId] = useState<string | null>(null);
  const [entry, setEntry] = useState<EntryDraft>({ ...blankEntry });
  const [entryErrors, setEntryErrors] = useState<OpportunityEntryErrors>({});
  const [notice, setNotice] = useState('');
  const successToast = careerSaveStatus === 'saved' ? notice : '';

  const opportunities = useMemo(() => {
    const available = filterSearchOpportunities(toSearchOpportunities(state.opportunities), query, source, workType);
    return available.slice().sort((left, right) => {
      if (sortOrder === 'title' || !workspace.cvText.trim()) return left.role.localeCompare(right.role);
      const leftMatch = matchOpportunityPhrases(workspace.cvText, left.keywords).overlapPercent;
      const rightMatch = matchOpportunityPhrases(workspace.cvText, right.keywords).overlapPercent;
      return rightMatch - leftMatch || left.role.localeCompare(right.role);
    });
  }, [query, source, state.opportunities, sortOrder, workType, workspace.cvText]);

  if (!ready) return <Page><Body>Loading local opportunities…</Body></Page>;

  const clearEntry = () => {
    setEntry({ ...blankEntry });
    setEntryErrors({});
    setEditingOpportunityId(null);
    setEntryOpen(false);
  };

  const openNewEntry = () => {
    setEntry({ ...blankEntry });
    setEntryErrors({});
    setEditingOpportunityId(null);
    setEntryOpen(true);
  };

  const openEdit = (opportunity: CandidateOpportunity) => {
    setEntry({
      company: opportunity.company,
      role: opportunity.role,
      location: opportunity.location,
      type: opportunity.type,
      summary: opportunity.summary,
      keywordsText: opportunity.keywords.join('\n'),
    });
    setEntryErrors({});
    setEditingOpportunityId(opportunity.id);
    setEntryOpen(true);
  };

  const saveEntry = () => {
    const input = toInput(entry);
    const validationErrors = validateOpportunityEntry(input);
    if (!editingOpportunityId && state.opportunities.length >= MAX_CANDIDATE_OPPORTUNITY_RECORDS) {
      validationErrors.form = `This preview stores up to ${MAX_CANDIDATE_OPPORTUNITY_RECORDS} local opportunity entries.`;
    }
    setEntryErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    const result = editingOpportunityId
      ? updateOpportunity(editingOpportunityId, input)
      : addOpportunity(input);
    if (!result.ok) {
      setEntryErrors(result.errors);
      return;
    }
    setNotice(editingOpportunityId ? 'Fictional local opportunity updated on this phone.' : 'Fictional local opportunity saved on this phone.');
    clearEntry();
  };

  const track = (opportunity: SearchOpportunity) => {
    if (isOpportunityTracked(opportunity, state.applications)) {
      setNotice('This role is already in Applications.');
      return;
    }
    addApplication(createOpportunityApplicationDraft(opportunity));
    setNotice('Fictional role added to Applications with its listed phrases. Nothing was submitted.');
  };

  const confirmRemove = (opportunity: CandidateOpportunity) => {
    Alert.alert(
      'Remove local opportunity?',
      `Remove the fictional ${opportunity.role} entry from this phone? Any separate Applications record will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeOpportunity(opportunity.id);
            setNotice('Local opportunity removed. Any Applications record was kept.');
          },
        },
      ],
    );
  };

  return (
    <Page>
      <Button secondary onPress={() => router.back()}>← Back to workspace</Button>
      <Header title="Job search" subtitle="Browse fictional sample roles or save your own fictional opportunity, then compare listed phrases with local CV text." titleAccessibilityRole="header" />
      <Notice title="FICTIONAL ROLES · LOCAL ONLY">
        Built-in roles are fictional, not live openings. Use made-up, non-sensitive details only. Entries and CV comparison stay in this app&apos;s local storage on this phone, which is not encrypted by the app; no job sites are contacted and nothing is submitted. Phrase matching is an exact text-overlap check only: it does not infer synonyms or assess fit, experience, or qualifications.
      </Notice>

      <Card>
        <SectionTitle accessibilityRole="header">Your local opportunity list</SectionTitle>
        <Body>{state.opportunities.length} of {MAX_CANDIDATE_OPPORTUNITY_RECORDS} candidate-entered entries in this list.</Body>
        <Button onPress={openNewEntry}>+ Add a fictional local opportunity</Button>
      </Card>

      {entryOpen ? (
        <Card>
          <SectionTitle accessibilityRole="header">{editingOpportunityId ? 'Edit local opportunity' : 'Add a local opportunity'}</SectionTitle>
          <Body>{editingOpportunityId ? 'Changes stay on this phone. A separate Applications record will not be changed.' : 'Enter a made-up organization and role. Nothing is sent to an employer.'}</Body>
          <LabeledInput label="Role title" accessibilityLabel="Role title" value={entry.role} onChangeText={(value) => setEntry({ ...entry, role: value })} maxLength={100} accessibilityHint="Required, up to 100 characters" />
          <ErrorText>{entryErrors.role}</ErrorText>
          <LabeledInput label="Company or organization" accessibilityLabel="Company or organization" value={entry.company} onChangeText={(value) => setEntry({ ...entry, company: value })} maxLength={100} accessibilityHint="Required, up to 100 characters" />
          <ErrorText>{entryErrors.company}</ErrorText>
          <LabeledInput label="Location (optional)" accessibilityLabel="Location, optional" value={entry.location} onChangeText={(value) => setEntry({ ...entry, location: value })} maxLength={100} />
          <ErrorText>{entryErrors.location}</ErrorText>
          <LabeledInput label="Work type (optional)" accessibilityLabel="Work type, optional" value={entry.type} onChangeText={(value) => setEntry({ ...entry, type: value })} maxLength={60} placeholder="For example, remote or part-time" />
          <ErrorText>{entryErrors.type}</ErrorText>
          <LabeledInput label="Short summary (optional)" accessibilityLabel="Short summary, optional" value={entry.summary} onChangeText={(value) => setEntry({ ...entry, summary: value })} maxLength={600} multiline />
          <ErrorText>{entryErrors.summary}</ErrorText>
          <LabeledInput
            label={`Required phrases (one per line; up to ${MAX_OPPORTUNITY_KEYWORDS})`}
            accessibilityLabel="Required phrases, one per line"
            accessibilityHint={`Add one to ${MAX_OPPORTUNITY_KEYWORDS} phrases, each no longer than 80 characters`}
            value={entry.keywordsText}
            onChangeText={(value) => setEntry({ ...entry, keywordsText: value })}
            maxLength={MAX_OPPORTUNITY_KEYWORDS * (MAX_OPPORTUNITY_KEYWORD_LENGTH + 1)}
            multiline
            placeholder={'Fictional example: project coordination\nFictional example: stakeholder communication'}
          />
          <ErrorText>{entryErrors.keywords}</ErrorText>
          <ErrorText>{entryErrors.form}</ErrorText>
          <Button onPress={saveEntry}>{editingOpportunityId ? 'Save changes' : 'Save local opportunity'}</Button>
          <Button secondary onPress={clearEntry}>Cancel</Button>
        </Card>
      ) : null}

      {!workspace.cvText.trim() ? (
        <Card>
          <SectionTitle accessibilityRole="header">No saved CV text yet</SectionTitle>
          <Body>Browse or add fictional roles now. To compare their phrases, import or paste fictional CV text in Profile. The text stays on this phone.</Body>
          <Button secondary onPress={() => router.push('/profile')}>Open Profile & CV</Button>
        </Card>
      ) : null}

      <Card>
        <SectionTitle accessibilityRole="header">Search and filter</SectionTitle>
        <LabeledInput label="Search roles, organizations, locations, or phrases" accessibilityLabel="Search opportunities" value={query} onChangeText={setQuery} placeholder="Try accessibility or Product Analyst" accessibilityHint="Filters the fictional samples and local entries" />
        <LabeledInput label="Filter by work type (optional)" accessibilityLabel="Filter by work type" value={workType} onChangeText={setWorkType} placeholder="For example, remote" />
        <Body>Show</Body>
        <SegmentedTabs items={sourceFilters} value={source} onChange={setSource} />
        <Body>Sort by</Body>
        <SegmentedTabs items={sortFilters} value={sortOrder} onChange={setSortOrder} />
      </Card>

      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        <SectionTitle accessibilityRole="header">{opportunities.length} {opportunities.length === 1 ? 'opportunity' : 'opportunities'}</SectionTitle>
        {opportunities.length ? opportunities.map((opportunity) => (
          <OpportunityCard
            key={`${opportunity.source}-${opportunity.id}`}
            opportunity={opportunity}
            cvText={workspace.cvText}
            tracked={isOpportunityTracked(opportunity, state.applications)}
            onTrack={track}
            onEdit={openEdit}
            onRemove={confirmRemove}
          />
        )) : (
          <Card>
            <SectionTitle accessibilityRole="header">No roles match those filters</SectionTitle>
            <Body>Try a broader search, clear the work-type filter, or show all roles.</Body>
            <Button secondary onPress={() => { setQuery(''); setSource('all'); setWorkType(''); }}>Clear filters</Button>
          </Card>
        )}
      </View>
      {successToast ? <Text accessibilityLiveRegion="polite" style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>{successToast}</Text> : null}
    </Page>
  );
}
