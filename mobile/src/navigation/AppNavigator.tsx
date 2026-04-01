import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { Colors } from '../lib/theme';
import DashboardScreen from '../screens/DashboardScreen';
import ClientsScreen from '../screens/ClientsScreen';
import PipelineScreen from '../screens/PipelineScreen';
import AlertsScreen from '../screens/AlertsScreen';
import LoginScreen from '../screens/LoginScreen';
import DocumentCaptureScreen from '../screens/DocumentCaptureScreen';
import CreditDashboardScreen from '../screens/client/CreditDashboardScreen';
import RepaymentCalendarScreen from '../screens/client/RepaymentCalendarScreen';
import DocumentUploadScreen from '../screens/client/DocumentUploadScreen';
import FundingProgressScreen from '../screens/client/FundingProgressScreen';

// ─── Tab Icon (text-based placeholder, replace with icon library if desired) ──

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    // Advisor tabs
    Dashboard: '⊞',
    Clients: '◎',
    Pipeline: '≡',
    Alerts: '◉',
    Profile: '⊙',
    // Client tabs
    Credit: '◈',
    Repayment: '◷',
    Funding: '▲',
    Documents: '⊟',
  };
  return (
    <Text style={{ fontSize: 20, color: focused ? Colors.gold : Colors.gray400 }}>
      {icons[label] ?? '·'}
    </Text>
  );
}

// ─── Navigator Types ──────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  DocumentCapture: { clientId: string; documentType: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Clients: undefined;
  Pipeline: undefined;
  Alerts: undefined;
  Profile: undefined;
};

export type ClientTabParamList = {
  Credit: undefined;
  Repayment: undefined;
  Funding: undefined;
  Documents: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const ClientTab = createBottomTabNavigator<ClientTabParamList>();

// ─── Profile Placeholder ──────────────────────────────────────────────────────

function ProfileScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Profile</Text>
      <Text style={styles.placeholderSub}>Account settings coming soon</Text>
    </View>
  );
}

// ─── Shared tab screenOptions factory ────────────────────────────────────────

const sharedTabScreenOptions = (route: { name: string }) => ({
  tabBarIcon: ({ focused }: { focused: boolean }) => (
    <TabIcon label={route.name} focused={focused} />
  ),
  tabBarActiveTintColor: Colors.gold,
  tabBarInactiveTintColor: Colors.gray400,
  tabBarStyle: {
    backgroundColor: Colors.navy,
    borderTopColor: Colors.navyMid,
    borderTopWidth: 1,
    paddingBottom: 6,
    paddingTop: 4,
    height: 64,
  },
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  headerStyle: {
    backgroundColor: Colors.navy,
  },
  headerTintColor: Colors.white,
  headerTitleStyle: {
    fontWeight: '700' as const,
    color: Colors.white,
  },
  headerRight: () => (
    <Text style={{ color: Colors.gold, fontSize: 16, marginRight: 16 }}>CF</Text>
  ),
});

// ─── Client Tab Navigator ─────────────────────────────────────────────────────

function ClientTabs() {
  return (
    <ClientTab.Navigator
      screenOptions={({ route }) => sharedTabScreenOptions(route)}
    >
      <ClientTab.Screen
        name="Credit"
        component={CreditDashboardScreen}
        options={{ title: 'My Credit' }}
      />
      <ClientTab.Screen
        name="Repayment"
        component={RepaymentCalendarScreen}
        options={{ title: 'Repayment' }}
      />
      <ClientTab.Screen
        name="Funding"
        component={FundingProgressScreen}
        options={{ title: 'Funding' }}
      />
      <ClientTab.Screen
        name="Documents"
        component={DocumentUploadScreen}
        options={{ title: 'Documents' }}
      />
    </ClientTab.Navigator>
  );
}

// ─── Main Tab Navigator ───────────────────────────────────────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => sharedTabScreenOptions(route)}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Clients"
        component={ClientsScreen}
        options={{ title: 'Clients' }}
      />
      <Tab.Screen
        name="Pipeline"
        component={PipelineScreen}
        options={{ title: 'Pipeline' }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ title: 'Alerts' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────

export type UserRole = 'advisor' | 'client';

export default function AppNavigator({
  isAuthenticated,
  userRole = 'advisor',
}: {
  isAuthenticated: boolean;
  userRole?: UserRole;
}) {
  // Choose the correct tab navigator based on role
  const MainComponent = userRole === 'client' ? ClientTabs : MainTabs;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainComponent} />
            <Stack.Screen
              name="DocumentCapture"
              component={DocumentCaptureScreen}
              options={{
                headerShown: true,
                title: 'Capture Document',
                headerStyle: { backgroundColor: Colors.navy },
                headerTintColor: Colors.white,
                presentation: 'modal',
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundPrimary,
  },
  placeholderText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.navy,
  },
  placeholderSub: {
    fontSize: 14,
    color: Colors.gray500,
    marginTop: 6,
  },
});
