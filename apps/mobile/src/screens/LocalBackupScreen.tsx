import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCareer } from '../CareerContext';
import { createLocalBackup, MAX_LOCAL_BACKUP_BYTES, parseLocalBackup } from '../localBackup';
import { restoreLocalBackup } from '../storage';
import { Body, Button, Card, C, Header, Notice, Page, SectionTitle } from '../ui';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LocalBackupScreen() {
  const { ready, state, workspace, replaceLocalData } = useCareer();
  const [working, setWorking] = useState(false);

  const exportBackup = async () => {
    try {
      setWorking(true);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot open a share sheet right now. Your local data has not changed.');
        return;
      }
      const contents = createLocalBackup(state, workspace);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File(Paths.cache, `careerflow-mobile-backup-${stamp}.json`);
      await file.write(contents);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Save a private CareerFlow backup',
      });
      Alert.alert('Share sheet closed', 'If you chose Save to Files or another destination, verify that the JSON backup is there. CareerFlow does not keep a separate cloud copy.');
    } catch (error) {
      Alert.alert('Backup unavailable', errorMessage(error, 'The local backup could not be prepared. Your workspace was not changed.'));
    } finally {
      setWorking(false);
    }
  };

  const applyBackup = async (raw: string) => {
    try {
      setWorking(true);
      const backup = await restoreLocalBackup(raw);
      replaceLocalData(backup.career, backup.workspace);
      Alert.alert('Backup restored', 'The validated backup replaced the local tracker, Job Search entries, and document workspace on this phone.');
    } catch (error) {
      Alert.alert('Restore not completed', errorMessage(error, 'The backup could not be saved. Check the workspace before retrying in case device storage stopped during the restore.'));
    } finally {
      setWorking(false);
    }
  };

  const chooseBackup = async () => {
    try {
      setWorking(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (typeof asset.size === 'number' && asset.size > MAX_LOCAL_BACKUP_BYTES) {
        throw new Error('This backup is larger than the 5 MiB limit.');
      }
      const raw = await new File(asset.uri).text();
      const backup = parseLocalBackup(raw);
      setWorking(false);
      Alert.alert(
        'Replace local workspace?',
        `This valid backup from ${new Date(backup.exportedAt).toLocaleString()} will replace the tracker, profile, applications, local Job Search entries, evidence, and document drafts currently on this phone. It will not merge. Export the current data first if you may need it.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace local data', style: 'destructive', onPress: () => void applyBackup(raw) },
        ],
      );
    } catch (error) {
      Alert.alert('Backup not imported', errorMessage(error, 'The selected file could not be read. Your workspace was not changed.'));
    } finally {
      setWorking(false);
    }
  };

  if (!ready) return <Page><Body>Loading local workspace…</Body></Page>;

  return (
    <Page>
      <Header
        title="Local backup & restore"
        subtitle="Make a private copy of this phone’s local CareerFlow workspace, or restore one you already have."
        titleAccessibilityRole="header"
      />
      <Notice title="PRIVATE FILE · NOT ENCRYPTED" titleAccessibilityRole="header">
        The JSON backup can contain profile, application, local Job Search entries, evidence, CV, LinkedIn, and other document text. CareerFlow does not encrypt it. Use fictional, non-sensitive examples and save the file only somewhere private that you control.
      </Notice>
      <Card>
        <SectionTitle accessibilityRole="header">Create or restore a copy</SectionTitle>
        <Body>Export writes one JSON file through your phone’s share sheet. Choose a destination such as Files and check that the file was saved.</Body>
        <Body>Restore accepts a validated CareerFlow mobile backup up to 5 MiB. Import replaces the current local workspace; it does not merge records. You’ll be asked to confirm before anything is replaced.</Body>
        <Button onPress={() => void exportBackup()} disabled={working}>{working ? 'Working…' : 'Export local JSON backup'}</Button>
        <Button secondary onPress={() => void chooseBackup()} disabled={working}>{working ? 'Working…' : 'Choose backup to restore'}</Button>
      </Card>
      <Card>
        <SectionTitle accessibilityRole="header">Before changing or clearing app data</SectionTitle>
        <Text style={{ color: C.ink, fontSize: 13, lineHeight: 20 }}>
          Export and verify a private copy before reinstalling the app, clearing its data, or moving to another phone. To restore, choose that file here and confirm replacement. If the local data is lost and no backup file exists, CareerFlow cannot recover it. This is a manual file copy—not automatic backup, cloud sync, or cross-device account recovery.
        </Text>
      </Card>
    </Page>
  );
}
