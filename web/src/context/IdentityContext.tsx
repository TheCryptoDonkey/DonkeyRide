import {
  createContext, useContext, useEffect, useState,
  useCallback, type ReactNode,
} from 'react';
import type { NostrIdentity } from '../types/nostr';
import { loadRiderIdentity, loadDriverIdentity } from '../services/nostr';

type Role = 'rider' | 'driver';

interface IdentityState {
  identity: NostrIdentity | null;
  role: Role;
  loading: boolean;
  setRole: (role: Role) => void;
}

const IdentityContext = createContext<IdentityState>({
  identity: null,
  role: 'rider',
  loading: true,
  setRole: () => {},
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const [role, setRoleState] = useState<Role>(
    () => (localStorage.getItem('donkeyride.role') as Role) || 'rider',
  );
  const [loading, setLoading] = useState(true);

  const loadIdentity = useCallback(async (r: Role) => {
    setLoading(true);
    try {
      const id = r === 'driver'
        ? await loadDriverIdentity()
        : await loadRiderIdentity();
      setIdentity(id);
    } catch (err) {
      console.error('Failed to load identity:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    localStorage.setItem('donkeyride.role', r);
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
