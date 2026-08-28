import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.ts';

export type VillaDetail = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  timezone: string;
  currency: string;
  weekStartsOn: number;
  createdAt: string;
};

type VillaResponse = {
  villa: VillaDetail;
  me: {
    membershipId: string;
    role: { id: string; key: string; name: string; isOwner: boolean };
    permissions: string[];
    isOwner: boolean;
  };
};

type VillaContextValue = {
  villa: VillaDetail;
  membershipId: string;
  role: { id: string; key: string; name: string; isOwner: boolean };
  isOwner: boolean;
  permissions: Set<string>;
  /** True when the caller holds any of the given permissions. */
  can: (...permissions: string[]) => boolean;
  /** 'all' | 'own' | 'none' for a `.all`/`.own` permission pair. */
  scope: (resource: string, action?: string) => 'all' | 'own' | 'none';
  reload: () => void;
};

const VillaContext = createContext<VillaContextValue | null>(null);

export function VillaProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { villaId } = useParams<{ villaId: string }>();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['villa', villaId],
    queryFn: () => api<VillaResponse>(`/villas/${villaId}`),
    enabled: Boolean(villaId),
    staleTime: 60_000,
  });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['villa', villaId] });
  }, [queryClient, villaId]);

  const value = useMemo<VillaContextValue | null>(() => {
    if (!data) return null;
    const permissions = new Set(data.me.permissions);
    const can = (...keys: string[]) => keys.some((key) => permissions.has(key));
    return {
      villa: data.villa,
      membershipId: data.me.membershipId,
      role: data.me.role,
      isOwner: data.me.isOwner,
      permissions,
      can,
      scope: (resource: string, action = 'view') =>
        can(`${resource}:${action}.all`) ? 'all' : can(`${resource}:${action}.own`) ? 'own' : 'none',
      reload,
    };
  }, [data, reload]);

  if (!value) return <>{fallback}</>;
  return <VillaContext.Provider value={value}>{children}</VillaContext.Provider>;
}

export function useVilla(): VillaContextValue {
  const context = useContext(VillaContext);
  if (!context) throw new Error('useVilla must be used inside VillaProvider');
  return context;
}
