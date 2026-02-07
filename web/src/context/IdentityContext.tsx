import {
  createContext, useContext, useEffect, useState,
  useCallback, type ReactNode,
} from 'react';
import type { NostrIdentity } from '../types/nostr';
import { loadRequesterIdentity, loadProviderIdentity } from '../services/nostr';
import { setAuthPrivKey } from '../services/api';

type Role = 'requester' | 'provider';

interface IdentityState {
  identity: NostrIdentity | null;
  role: Role;
  loading: boolean;
  setRole: (role: Role) => void;
}

const STORAGE_KEY = 'donkeyride.role';
const LEGACY_ROLE_MAP: Record<string, Role> = { rider: 'requester', driver: 'provider' };

function readStoredRole(): Role {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'requester' || stored === 'provider') return stored;
  // Migrate legacy values
  if (stored && LEGACY_ROLE_MAP[stored]) {
    const migrated = LEGACY_ROLE_MAP[stored];
    localStorage.setItem(STORAGE_KEY, migrated);
    return migrated;
  }
  return 'requester';
}

const IdentityContext = createContext<IdentityState>({
  identity: null,
  role: 'requester',
  loading: true,
  setRole: () => {},
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const [role, setRoleState] = useState<Role>(readStoredRole);
  const [loading, setLoading] = useState(true);

  const loadIdentity = useCallback(async (r: Role) => {
    setLoading(true);
    try {
      const id = r === 'provider'
        ? await loadProviderIdentity()
        : await loadRequesterIdentity();
      setIdentity(id);
      setAuthPrivKey(id.privKeyHex);
    } catch (err) {
      console.error('Failed to load identity:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    localStorage.setItem(STORAGE_KEY, r);
    loadIdentity(r);
  }, [loadIdentity]);

  useEffect(() => {
    loadIdentity(role);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <IdentityContext.Provider value={{ identity, role, loading, setRole }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityState {
  return useContext(IdentityContext);
}
