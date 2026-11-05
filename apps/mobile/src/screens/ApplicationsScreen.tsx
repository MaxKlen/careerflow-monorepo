import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import type { ApplicationMaterialsDraft, ApplicationRecord, ApplicationStatus, EvidenceRecord, FollowUpEvent, FollowUpEventType } from '../domain';
import { APPLICATION_STATUSES, FOLLOW_UP_EVENT_TYPES, MAX_FOLLOW_UP_EVENTS, isValidFollowUpDate, sortApplicationRecords, sortFollowUpEvents, validateApplicationDraft } from '../application';
import { createApplicationMaterialsExportFilename, createApplicationMaterialsScaffold, MAX_APPLICATION_MATERIALS_DRAFT_LENGTH } from '../applicationMaterials';
import {
  calculateRequirementCoverage,
  MAX_EVIDENCE_LINKS_PER_REQUIREMENT,
  parseApplicationRequirements,
  normalizeRequirementPhrase,
} from '../requirementCoverage';
import { useCareer } from '../CareerContext';
import { Body, Button, Card, C, Header, LabeledInput, Notice, Page, SectionTitle, SegmentedTabs } from '../ui';

type Filter = 'all' | ApplicationStatus;
type Draft = Pick<ApplicationRecord, 'organization' | 'role' | 'status' | 'appliedOn' | 'nextStep' | 'nextStepDueDate'> & { requirementsText: string };
type LinkTarget = { applicationId: string; requirement: string };
type FollowUpDraft = { date: string; type: FollowUpEventType; note: string };

const statusLabels: Record<ApplicationStatus, string> = {
  considering: 'Considering',
  preparing: 'Preparing',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed: 'Closed',
};
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...APPLICATION_STATUSES.map((status) => ({ value: status, label: statusLabels[status] })),
];
const emptyDraft: Draft = {
  organization: '',
  role: '',
  status: 'considering',
  appliedOn: '',
  nextStep: '',
  nextStepDueDate: '',
  requirementsText: '',
};
const emptyFollowUp: FollowUpDraft = { date: '', type: 'email', note: '' };
const followUpLabels: Record<FollowUpEventType, string> = { email: 'Email', phone: 'Phone', interview: 'Interview', message: 'Message', other: 'Other' };

function sourceChanged(source: EvidenceRecord | undefined, snapshot: NonNullable<ApplicationRecord['requirementEvidenceLinks']>[number]['snapshot']) {
  return Boolean(source && (source.updatedAt !== snapshot.updatedAt
    || source.title !== snapshot.title
    || source.context !== snapshot.context
    || source.action !== snapshot.action
    || source.result !== snapshot.result
    || source.skillTags.join('\u0000') !== snapshot.skillTags.join('\u0000')));
}

