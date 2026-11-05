import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recovery, setRecovery] = useState(() => sessionStorage.getItem('gatherly-password-recovery') === 'true');

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') { sessionStorage.setItem('gatherly-password-recovery', 'true'); setRecovery(true); }
      if (event === 'SIGNED_OUT') { sessionStorage.removeItem('gatherly-password-recovery'); setRecovery(false); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); setProfileLoading(false); return undefined; }
    let active = true;
    setProfile(null); setProfileLoading(true);
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (active) { setProfile(data ? { ...data, userId: session.user.id } : null); setProfileLoading(false); }
    }).catch(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [session?.user?.id]);

  const signIn = async (email, password) => {
    if (!supabase) return { error: { message: 'Supabase is not configured yet.' } };
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async (email, password, name) => {
    if (!supabase) return { error: { message: 'Supabase is not configured yet.' } };
    return supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  };

  const resetPassword = async (email) => {
    if (!supabase) return { error: { message: 'Supabase is not configured yet.' } };
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
  };
  const updatePassword = async (password) => {
    if (!supabase || !recovery || !session) return { error: { message: 'Open a valid password reset link first.' } };
    const result = await supabase.auth.updateUser({ password });
    if (!result.error) { sessionStorage.removeItem('gatherly-password-recovery'); setRecovery(false); }
    return result;
  };

  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setSession(null); };
  const value = useMemo(() => ({ session, user: session?.user || null, loading, configured: isSupabaseConfigured, isOrganizer: Boolean(session?.user?.id && profile?.userId === session.user.id && ['organizer', 'admin'].includes(profile?.role)), profileLoading, recovery, signIn, signUp, signOut, resetPassword, updatePassword }), [session, loading, profile, profileLoading, recovery]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
