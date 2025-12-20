import { useMemo, useState } from 'react';

import { FormField } from '@/components/forms';
import { AppButton, AppScreen } from '@/components/ui';
import { useAuth } from '@/modules/auth/context';
import useTheme from '@/theme/hooks/useTheme';

import { Text, TextInput, View } from 'react-native';

function LoginSignupScreen() {
  const { colors, fonts, gutters, layout } = useTheme();
  const { error, loading, login, signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [validationError, setValidationError] = useState<string | undefined>();

  const ctaLabel = useMemo(() => (mode === 'login' ? 'Login' : 'Create account'), [mode]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async () => {
    setValidationError(undefined);

    if (!email || !password) {
      setValidationError('Email and password are required.');
      return;
    }

    if (!validateEmail(email)) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters.');
      return;
    }

    if (mode === 'login') {
      await login({ email, password });
      return;
    }

    await signup({ email, password });
  };

  return (
    <AppScreen subtitle="Secure access for every role" title="Login or Sign up">
      <View style={[layout.flex_1, { gap: gutters.gap_24.gap }]}>
        <FormField helperText="We’ll send a verification link" label="Email">
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@villasaya.app"
            style={[fonts.size_16, { borderBottomWidth: 1, paddingVertical: gutters.paddingVertical_8.paddingVertical }]}
            value={email}
          />
        </FormField>
        <FormField helperText="Minimum 8 characters" label="Password">
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            style={[fonts.size_16, { borderBottomWidth: 1, paddingVertical: gutters.paddingVertical_8.paddingVertical }]}
            value={password}
          />
        </FormField>
        {(error || validationError) ? (
          <Text style={[fonts.size_14, { color: colors.red500 }]}>
            {validationError || error}
          </Text>
        ) : undefined}
        <View style={[layout.row, { gap: gutters.gap_16.gap }]}>
          <AppButton disabled={loading} onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} variant="secondary">
            {mode === 'login' ? 'Switch to Sign up' : 'Use existing account'}
          </AppButton>
          <AppButton disabled={loading} onPress={handleSubmit}>
            {loading ? 'Please wait…' : ctaLabel}
          </AppButton>
        </View>
      </View>
    </AppScreen>
  );
}

export default LoginSignupScreen;
