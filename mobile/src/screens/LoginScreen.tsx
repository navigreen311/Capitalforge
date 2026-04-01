import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Colors, Spacing, BorderRadius, Typography } from '../lib/theme';
import { authApi, TokenStore } from '../lib/api-client';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable] = useState(false); // placeholder — wire with expo-local-authentication

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.login(email.trim().toLowerCase(), password);
      const { accessToken, refreshToken } = result.data;
      await TokenStore.setTokens(accessToken, refreshToken);
      onLoginSuccess?.();
    } catch (err: any) {
      const message = err?.message ?? 'Login failed. Please check your credentials.';
      Alert.alert('Login Error', message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometric() {
    // Placeholder — integrate expo-local-authentication:
    // const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Login to CapitalForge' });
    Alert.alert('Biometric', 'Biometric authentication is available after first login.');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo / Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>CF</Text>
          </View>
          <Text style={styles.brandName}>CapitalForge</Text>
          <Text style={styles.brandTagline}>Corporate Funding Platform</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSubtitle}>Sign in to your advisor account</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="advisor@firm.com"
              placeholderTextColor={Colors.gray400}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={Colors.gray400}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.navy} />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {biometricAvailable && (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleBiometric}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.biometricIcon}>⊙</Text>
              <Text style={styles.biometricText}>Sign in with Biometrics</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Secure login powered by CapitalForge{'\n'}
          © 2026 CapitalForge. All rights reserved.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing[6],
    paddingTop: 80,
    paddingBottom: Spacing[8],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing[8],
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  logoMarkText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.navy,
    letterSpacing: 1,
  },
  brandName: {
    fontSize: Typography['3xl'],
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  brandTagline: {
    fontSize: Typography.sm,
    color: Colors.gray400,
    marginTop: Spacing[1],
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius['2xl'],
    padding: Spacing[6],
  },
  cardTitle: {
    fontSize: Typography['2xl'],
    fontWeight: '700',
    color: Colors.navy,
    marginBottom: Spacing[1],
  },
  cardSubtitle: {
    fontSize: Typography.sm,
    color: Colors.gray500,
    marginBottom: Spacing[6],
  },
  fieldGroup: {
    marginBottom: Spacing[4],
  },
  label: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.gray700,
    marginBottom: Spacing[2],
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    fontSize: Typography.base,
    color: Colors.gray900,
    backgroundColor: Colors.gray50,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: Spacing[5],
    marginTop: -Spacing[2],
  },
  forgotPasswordText: {
    fontSize: Typography.sm,
    color: Colors.gold,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: Colors.navy,
    letterSpacing: 0.3,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[4],
    paddingVertical: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.md,
  },
  biometricIcon: {
    fontSize: 20,
    marginRight: Spacing[2],
    color: Colors.navy,
  },
  biometricText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.navy,
  },
  footer: {
    textAlign: 'center',
    color: Colors.gray500,
    fontSize: Typography.xs,
    marginTop: Spacing[8],
    lineHeight: 18,
  },
});
