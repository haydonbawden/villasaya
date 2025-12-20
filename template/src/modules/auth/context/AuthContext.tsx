import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { MMKV } from 'react-native-mmkv';

import type { AuthCredentials, AuthSession } from '@/services/api';
import { login as loginRequest, signup as signupRequest } from '@/services/api';
import { setAuthorizationToken } from '@/services/instance';

const storage = new MMKV({ id: 'auth' });

const AUTH_SESSION_KEY = 'auth.session';

type AuthContextValue = {
  readonly error?: string;
  readonly isHydrating: boolean;
  readonly loading: boolean;
  readonly session?: AuthSession;
  readonly login: (credentials: AuthCredentials) => Promise<void>;
  readonly logout: () => void;
  readonly signup: (credentials: AuthCredentials) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const persistSession = (session: AuthSession | undefined) => {
  if (!session) {
    storage.delete(AUTH_SESSION_KEY);
    return;
  }

  storage.set(AUTH_SESSION_KEY, JSON.stringify(session));
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | undefined>();
  const [isHydrating, setIsHydrating] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const storedSession = storage.getString(AUTH_SESSION_KEY);

    if (storedSession) {
      try {
        const parsedSession = JSON.parse(storedSession) as AuthSession;
        setSession(parsedSession);
        setAuthorizationToken(parsedSession.token);
      } catch {
        storage.delete(AUTH_SESSION_KEY);
      }
    }

    setIsHydrating(false);
  }, []);

  const sanitizeErrorMessage = (error: unknown): string => {
    const message = (error as Error).message;
    // Map technical errors to user-friendly messages
    if (message.includes('network') || message.includes('fetch')) {
      return 'Network error. Please check your connection.';
    }
    if (message.includes('401') || message.includes('unauthorized')) {
      return 'Invalid email or password.';
    }
    if (message.includes('400') || message.includes('bad request')) {
      return 'Invalid request. Please check your input.';
    }
    // Return generic message for unknown errors
    return 'An error occurred. Please try again.';
  };

  const handleLogin = useCallback(async (credentials: AuthCredentials) => {
    setLoading(true);
    setError(undefined);
    try {
      const nextSession = await loginRequest(credentials);
      setSession(nextSession);
      persistSession(nextSession);
    } catch (caughtError) {
      setError(sanitizeErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSignup = useCallback(async (credentials: AuthCredentials) => {
    setLoading(true);
    setError(undefined);
    try {
      const nextSession = await signupRequest(credentials);
      setSession(nextSession);
      persistSession(nextSession);
    } catch (caughtError) {
      setError(sanitizeErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    setSession(undefined);
    persistSession(undefined);
    setAuthorizationToken(undefined);
  }, []);

  const value = useMemo(
    () => ({
      error,
      isHydrating,
      loading,
      login: handleLogin,
      logout: handleLogout,
      session,
      signup: handleSignup,
    }),
    [error, isHydrating, loading, session, handleLogin, handleLogout, handleSignup],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
