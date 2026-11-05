import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const signIn = async (email, password) => {
    if (!supabase) return { error: { message: 'Supabase is not configured yet.' } };
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async (email, password, name) => {
    if (!supabase) return { error: { message: 'Supabase is not configured yet.' } };
    return supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  };

  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setSession(null); };
  const value = useMemo(() => ({ session, user: session?.user || null, loading, configured: isSupabaseConfigured, signIn, signUp, signOut }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
