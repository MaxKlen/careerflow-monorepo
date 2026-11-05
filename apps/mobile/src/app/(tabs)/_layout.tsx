import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const tabs = [
  { name: 'index', title: 'Home', icon: '⌂' },
  { name: 'tasks', title: 'Tasks', icon: '✓' },
  { name: 'profile', title: 'Profile', icon: '◉' },
  { name: 'journey', title: 'Journey', icon: '✦' },
  { name: 'coach', title: 'Coach', icon: '✧' },
  { name: 'guide', title: 'Guide', icon: '?' },
  { name: 'join', title: 'Join', icon: '+' },
  { name: 'admin', title: 'Admin', icon: '▤' },
] as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#197a67',
        tabBarInactiveTintColor: '#647783',
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 9, fontWeight: '800', marginBottom: 2 },
        tabBarIconStyle: { marginTop: 2 },
        tabBarItemStyle: { flex: 1, minWidth: 0, paddingHorizontal: 0 },
        tabBarStyle: {
          height: 54 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 4),
          borderTopColor: '#dce6e9',
          backgroundColor: '#ffffff',
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: `${tab.title} tab`,
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18, lineHeight: 21 }}>{tab.icon}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}
