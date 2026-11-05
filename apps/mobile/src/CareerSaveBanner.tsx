import React from 'react';
import { Text, View } from 'react-native';
import { useCareer } from './CareerContext';
import { careerSaveNotice } from './careerSaveStatus';
import { Button, C } from './ui';

export default function CareerSaveBanner() {
  const { careerSaveStatus, retryCareerSave } = useCareer();
  const message = careerSaveNotice(careerSaveStatus);
  if (!message) return null;

  const needsAttention = careerSaveStatus === 'failed';
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: needsAttention ? '#fff0ee' : '#fff5df', paddingHorizontal: 18, paddingVertical: 10, gap: 8 }}>
      <Text
        accessibilityRole={needsAttention ? 'alert' : undefined}
        style={{ color: needsAttention ? C.red : C.ink, fontSize: 13, fontWeight: '800' }}
      >
        {message}
      </Text>
      {needsAttention ? <Button secondary onPress={() => { void retryCareerSave(); }}>Retry save</Button> : null}
    </View>
  );
}
