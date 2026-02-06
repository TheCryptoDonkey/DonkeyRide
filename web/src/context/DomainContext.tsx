import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DomainProfile } from '../types/domain';
import { getCurrentDomain } from '../services/api';

interface DomainState {
  profile: DomainProfile | null;
  loading: boolean;
  error: string | null;
}

const DomainContext = createContext<DomainState>({
  profile: null,
  loading: true,
  error: null,
});

export function DomainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DomainState>({
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    getCurrentDomain()
      .then(profile => setState({ profile, loading: false, error: null }))
      .catch(err => setState({ profile: null, loading: false, error: err.message }));
  }, []);

  return (
    <DomainContext.Provider value={state}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain(): DomainState {
  return useContext(DomainContext);
}
