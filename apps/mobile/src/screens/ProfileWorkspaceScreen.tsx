import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCareer } from '../CareerContext';
import { getRecommendations, WritingSection } from '../recommendations';
import { Button, Card, Header, LabeledInput, Notice, Page, SegmentedTabs, SectionTitle, Body, C } from '../ui';

type WorkspaceTab = 'profile' | 'cv' | 'linkedin' | 'letters';

const profileFields: { key: 'name' | 'headline' | 'targetRole' | 'targetIndustry' | 'summary' | 'skills' | 'goals'; label: string; hint: string; section?: WritingSection; multiline?: boolean }[] = [
  { key: 'name', label: 'Name', hint: 'Your name' },
  { key: 'headline', label: 'Professional headline', hint: 'Role, specialty, or value you bring', section: 'headline' },
  { key: 'targetRole', label: 'Target role', hint: 'The role you want next' },
  { key: 'targetIndustry', label: 'Target industry', hint: 'The space you want to explore' },
  { key: 'summary', label: 'Professional summary', hint: 'Your experience, strengths, and direction', section: 'summary', multiline: true },
  { key: 'skills', label: 'Skills', hint: 'Separate skills with commas', section: 'skills', multiline: true },
  { key: 'goals', label: 'Career goal', hint: 'What do you want next?', section: 'goals', multiline: true },
];

