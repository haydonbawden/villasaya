import { useMemo, useState } from 'react';

import { FormField } from '@/components/forms';
import { AppButton, AppScreen } from '@/components/ui';
import { useAuth } from '@/modules/auth/context';
import useTheme from '@/theme/hooks/useTheme';

import { Text, TextInput, View } from 'react-native';

function LoginSignupScreen() {
  const { fonts, gutters, layout } = useTheme();
  const { error, loading, login, signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const ctaLabel = useMemo(() => (mode === 'login' ? 'Login' : 'Create account'), [mode]);

  const handleSubmit = async () => {
    if (!email || !password) {
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
        {error ? <Text style={[fonts.size_14, { color: 'red' }]}>{error}</Text> : undefined}
        <View style={[layout.row, { gap: gutters.gap_16.gap }]}>
          <AppButton onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} variant="secondary">
            {mode === 'login' ? 'Switch to Sign up' : 'Use existing account'}
          </AppButton>
          <AppButton onPress={handleSubmit}>
            {loading ? 'Please wait…' : ctaLabel}
          </AppButton>
        </View>
      </View>
    </AppScreen>
  );
}

export default LoginSignupScreen;
