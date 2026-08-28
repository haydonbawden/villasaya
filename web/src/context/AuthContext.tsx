import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, requestRefresh, setAccessToken, setSessionLostHandler } from '../lib/api.ts';
import type { User, VillaSummary } from '../lib/types.ts';

type SessionResponse = {
  user: User;
  villas: VillaSummary[];
  accessToken: string;
  expiresIn: number;
};

type AuthContextValue = {
  user: User | null;
  villas: VillaSummary[];
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshVillas: () => Promise<void>;
  updateUser: (user: User) => void;
};

export type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  villaName?: string;
  invitationToken?: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [villas, setVillas] = useState<VillaSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');

  const applySession = useCallback((session: SessionResponse) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setVillas(session.villas);
    setStatus('authenticated');
    // Refresh a minute before expiry so a long-lived tab never shows a
    // spurious sign-in prompt mid-task.
    scheduleRefresh(session.expiresIn);
  }, []);

  const [refreshTimer, setRefreshTimer] = useState<number | null>(null);
  const scheduleRefresh = useCallback((expiresIn: number) => {
    setRefreshTimer((previous) => {
      if (previous !== null) window.clearTimeout(previous);
      return window.setTimeout(
        () => {
          void requestRefresh()
            .then((session) => applySession(session as unknown as SessionResponse))
            .catch(() => {
              setAccessToken(null);
              setUser(null);
              setStatus('anonymous');
            });
        },
        Math.max(30, expiresIn - 60) * 1000,
      );
    });
  }, [applySession]);

  // On first load, trade the refresh cookie for a session so a reload does not
  // sign the user out.
  useEffect(() => {
    let cancelled = false;
    void requestRefresh()
      .then((session) => {
        if (!cancelled) applySession(session as unknown as SessionResponse);
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      setVillas([]);
      setStatus('anonymous');
    });
    return () => setSessionLostHandler(null);
  }, []);

  useEffect(() => () => {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  }, [refreshTimer]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api<SessionResponse>('/auth/login', {
        body: { email, password },
        skipRefresh: true,
      });
      applySession(session);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const session = await api<SessionResponse>('/auth/register', { body: input, skipRefresh: true });
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', skipRefresh: true });
    } finally {
      setAccessToken(null);
      setUser(null);
      setVillas([]);
      setStatus('anonymous');
    }
  }, []);

  const refreshVillas = useCallback(async () => {
    const data = await api<{ villas: VillaSummary[] }>('/villas');
    setVillas(data.villas);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, villas, status, login, register, logout, refreshVillas, updateUser: setUser }),
    [user, villas, status, login, register, logout, refreshVillas],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