function RecommendationCard({ section, value }: { section: WritingSection; value: string }) {
  const suggestions = getRecommendations(section, value);
  return (
    <View style={{ backgroundColor: '#f1f8f6', borderRadius: 11, padding: 11, gap: 5 }}>
      <Text style={{ color: C.green, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>ON-DEVICE SUGGESTIONS</Text>
      {suggestions.map((suggestion, index) => <Text key={`${section}-${index}`} style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>• {suggestion}</Text>)}
    </View>
  );
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlDocument(title: string, content: string) {
  const paragraphs = escapeHtml(content || 'No content yet.').split(/\r?\n/).map((line) => `<p>${line || '&nbsp;'}</p>`).join('');
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#10202b;margin:36px;font-size:12pt;line-height:1.5}h1{font-size:22pt;border-bottom:2px solid #53d6b2;padding-bottom:8px}p{white-space:pre-wrap;margin:0 0 8px}.foot{margin-top:24px;color:#647783;font-size:9pt}</style></head><body><h1>${escapeHtml(title)}</h1>${paragraphs}<div class="foot">Created in CareerFlow · saved locally on your device</div></body></html>`;
}

export default function ProfileWorkspaceScreen() {
  const { ready, state, workspace, careerSaveStatus, updateProfile, updateWorkspace } = useCareer();
  const [tab, setTab] = useState<WorkspaceTab>('profile');
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const successToast = careerSaveStatus === 'saved' ? notice : '';
  if (!ready) return <Page><Body>Loading your local profile…</Body></Page>;

  const saveLocally = () => {
    updateWorkspace({ savedAt: new Date().toISOString() });
    setNotice('Saved on this phone. Your profile and document text remain in CareerFlow local storage. Nothing was uploaded.');
  };

  const exportPdf = async (title: string, content: string) => {
    try {
      setWorking(true);
      const result = await Print.printToFileAsync({ html: htmlDocument(title, content) });
      const shareAvailable = await Sharing.isAvailableAsync();
      if (shareAvailable) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: `Save or share ${title}` });
      } else {
        await Print.printAsync({ html: htmlDocument(title, content) });
      }
    } catch {
      Alert.alert('Export unavailable', 'The iPhone print or share sheet could not open. Your text remains saved locally.');
    } finally {
      setWorking(false);
    }
  };

  const printDocument = async (title: string, content: string) => {
    try {
      setWorking(true);
      await Print.printAsync({ html: htmlDocument(title, content) });
    } catch {
      Alert.alert('Print unavailable', 'The print sheet could not open. Your text remains saved locally.');
    } finally {
      setWorking(false);
    }
  };

  const importTextCv = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const content = await new File(asset.uri).text();
      updateWorkspace({ cvText: content.slice(0, 60000), cvFileName: asset.name });
      setNotice('CV text imported. The file was read on this phone only. Automatic PDF and Word extraction is not enabled in this Expo Go build.');
    } catch {
      Alert.alert('Import unavailable', 'Choose a plain-text CV (.txt or .md), or paste text from a PDF/Word document into the CV field.');
    }
  };

  const updateLinkedIn = (key: keyof typeof workspace.linkedIn, value: string) => {
    updateWorkspace({ linkedIn: { ...workspace.linkedIn, [key]: value } });
  };

  const profileText = [
    `Name: ${state.profile.name}`,
    `Headline: ${state.profile.headline}`,
    `Target role: ${state.profile.targetRole}`,
    `Industry: ${state.profile.targetIndustry}`,
    `Summary: ${state.profile.summary}`,
    `Skills: ${state.profile.skills}`,
    `Career goal: ${state.profile.goals}`,
  ].join('\n\n');

  const linkedInText = [
    `Headline\n${workspace.linkedIn.headline}`,
    `About\n${workspace.linkedIn.about}`,
    `Experience\n${workspace.linkedIn.experience}`,
    `Skills\n${workspace.linkedIn.skills}`,
    `Education\n${workspace.linkedIn.education}`,
  ].join('\n\n');

  const generateCoverLetter = () => {
    const name = state.profile.name.trim() || 'Your name';
    const role = state.profile.targetRole.trim() || 'the role';
    const summary = state.profile.summary.trim() || 'My experience and skills align with the needs of this opportunity.';
    const text = `Dear Hiring Team,\n\nI am writing to express my interest in ${role}. ${summary}\n\nMy background includes ${state.profile.skills.trim() || 'skills relevant to the position'}. I would welcome the opportunity to discuss how I can contribute and provide examples of my work.\n\nThank you for your consideration.\n\nSincerely,\n${name}`;
    updateWorkspace({ coverLetterText: text });
  };

  return (
    <Page>
      <Header title="Profile & documents" subtitle="Build, review, save, and print your career materials." />
      <Notice title="PRIVATE · ON THIS DEVICE">Career text stays in this app&apos;s local storage and is not sent to CareerFlow or LinkedIn. Suggestions use simple offline checks, not AI. Use your phone passcode; local app storage is not encrypted by CareerFlow.</Notice>
      <SegmentedTabs items={[{ value: 'profile', label: 'Profile' }, { value: 'cv', label: 'CV' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'letters', label: 'Letters & more' }]} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <>
          <Card>
            <SectionTitle>Career profile</SectionTitle>
            <Body>Update each section. Suggestions appear as you type and are generated on-device.</Body>
            {profileFields.map((field) => (
              <View key={field.key} style={{ gap: 7 }}>
                <LabeledInput label={field.label} value={state.profile[field.key]} onChangeText={(value) => updateProfile(field.key, value)} placeholder={field.hint} multiline={field.multiline} maxLength={field.multiline ? 5000 : 240} />
                {field.section ? <RecommendationCard section={field.section} value={state.profile[field.key]} /> : null}
              </View>
            ))}
            <Text style={{ color: C.muted, fontSize: 11 }}>Career profile saves automatically in this app.</Text>
            <Button secondary onPress={() => void exportPdf('Career Profile', profileText)} disabled={working}>{working ? 'Preparing…' : 'Save / share profile PDF'}</Button>
            <Button onPress={() => void printDocument('Career Profile', profileText)} disabled={working}>Print profile</Button>
          </Card>
        </>
      )}

      {tab === 'cv' && (
        <Card>
          <SectionTitle>CV / résumé</SectionTitle>
          <Body>Import a text CV or paste its text below. PDF/Word text extraction and scanned-document OCR are not included in this Expo Go preview.</Body>
          {workspace.cvFileName ? <Text style={{ color: C.green, fontSize: 11, fontWeight: '800' }}>Imported text file: {workspace.cvFileName}</Text> : null}
          <Button secondary onPress={() => void importTextCv()}>Import CV text (.txt / .md)</Button>
          <LabeledInput label="CV text" value={workspace.cvText} onChangeText={(value) => updateWorkspace({ cvText: value.slice(0, 60000) })} placeholder="Paste the text from your CV here. It stays on this device." multiline maxLength={60000} style={{ minHeight: 220 }} />
          <RecommendationCard section="cv" value={workspace.cvText} />
          <Text style={{ color: C.muted, fontSize: 11 }}>Saved locally on this phone. No file or text is uploaded.</Text>
          <Button secondary onPress={saveLocally}>Save CV locally</Button>
          <Button onPress={() => void exportPdf('CV', workspace.cvText)} disabled={working}>{working ? 'Preparing…' : 'Save / share CV PDF'}</Button>
          <Button secondary onPress={() => void printDocument('CV', workspace.cvText)} disabled={working}>Print CV</Button>
        </Card>
      )}

      {tab === 'linkedin' && (
        <Card>
          <SectionTitle>LinkedIn profile capture</SectionTitle>
          <Body>Copy and paste the sections you want reviewed. CareerFlow does not log in to, scrape, or send anything to LinkedIn.</Body>
          {([
            ['headline', 'Headline', 'Your LinkedIn headline', 'linkedinHeadline'],
            ['about', 'About', 'Paste your About section', 'linkedinAbout'],
            ['experience', 'Experience', 'Paste role descriptions and outcomes', 'experience'],
            ['skills', 'Skills', 'Paste your selected skills', 'skills'],
            ['education', 'Education', 'Paste relevant education or credentials', 'education'],
          ] as const).map(([key, label, placeholder, section]) => (
            <View key={key} style={{ gap: 7 }}>
              <LabeledInput label={label} value={workspace.linkedIn[key]} onChangeText={(value) => updateLinkedIn(key, value)} placeholder={placeholder} multiline={key !== 'headline'} maxLength={key === 'headline' ? 240 : 12000} />
              <RecommendationCard section={section} value={workspace.linkedIn[key]} />
            </View>
          ))}
          <Text style={{ color: C.muted, fontSize: 11 }}>LinkedIn content is stored locally in this app only.</Text>
          <Button secondary onPress={saveLocally}>Save LinkedIn capture</Button>
          <Button onPress={() => void exportPdf('LinkedIn Profile Notes', linkedInText)} disabled={working}>Save / share LinkedIn PDF</Button>
          <Button secondary onPress={() => void printDocument('LinkedIn Profile Notes', linkedInText)} disabled={working}>Print LinkedIn notes</Button>
        </Card>
      )}

      {tab === 'letters' && (
        <>
          <Card>
            <SectionTitle>Cover letter</SectionTitle>
            <Body>Draft and edit a letter locally. The starter draft uses your profile text; tailor it before sending.</Body>
            <Button secondary onPress={generateCoverLetter}>Create local starter draft</Button>
            <LabeledInput label="Cover letter text" value={workspace.coverLetterText} onChangeText={(value) => updateWorkspace({ coverLetterText: value.slice(0, 20000) })} placeholder="Write or paste a tailored cover letter." multiline maxLength={20000} style={{ minHeight: 220 }} />
            <RecommendationCard section="coverLetter" value={workspace.coverLetterText} />
            <Button secondary onPress={saveLocally}>Save letter locally</Button>
            <Button onPress={() => void exportPdf('Cover Letter', workspace.coverLetterText)} disabled={working}>{working ? 'Preparing…' : 'Save / share letter PDF'}</Button>
            <Button secondary onPress={() => void printDocument('Cover Letter', workspace.coverLetterText)} disabled={working}>Print cover letter</Button>
          </Card>
          <Card>
            <SectionTitle>Other career document</SectionTitle>
            <Body>Keep a notes page, interview answers, or another draft with your local materials.</Body>
            <LabeledInput label="Document title" value={workspace.otherDocumentTitle} onChangeText={(value) => updateWorkspace({ otherDocumentTitle: value.slice(0, 100) })} placeholder="Interview notes, portfolio summary…" maxLength={100} />
            <LabeledInput label="Document text" value={workspace.otherDocumentText} onChangeText={(value) => updateWorkspace({ otherDocumentText: value.slice(0, 20000) })} placeholder="Add text to keep or print." multiline maxLength={20000} style={{ minHeight: 160 }} />
            <RecommendationCard section="other" value={workspace.otherDocumentText} />
            <Button secondary onPress={saveLocally}>Save document locally</Button>
            <Button onPress={() => void exportPdf(workspace.otherDocumentTitle || 'Career Notes', workspace.otherDocumentText)} disabled={working}>Save / share PDF</Button>
            <Button secondary onPress={() => void printDocument(workspace.otherDocumentTitle || 'Career Notes', workspace.otherDocumentText)} disabled={working}>Print document</Button>
          </Card>
        </>
      )}
      {workspace.savedAt ? <Text style={{ color: C.muted, fontSize: 10, textAlign: 'center' }}>Last local save: {new Date(workspace.savedAt).toLocaleString()}</Text> : null}
      {successToast ? <Text accessibilityLiveRegion="polite" style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>{successToast}</Text> : null}
    </Page>
  );
}
