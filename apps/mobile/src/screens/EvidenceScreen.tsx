import React, { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { EvidenceRecord } from '../domain';
import { sortEvidenceRecords, validateEvidenceDraft } from '../evidence';
import type { EvidenceDraft } from '../evidence';
import { useCareer } from '../CareerContext';
import { Body, Button, Card, C, Header, LabeledInput, Notice, Page, SectionTitle } from '../ui';

const limits = { title: 100, context: 500, action: 500, result: 500 } as const;

type EditingDraft = Omit<EvidenceDraft, 'skillTags'> & { skillTagsText: string };
const blankEditingDraft: EditingDraft = { title: '', context: '', action: '', result: '', skillTagsText: '' };

export default function EvidenceScreen() {
  const { ready, state, careerSaveStatus, addEvidence, updateEvidence, removeEvidence } = useCareer();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditingDraft>({ ...blankEditingDraft });
  const [notice, setNotice] = useState('');
  const successToast = careerSaveStatus === 'saved' ? notice : '';
  const records = useMemo(() => sortEvidenceRecords(state.evidenceItems, query), [state.evidenceItems, query]);

  if (!ready) return <Page><Body>Loading local evidence examples…</Body></Page>;

  const openNew = () => {
    setDraft({ ...blankEditingDraft });
    setEditingId('new');
  };
  const openEdit = (record: EvidenceRecord) => {
    setDraft({ ...record, skillTagsText: record.skillTags.join(', ') });
    setEditingId(record.id);
  };
  const save = () => {
    const skillTags = [...new Set(draft.skillTagsText.split(',').map((tag) => tag.trim()).filter(Boolean))];
    const cleanDraft: EvidenceDraft = {
      title: draft.title.trim(),
      context: draft.context.trim(),
      action: draft.action.trim(),
      result: draft.result.trim(),
      skillTags,
    };
    const errors = validateEvidenceDraft(cleanDraft);
    if (Object.keys(errors).length) {
      Alert.alert('Check evidence details', Object.values(errors)[0]);
      return;
    }
    if (editingId && editingId !== 'new') updateEvidence(editingId, cleanDraft);
    else addEvidence(cleanDraft);
    setEditingId(null);
    setNotice('Saved on this phone. This fictional example stays in this app’s local storage. It is not verified or matched to a job.');
  };
  const confirmDelete = (record: EvidenceRecord) => {
    Alert.alert('Delete evidence example?', `Remove “${record.title}” from this phone?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeEvidence(record.id) },
    ]);
  };
  const setText = (key: keyof Omit<EditingDraft, 'skillTagsText'>, value: string) => {
    setDraft((current) => ({ ...current, [key]: value.slice(0, limits[key]) }));
  };
  const open = editingId !== null;

  return (
    <Page>
      <Button secondary onPress={() => router.back()}>← Back to workspace</Button>
      <Header title="Evidence library" subtitle="Keep reusable fictional examples of what happened, what you did, and what changed." titleAccessibilityRole="header" />
      <Notice title="FICTIONAL DATA · LOCAL ONLY">
        Use made-up examples only. Notes stay on this phone and are not encrypted or synced; they are not automatically backed up, though you can make a manual local backup. No documents are uploaded. Tags can appear in an exact phrase check, and you may link an example yourself to an application requirement; neither action verifies experience or proves qualification.
      </Notice>
      {successToast ? <Text accessibilityLiveRegion="polite" style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>{successToast}</Text> : null}
      <Button onPress={openNew}>+ Add evidence example</Button>

      {open ? (
        <Card>
          <SectionTitle>{editingId === 'new' ? 'Add an evidence example' : 'Edit evidence example'}</SectionTitle>
          <Body>Use a made-up project or exercise. Include context, your action, and the result.</Body>
          <LabeledInput accessibilityLabel="Example title" label="Example title" value={draft.title} onChangeText={(value) => setText('title', value)} placeholder="Improved a fictional onboarding flow" maxLength={limits.title} />
          <LabeledInput accessibilityLabel="Context" label="Context · what was happening?" value={draft.context} onChangeText={(value) => setText('context', value)} placeholder="Describe the made-up project or exercise." multiline maxLength={limits.context} />
          <LabeledInput accessibilityLabel="Action" label="Action · what did you do?" value={draft.action} onChangeText={(value) => setText('action', value)} placeholder="Capture your specific contribution." multiline maxLength={limits.action} />
          <LabeledInput accessibilityLabel="Result" label="Result · what changed or was learned?" value={draft.result} onChangeText={(value) => setText('result', value)} placeholder="State an outcome without unsupported metrics." multiline maxLength={limits.result} />
          <LabeledInput accessibilityLabel="Skill tags" label="Skill tags (optional, comma-separated; up to 8)" value={draft.skillTagsText} onChangeText={(skillTagsText) => setDraft((current) => ({ ...current, skillTagsText: skillTagsText.slice(0, 360) }))} placeholder="research, facilitation" maxLength={360} />
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Button secondary onPress={() => setEditingId(null)}>Cancel</Button>
            <Button onPress={save}>Save evidence</Button>
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Search evidence examples</SectionTitle>
        <LabeledInput accessibilityLabel="Search evidence" label="Search title, story, or skill" value={query} onChangeText={setQuery} placeholder="Try a skill or keyword" returnKeyType="search" />
        <Body>{records.length} {records.length === 1 ? 'example' : 'examples'} shown.</Body>
      </Card>

      {records.length ? records.map((record) => (
        <Card key={record.id}>
          <Text style={{ color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>FICTIONAL EXAMPLE</Text>
          <SectionTitle>{record.title}</SectionTitle>
          {([
            ['CONTEXT', record.context],
            ['ACTION', record.action],
            ['RESULT', record.result],
          ] as const).map(([label, value]) => (
            <View key={label} style={{ gap: 3 }}>
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>{label}</Text>
              <Body style={{ color: C.ink }}>{value}</Body>
            </View>
          ))}
          {record.skillTags.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{record.skillTags.map((tag) => <Text key={tag} style={{ color: C.green, backgroundColor: C.mintSoft, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '800' }}>{tag}</Text>)}</View> : null}
          <Button secondary onPress={() => openEdit(record)}>Edit example</Button>
          <Button secondary onPress={() => confirmDelete(record)}>Delete example</Button>
        </Card>
      )) : (
        <Card>
          <SectionTitle>{state.evidenceItems.length ? 'No examples match that search' : 'Start with one made-up example'}</SectionTitle>
          <Body>Record a fictional context, action, and result. The library organizes notes only; it does not verify or match them.</Body>
          {!state.evidenceItems.length ? <Button secondary onPress={openNew}>Add a fictional example</Button> : null}
        </Card>
      )}
      <Body>Evidence notes are editable user-entered examples—not proof, job matching, or automated CV tailoring.</Body>
    </Page>
  );
}
