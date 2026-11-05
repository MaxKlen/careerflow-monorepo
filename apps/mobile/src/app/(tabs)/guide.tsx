import React from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { candidateGuideSafetyNote, candidateGuideSections } from '../../guidance';
import { Body, Button, Card, C, Header, Notice, Page, SectionTitle } from '../../ui';

export default function GuideScreen() {
  return (
    <Page>
      <Header
        title="A practical start"
        subtitle="Make this workspace yours—using examples first. A short guide to what the mobile preview can and cannot do."
        titleAccessibilityRole="header"
      />

      <Notice title="START SAFELY" titleAccessibilityRole="header">{candidateGuideSafetyNote}</Notice>

      {candidateGuideSections.map((section) => (
        <Card key={section.id}>
          <Text style={{ color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }}>
            {section.eyebrow}
          </Text>
          <SectionTitle accessibilityRole="header">{section.title}</SectionTitle>
          {section.paragraphs.map((paragraph, index) => (
            <Body key={`${section.id}-paragraph-${index}`}>{paragraph}</Body>
          ))}
          {section.bullets?.map((bullet) => (
            <View key={bullet} style={{ flexDirection: 'row', gap: 8 }}>
              <Text accessibilityElementsHidden style={{ color: C.green, fontWeight: '900' }}>•</Text>
              <Body style={{ flex: 1 }}>{bullet}</Body>
            </View>
          ))}
          {section.id === 'tasks' ? (
            <Button secondary onPress={() => router.push('/tasks')}>Open task board</Button>
          ) : null}
          {section.id === 'profile' ? (
            <View style={{ gap: 8 }}>
              <Button secondary onPress={() => router.push('/profile')}>Open career profile</Button>
              <Button secondary onPress={() => router.push('/journey')}>Open journey checkpoints</Button>
            </View>
          ) : null}
          {section.id === 'evidence' ? (
            <Button secondary onPress={() => router.push('/evidence')}>Open Evidence Library</Button>
          ) : null}
          {section.id === 'documents' ? (
            <Button secondary onPress={() => router.push('/profile')}>Open Profile & documents</Button>
          ) : null}
          {section.id === 'devices' ? (
            <Button secondary onPress={() => router.push('/backup')}>Open local backup &amp; restore</Button>
          ) : null}
        </Card>
      ))}
    </Page>
  );
}