export default function ApplicationsScreen() {
  const {
    ready,
    state,
    careerSaveStatus,
    addApplication,
    updateApplication,
    saveApplicationMaterialsDraft,
    removeApplication,
    addFollowUpEvent,
    updateFollowUpEvent,
    removeFollowUpEvent,
    linkEvidenceToRequirement,
    unlinkEvidenceFromRequirement,
  } = useCareer();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<ApplicationRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft });
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);
  const [materialsDraftApplicationId, setMaterialsDraftApplicationId] = useState<string | null>(null);
  const [workingMaterialsDraft, setWorkingMaterialsDraft] = useState<ApplicationMaterialsDraft | null>(null);
  const [exportingMaterialsDraft, setExportingMaterialsDraft] = useState(false);
  const [followUpApplicationId, setFollowUpApplicationId] = useState<string | null>(null);
  const [editingFollowUp, setEditingFollowUp] = useState<FollowUpEvent | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState<FollowUpDraft>({ ...emptyFollowUp });
  const [notice, setNotice] = useState('');
  const records = useMemo(() => sortApplicationRecords(state.applications)
    .filter((item) => filter === 'all' || item.status === filter), [state.applications, filter]);
  const successToast = careerSaveStatus === 'saved' ? notice : '';

  if (!ready) return <Page><Body>Loading local applications…</Body></Page>;

  const openNew = () => {
    setEditing(null);
    setDraft({ ...emptyDraft });
    setCreating(true);
  };
  const openEdit = (record: ApplicationRecord) => {
    setEditing(record);
    setDraft({
      organization: record.organization,
      role: record.role,
      status: record.status,
      appliedOn: record.appliedOn || '',
      nextStep: record.nextStep,
      nextStepDueDate: record.nextStepDueDate || '',
      requirementsText: (record.requirements ?? []).join('\n'),
    });
    setCreating(true);
  };
  const save = () => {
    const cleanDraft = {
      organization: draft.organization.trim(),
      role: draft.role.trim(),
      status: draft.status,
      appliedOn: draft.appliedOn?.trim() || undefined,
      nextStep: draft.nextStep.trim(),
      nextStepDueDate: draft.nextStepDueDate?.trim() || undefined,
      requirements: parseApplicationRequirements(draft.requirementsText),
    };
    const errors = validateApplicationDraft(cleanDraft);
    if (Object.keys(errors).length) {
      Alert.alert('Check application details', Object.values(errors)[0]);
      return;
    }
    if (editing) updateApplication(editing.id, cleanDraft);
    else addApplication(cleanDraft);
    setCreating(false);
    setEditing(null);
    setNotice('Saved on this phone. This fictional application record stays in this app’s local storage. Nothing was sent or submitted.');
  };
  const confirmDelete = (record: ApplicationRecord) => {
    Alert.alert('Delete application record?', `Remove the fictional ${record.role} record for ${record.organization} from this phone?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeApplication(record.id);
          setNotice('Record deleted. The application record was removed from this phone.');
        },
      },
    ]);
  };
  const openFollowUp = (applicationId: string, event?: FollowUpEvent) => {
    setFollowUpApplicationId(applicationId);
    setEditingFollowUp(event ?? null);
    setFollowUpDraft(event ? { date: event.date, type: event.type, note: event.note } : { ...emptyFollowUp });
  };
  const saveFollowUp = () => {
    const date = followUpDraft.date.trim();
    const note = followUpDraft.note.trim();
    if (!isValidFollowUpDate(date)) { Alert.alert('Check follow-up', 'Enter a real date in YYYY-MM-DD format.'); return; }
    if (!note || note.length > 500) { Alert.alert('Check follow-up', 'Add a note from 1–500 characters.'); return; }
    if (!followUpApplicationId) return;
    const event: FollowUpEvent = { id: editingFollowUp?.id ?? `follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date, type: followUpDraft.type, note, createdAt: editingFollowUp?.createdAt ?? new Date().toISOString() };
    const result = editingFollowUp ? updateFollowUpEvent(followUpApplicationId, event) : addFollowUpEvent(followUpApplicationId, event);
    if (result === 'limit') { Alert.alert('Follow-up limit reached', `Keep up to ${MAX_FOLLOW_UP_EVENTS} follow-up events. Existing events were preserved.`); return; }
    if (result === 'invalid') { Alert.alert('Follow-up not saved', 'This follow-up is invalid or already exists.'); return; }
    setFollowUpApplicationId(null); setEditingFollowUp(null);
  };
  const confirmDeleteFollowUp = (applicationId: string, event: FollowUpEvent) => {
    const remove = () => {
      const result = removeFollowUpEvent(applicationId, event.id);
      if (result !== 'updated') Alert.alert('Follow-up not deleted', 'The event was missing or invalid; the remaining history was not changed.');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm('Delete follow-up event?\n\nThis local event will be removed from the application history.')) remove();
      return;
    }
    Alert.alert('Delete follow-up event?', 'This local event will be removed from the application history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  };
  const linkSelectedEvidence = (evidenceId: string) => {
    if (!linkTarget) return;
    const outcome = linkEvidenceToRequirement(linkTarget.applicationId, linkTarget.requirement, evidenceId);
    if (outcome === 'linked') {
      setLinkTarget(null);
      setNotice('Evidence linked. The candidate-selected example is saved as an original local snapshot. It does not prove qualification.');
      return;
    }
    const messages = {
      'missing-application': 'This application is no longer available.',
      'missing-requirement': 'This requirement is no longer on the application. Reopen the record and try again.',
      'missing-evidence': 'Choose an existing Evidence Library example.',
      duplicate: 'That example is already linked to this requirement.',
      limit: `Link up to ${MAX_EVIDENCE_LINKS_PER_REQUIREMENT} examples to each requirement.`,
    };
    Alert.alert('Could not link example', messages[outcome]);
  };
  const confirmUnlink = (applicationId: string, requirement: string, evidenceId: string) => {
    Alert.alert('Remove evidence link?', 'The saved snapshot will be removed from this requirement. The Evidence Library item will not be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove link', style: 'destructive', onPress: () => unlinkEvidenceFromRequirement(applicationId, requirement, evidenceId) },
    ]);
  };

  const openMaterialsDraft = (record: ApplicationRecord) => {
    setMaterialsDraftApplicationId(record.id);
    setWorkingMaterialsDraft(record.materialsDraft ?? createApplicationMaterialsScaffold(record));
  };
  const refreshMaterialsDraft = (record: ApplicationRecord) => {
    Alert.alert('Build a fresh outline?', 'This uses the application’s current saved requirements and selected evidence snapshots. Any unsaved text in the editor will be replaced.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Build outline', onPress: () => {
        try {
          setWorkingMaterialsDraft(createApplicationMaterialsScaffold(record));
        } catch (error) {
          Alert.alert('Could not prepare outline', error instanceof Error ? error.message : 'Try using fewer or shorter source notes.');
        }
      } },
    ]);
  };
  const saveMaterialsDraft = (record: ApplicationRecord) => {
    if (!workingMaterialsDraft || materialsDraftApplicationId !== record.id) return;
    if (workingMaterialsDraft.body.length > MAX_APPLICATION_MATERIALS_DRAFT_LENGTH) {
      Alert.alert('Draft is too long', `Use ${MAX_APPLICATION_MATERIALS_DRAFT_LENGTH.toLocaleString()} characters or fewer.`);
      return;
    }
    const saved = { ...workingMaterialsDraft, updatedAt: new Date().toISOString() };
    saveApplicationMaterialsDraft(record.id, saved);
    setWorkingMaterialsDraft(saved);
    setNotice('Draft saved on this phone. Review every source and detail before using it. Nothing was sent or submitted.');
  };
  const exportMaterialsDraft = async (record: ApplicationRecord) => {
    if (!workingMaterialsDraft || materialsDraftApplicationId !== record.id) return;
    try {
      setExportingMaterialsDraft(true);
      const filename = createApplicationMaterialsExportFilename(record.organization, record.role);
      if (Platform.OS === 'web') {
        const file = new Blob([workingMaterialsDraft.body], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        Alert.alert('Draft downloaded', 'A plain-text copy of the current editor text was downloaded. Unsaved text is not saved to the application record.');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot open a share sheet right now. Your local application record was not changed.');
        return;
      }
      const file = new File(Paths.cache, filename);
      await file.write(workingMaterialsDraft.body);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
        dialogTitle: 'Export current application materials draft',
      });
      Alert.alert('Share sheet closed', 'If you chose Save to Files or another destination, verify that the plain-text file is there. CareerFlow did not upload or submit it.');
    } catch (error) {
      Alert.alert('Draft export unavailable', error instanceof Error ? error.message : 'The plain-text file could not be prepared. Your local application record was not changed.');
    } finally {
      setExportingMaterialsDraft(false);
    }
  };

  const profileSkills = state.profile.skills.split(',').map((skill) => skill.trim()).filter(Boolean);
  const linkingApplication = linkTarget ? state.applications.find((item) => item.id === linkTarget.applicationId) : undefined;
  const linkedIds = new Set((linkingApplication?.requirementEvidenceLinks ?? [])
    .filter((link) => normalizeRequirementPhrase(link.requirement) === normalizeRequirementPhrase(linkTarget?.requirement ?? ''))
    .map((link) => link.evidenceId));
  const availableEvidence = state.evidenceItems.filter((item) => !linkedIds.has(item.id));
  const linkCount = linkingApplication?.requirementEvidenceLinks?.filter((link) =>
    normalizeRequirementPhrase(link.requirement) === normalizeRequirementPhrase(linkTarget?.requirement ?? '')).length ?? 0;

  return (
    <>
      <Page>
        <Button secondary onPress={() => router.back()}>← Back to workspace</Button>
        <Header title="Applications" subtitle="Track a fictional application, exact phrase overlaps, and evidence examples you explicitly choose. Nothing is sent from here." titleAccessibilityRole="header" />
        <Notice title="FICTIONAL DATA · LOCAL ONLY">
          Use made-up organizations, roles, requirements, and examples. Entries stay on this phone and are not encrypted or synced; they are not automatically backed up, though you can make a manual local backup. No jobs are sourced or submitted. Phrase checks compare exact Profile skills and Evidence tags only. A selected link preserves a note snapshot but does not verify experience or prove qualification.
        </Notice>
        {successToast ? <Text accessibilityLiveRegion="polite" style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>{successToast}</Text> : null}
        <Button onPress={openNew}>+ New application</Button>
        <Button secondary onPress={() => router.push('/evidence')}>Open Evidence Library</Button>
        <Card>
          <SectionTitle>Follow-through records</SectionTitle>
          <Body>{state.applications.length} {state.applications.length === 1 ? 'record' : 'records'} saved on this phone.</Body>
        </Card>
        <SegmentedTabs items={filters} value={filter} onChange={setFilter} />
        {records.length === 0 ? (
          <Card>
            <SectionTitle>{state.applications.length ? 'No records in this view' : 'Start with a fictional example'}</SectionTitle>
            <Body>{state.applications.length ? 'Choose another status filter to see your records.' : 'Add a made-up organization, role, and next step. You can add optional requirement phrases and inspect exact overlaps with your saved skills and tags.'}</Body>
            {!state.applications.length ? <Button secondary onPress={openNew}>Add a sample record</Button> : null}
          </Card>
        ) : records.map((record) => {
          const requirements = record.requirements ?? [];
          const coverage = calculateRequirementCoverage(requirements, profileSkills, state.evidenceItems);
          const exactPhraseCount = coverage.filter((result) => result.profileSkill !== null || result.evidenceTags.length > 0).length;
          return (
            <Card key={record.id}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: C.ink, fontSize: 17, fontWeight: '900' }}>{record.organization}</Text>
                  <Text style={{ color: C.muted, fontSize: 14 }}>{record.role}</Text>
                </View>
                <View style={{ backgroundColor: C.mintSoft, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 9 }}>
                  <Text style={{ color: C.green, fontSize: 10, fontWeight: '900' }}>{statusLabels[record.status]}</Text>
                </View>
              </View>
              {record.appliedOn ? <Body>Applied on {record.appliedOn}</Body> : null}
              {record.nextStep ? <View style={{ backgroundColor: '#f3f7f6', borderRadius: 11, padding: 11, gap: 3 }}>
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>NEXT STEP</Text>
                <Text style={{ color: C.ink, fontSize: 13, lineHeight: 19 }}>{record.nextStep}</Text>
                {record.nextStepDueDate ? <Text style={{ color: C.green, fontSize: 11, fontWeight: '800' }}>By {record.nextStepDueDate}</Text> : null}
              </View> : null}
              <Card style={{ backgroundColor: '#fbfdfd', padding: 12 }}>
                <SectionTitle>Requirement phrase check</SectionTitle>
                {coverage.length ? <Body>{exactPhraseCount} of {coverage.length} phrases found in Profile skills or Evidence tags.</Body> : <Body>No requirement phrases saved. Edit this record to add up to 20 phrases.</Body>}
                {coverage.map((result, index) => {
                  const matched = result.profileSkill !== null || result.evidenceTags.length > 0;
                  const normalized = normalizeRequirementPhrase(result.requirement);
                  const manualLinks = (record.requirementEvidenceLinks ?? []).filter((link) => normalizeRequirementPhrase(link.requirement) === normalized);
                  const linkedEvidenceIds = new Set(manualLinks.map((link) => link.evidenceId));
                  const currentEvidenceOptions = state.evidenceItems.filter((evidence) => !linkedEvidenceIds.has(evidence.id));
                  return (
                    <View key={`${index}-${result.requirement}`} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 11, padding: 11, gap: 8, backgroundColor: '#ffffff' }}>
                      <Text style={{ color: C.ink, fontSize: 14, fontWeight: '900' }}>{result.requirement}</Text>
                      {result.profileSkill ? <Text style={{ color: C.green, fontSize: 12, fontWeight: '800' }}>Exact Profile skill: {result.profileSkill}</Text> : null}
                      {result.evidenceTags.map((source) => <Text key={`${source.evidenceId}-${source.tag}`} style={{ color: C.muted, fontSize: 12 }}>Exact Evidence tag: {source.evidenceTitle} · {source.tag}</Text>)}
                      {!matched ? <Body>No exact Profile skill or Evidence tag found. This phrase remains unmatched; a manually linked story does not change the phrase check.</Body> : null}
                      {manualLinks.map((link) => {
                        const liveSource = state.evidenceItems.find((evidence) => evidence.id === link.evidenceId);
                        return (
                          <View key={`${link.evidenceId}-${link.linkedAt}`} style={{ backgroundColor: '#f3f7f6', borderRadius: 9, padding: 10, gap: 6 }}>
                            <Text style={{ color: C.green, fontSize: 10, fontWeight: '900' }}>CANDIDATE-LINKED · NOT VERIFIED</Text>
                            <Text style={{ color: C.ink, fontSize: 12, fontWeight: '800' }}>Source: Evidence Library · {link.snapshot.title}</Text>
                            <Text style={{ color: C.muted, fontSize: 10 }}>Record {link.evidenceId} · linked {link.linkedAt.slice(0, 10)}</Text>
                            <Text style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>Original context: {link.snapshot.context}</Text>
                            <Text style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>Original action: {link.snapshot.action}</Text>
                            <Text style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>Original result: {link.snapshot.result}</Text>
                            {sourceChanged(liveSource, link.snapshot) ? <Body>The Evidence Library item has changed since linking; the original snapshot above is preserved.</Body> : null}
                            {!liveSource ? <Body>The Evidence Library item is no longer present. This preserved snapshot remains for provenance.</Body> : null}
                            <Button secondary onPress={() => confirmUnlink(record.id, result.requirement, link.evidenceId)}>Remove evidence link</Button>
                          </View>
                        );
                      })}
                      {manualLinks.length >= MAX_EVIDENCE_LINKS_PER_REQUIREMENT ? <Body>Link limit reached: up to {MAX_EVIDENCE_LINKS_PER_REQUIREMENT} examples per requirement.</Body> : currentEvidenceOptions.length ? (
                        <Button secondary onPress={() => setLinkTarget({ applicationId: record.id, requirement: result.requirement })}>Link an Evidence Library example manually</Button>
                      ) : <Body>{state.evidenceItems.length ? 'All current Evidence Library examples are already linked to this requirement.' : 'Add a fictional example in the Evidence Library before linking it here.'}</Body>}
                    </View>
                  );
                })}
                <Body>Exact phrase comparison only; no synonyms, story-text search, or fit inference. A match is not proof of qualification.</Body>
              </Card>
              <Card style={{ backgroundColor: '#fbfdfd', padding: 12 }}>
                <SectionTitle>Follow-up history</SectionTitle>
                <Body>{(record.followUpHistory ?? []).length} / {MAX_FOLLOW_UP_EVENTS} events saved. Newest dates appear first.</Body>
                {sortFollowUpEvents(record.followUpHistory ?? []).map((event) => (
                  <View key={event.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 11, padding: 10, gap: 5 }}>
                    <Text style={{ color: C.ink, fontWeight: '900' }}>{event.date} · {followUpLabels[event.type]}</Text>
                    <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>{event.note}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button secondary onPress={() => openFollowUp(record.id, event)}>Edit</Button></View><View style={{ flex: 1 }}><Button secondary onPress={() => confirmDeleteFollowUp(record.id, event)}>Delete</Button></View></View>
                  </View>
                ))}
                {(record.followUpHistory ?? []).length >= MAX_FOLLOW_UP_EVENTS ? <Body>Limit reached: editing remains available, but adding event 51 is rejected and all 50 events are preserved.</Body> : null}
                <Button secondary disabled={(record.followUpHistory ?? []).length >= MAX_FOLLOW_UP_EVENTS} onPress={() => openFollowUp(record.id)}>+ Add follow-up event</Button>
              </Card>
              <Card style={{ backgroundColor: '#fbfdfd', padding: 12 }}>
                <SectionTitle>Application materials draft</SectionTitle>
                <Body>{record.materialsDraft ? `Draft saved locally · ${new Date(record.materialsDraft.updatedAt).toLocaleString()}` : 'No draft saved yet.'} Build an editable outline from this application’s saved requirement phrases and candidate-selected evidence snapshots.</Body>
                <Body>This tool does not invent facts, interpret requirements, score fit, use live AI, fetch jobs, or send or submit an application. Review every detail yourself.</Body>
                <Body>Export creates a plain-text copy of the current editor, including unsaved changes. It stays local unless you choose a destination in the device share sheet. Use fictional data only.</Body>
                {materialsDraftApplicationId === record.id && workingMaterialsDraft ? (
                  <>
                    <LabeledInput
                      accessibilityLabel={`Materials draft for ${record.role} at ${record.organization}`}
                      label="Editable draft text · review before use"
                      value={workingMaterialsDraft.body}
                      onChangeText={(body) => setWorkingMaterialsDraft((current) => current ? { ...current, body: body.slice(0, MAX_APPLICATION_MATERIALS_DRAFT_LENGTH) } : current)}
                      multiline
                      maxLength={MAX_APPLICATION_MATERIALS_DRAFT_LENGTH}
                    />
                    <SectionTitle>Source provenance · {workingMaterialsDraft.sources.length} snapshot{workingMaterialsDraft.sources.length === 1 ? '' : 's'}</SectionTitle>
                    <Body>These original candidate-selected snapshots were captured when this outline was prepared. They remain visible if a live Evidence Library item changes or is removed.</Body>
                    {workingMaterialsDraft.sources.length ? workingMaterialsDraft.sources.map((source, index) => (
                      <Card key={`${source.evidenceId}-${source.linkedAt}-${index}`} style={{ backgroundColor: '#f3f7f6', padding: 11 }}>
                        <Text style={{ color: C.green, fontSize: 10, fontWeight: '900' }}>CANDIDATE-SELECTED · NOT VERIFIED</Text>
                        <Text style={{ color: C.ink, fontSize: 13, fontWeight: '800' }}>Requirement: {source.requirement}</Text>
                        <Text style={{ color: C.muted, fontSize: 11 }}>Evidence Library · {source.snapshot.title} · record {source.evidenceId} · linked {source.linkedAt} · source updated {source.snapshot.updatedAt}</Text>
                        <Body>Snapshot context: {source.snapshot.context}</Body>
                        <Body>Snapshot action: {source.snapshot.action}</Body>
                        <Body>Snapshot result: {source.snapshot.result}</Body>
                      </Card>
                    )) : <Body>No candidate-selected source snapshots were included. Requirements remain prompts for you to address.</Body>}
                    <Button secondary onPress={() => router.push('/evidence')}>Open Evidence Library</Button>
                    <Button secondary onPress={() => refreshMaterialsDraft(record)}>Build fresh outline</Button>
                    <Button onPress={() => saveMaterialsDraft(record)}>Save draft on this phone</Button>
                    <Button secondary disabled={exportingMaterialsDraft} onPress={() => void exportMaterialsDraft(record)}>{exportingMaterialsDraft ? 'Preparing text file…' : 'Export current draft (.txt)'}</Button>
                    <Button secondary onPress={() => { setMaterialsDraftApplicationId(null); setWorkingMaterialsDraft(null); }}>Close draft editor</Button>
                  </>
                ) : <Button secondary onPress={() => openMaterialsDraft(record)}>{record.materialsDraft ? 'Open materials draft' : 'Prepare a materials draft outline'}</Button>}
              </Card>
              <Button secondary onPress={() => openEdit(record)}>Edit / update status</Button>
              <Button secondary onPress={() => confirmDelete(record)}>Delete record</Button>
            </Card>
          );
        })}
      </Page>
      <Modal visible={followUpApplicationId !== null} transparent animationType="slide" onRequestClose={() => setFollowUpApplicationId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,32,43,.42)' }}>
          <View style={{ backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: C.ink, fontSize: 20, fontWeight: '900' }}>{editingFollowUp ? 'Edit follow-up event' : 'Add follow-up event'}</Text>
            <Body>Use fictional, non-sensitive notes only. Notes are trimmed and limited to 500 characters.</Body>
            <LabeledInput accessibilityLabel="Follow-up date" label="Date · YYYY-MM-DD" value={followUpDraft.date} onChangeText={(date) => setFollowUpDraft((current) => ({ ...current, date: date.slice(0, 10) }))} placeholder="2026-11-02" maxLength={10} keyboardType="numbers-and-punctuation" />
            <Text style={{ color: C.ink, fontSize: 12, fontWeight: '800' }}>Type</Text>
            <SegmentedTabs items={FOLLOW_UP_EVENT_TYPES.map((type) => ({ value: type, label: followUpLabels[type] }))} value={followUpDraft.type} onChange={(type) => setFollowUpDraft((current) => ({ ...current, type }))} />
            <LabeledInput accessibilityLabel="Follow-up note" label="Note" value={followUpDraft.note} onChangeText={(note) => setFollowUpDraft((current) => ({ ...current, note: note.slice(0, 500) }))} placeholder="Fictional follow-up note" multiline maxLength={500} />
            <Button onPress={saveFollowUp}>{editingFollowUp ? 'Save changes' : 'Save follow-up'}</Button>
            <Button secondary onPress={() => setFollowUpApplicationId(null)}>Cancel</Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,32,43,.42)' }}>
          <View style={{ maxHeight: '90%', backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              <Text accessibilityRole="header" style={{ color: C.ink, fontSize: 20, fontWeight: '900' }}>{editing ? 'Edit application' : 'Add an application'}</Text>
              <Body>Use fictional details only. This record is stored on this phone.</Body>
              <LabeledInput label="Organization" value={draft.organization} onChangeText={(organization) => setDraft((current) => ({ ...current, organization: organization.slice(0, 120) }))} placeholder="Example: Cedar & Finch Labs" maxLength={120} />
              <LabeledInput label="Role" value={draft.role} onChangeText={(role) => setDraft((current) => ({ ...current, role: role.slice(0, 100) }))} placeholder="Example: Product Designer" maxLength={100} />
              <View style={{ gap: 6 }}>
                <Text style={{ color: C.ink, fontSize: 12, fontWeight: '800' }}>Status</Text>
                <SegmentedTabs items={APPLICATION_STATUSES.map((status) => ({ value: status, label: statusLabels[status] }))} value={draft.status} onChange={(status) => setDraft((current) => ({ ...current, status }))} />
              </View>
              <LabeledInput label="Applied on (optional)" value={draft.appliedOn || ''} onChangeText={(appliedOn) => setDraft((current) => ({ ...current, appliedOn: appliedOn.slice(0, 10) }))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
              <LabeledInput label="Next step" value={draft.nextStep} onChangeText={(nextStep) => setDraft((current) => ({ ...current, nextStep: nextStep.slice(0, 280) }))} placeholder="One small action you choose" multiline maxLength={280} />
              <LabeledInput label="Next-step date (optional)" value={draft.nextStepDueDate || ''} onChangeText={(nextStepDueDate) => setDraft((current) => ({ ...current, nextStepDueDate: nextStepDueDate.slice(0, 10) }))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
              <LabeledInput
                accessibilityLabel="Role requirements"
                label="Role requirements (optional · one phrase per line · up to 20, 80 characters each)"
                value={draft.requirementsText}
                onChangeText={(requirementsText) => setDraft((current) => ({ ...current, requirementsText: requirementsText.slice(0, 2000) }))}
                placeholder={'User research\nFacilitation\nProduct analytics'}
                multiline
                maxLength={2000}
              />
              <Body>Checks compare each whole phrase after trimming, collapsing whitespace, removing trailing punctuation, and ignoring case. Only Profile skills and Evidence skill tags count; linked stories do not.</Body>
              <View style={{ flexDirection: 'row', gap: 9 }}>
                <Button secondary onPress={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
                <Button onPress={save}>Save application</Button>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={linkTarget !== null} transparent animationType="slide" onRequestClose={() => setLinkTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,32,43,.42)' }}>
          <View style={{ maxHeight: '82%', backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: C.ink, fontSize: 20, fontWeight: '900' }}>Choose an evidence example</Text>
            <Body>Requirement: {linkTarget?.requirement ?? ''}. This manual source link is separate from the exact phrase check and does not verify qualification.</Body>
            <Body>{Math.max(0, MAX_EVIDENCE_LINKS_PER_REQUIREMENT - linkCount)} link{MAX_EVIDENCE_LINKS_PER_REQUIREMENT - linkCount === 1 ? '' : 's'} remaining for this requirement.</Body>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
              {availableEvidence.map((evidence) => (
                <Card key={evidence.id}>
                  <SectionTitle>{evidence.title}</SectionTitle>
                  <Body>{evidence.context}</Body>
                  <Button onPress={() => linkSelectedEvidence(evidence.id)}>Link this example</Button>
                </Card>
              ))}
              {!availableEvidence.length ? <Card><Body>{state.evidenceItems.length ? 'All existing examples are already linked to this requirement.' : 'No examples yet. Add a fictional example in the Evidence Library first.'}</Body><Button secondary onPress={() => { setLinkTarget(null); router.push('/evidence'); }}>Open Evidence Library</Button></Card> : null}
            </ScrollView>
            <Button secondary onPress={() => setLinkTarget(null)}>Close</Button>
          </View>
        </View>
      </Modal>
    </>
  );
}
