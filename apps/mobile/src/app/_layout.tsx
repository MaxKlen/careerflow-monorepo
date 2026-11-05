import React from 'react';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CareerProvider, useCareer } from '../CareerContext';
import CareerSaveBanner from '../CareerSaveBanner';
import MehAiWidget from '../MehAiWidget';
import { Button } from '../ui';

function CareerAppShell() {
  const { ready, loadFailed, retryLoad } = useCareer();

  return (
    <View style={{ flex: 1 }}>
      <View
        accessibilityElementsHidden={!ready}
        importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}
        style={{ flex: 1 }}
      >
        <CareerSaveBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="backup" />
          <Stack.Screen name="job-search" />
        </Stack>
        <MehAiWidget />
      </View>
      {!ready ? (
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          pointerEvents="auto"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: '#f7faf9',
            justifyContent: 'center',
            padding: 24,
            gap: 14,
            zIndex: 10,
          }}
        >
          {loadFailed ? (
            <>
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={{ color: '#10202b', fontSize: 16, lineHeight: 23, fontWeight: '700' }}
              >
                Could not load your saved data from this phone. Your saved data has not been overwritten. Retry to load it again.
              </Text>
              <Button onPress={() => { void retryLoad(); }}>Retry loading</Button>
            </>
          ) : (
            <Text accessibilityLiveRegion="polite" style={{ color: '#647783', fontSize: 15 }}>
              Loading your offline workspace…
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CareerProvider>
        <CareerAppShell />
      </CareerProvider>
    </SafeAreaProvider>
  );
}
