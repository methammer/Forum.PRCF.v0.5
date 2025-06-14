import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';

// Define the structure of the profile data we expect
export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  status: 'pending_approval' | 'approved' | 'rejected' | null;
  role: 'user' | 'admin' | 'moderator' | null; // Role is crucial
  // Add other profile fields as needed
}

interface UserContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoadingAuth: boolean;
  signOut: () => Promise<void>;
}

// Create a unique sentinel object to use as a default value
const UNINITIALIZED_SENTINEL = {} as UserContextType;

const UserContext = createContext<UserContextType>(UNINITIALIZED_SENTINEL);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [currentUserForEffect, setCurrentUserForEffect] = useState<User | null>(null);
  
  const isInitialSetupRunning = useRef(true); 
  const effectInstanceCounter = useRef(0);
  const definitiveInstanceRun = useRef(process.env.NODE_ENV === 'development' ? 2 : 1);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    console.log(`[UserProvider] fetchProfile: Called for user ID: ${userId}`);
    
    const queryPromise = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, status, role')
      .eq('id', userId)
      .single();

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Supabase query timed out after 10 seconds')), 10000)
    );

    try {
      console.log(`[UserProvider] fetchProfile: Attempting Supabase query for user ${userId} with 10s timeout...`);
      const result = await Promise.race([queryPromise, timeoutPromise]);
      const { data, error, status } = result;

      console.log(`[UserProvider] fetchProfile: Supabase query responded for user ${userId}. Status: ${status}, Error: ${error ? error.message : 'null'}, HasData: ${!!data}`);
      
      if (error && status !== 406) {
        console.error(`[UserProvider] fetchProfile: Error fetching profile for user ${userId}: ${error.message}. Status: ${status}`);
        return null;
      }
      
      console.log(`[UserProvider] fetchProfile: Raw profile data from Supabase for user ${userId}:`, data);

      if (!data) {
        console.warn(`[UserProvider] fetchProfile: Profile not found for user ID ${userId}.`);
        return null;
      }

      if (typeof data.status === 'undefined' || typeof data.role === 'undefined') {
        console.warn(`[UserProvider] fetchProfile: Profile data for user ID ${userId} is incomplete. Data:`, data);
        return null; 
      }
      
      console.log(`[UserProvider] fetchProfile: Profile fetched and validated for user ${userId}:`, data);
      return data as Profile;
    } catch (e: any) {
      if (e.message && e.message.includes('timed out')) {
        console.error(`[UserProvider] fetchProfile: Supabase query for user ${userId} explicitly TIMED OUT. ${e.message}`);
      } else {
        console.error(`[UserProvider] fetchProfile: Exception during fetchProfile for user ${userId}: ${e.message}`, e);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    const currentEffectInstanceRun = ++effectInstanceCounter.current;
    
    console.log(`[UserProvider] useEffect: Starting instance run ${currentEffectInstanceRun}. Definitive run is ${definitiveInstanceRun.current}. isInitialSetupRunning was ${isInitialSetupRunning.current}`);
    
    setIsLoadingAuth(true);

    const setupInitialAuth = async () => {
      console.log(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Starting.`);
      try {
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

        if (!isActive) {
          console.log(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Component unmounted during getSession.`);
          return;
        }
        if (sessionError) {
          console.error(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Error getting session:`, sessionError);
          if (isActive) { setSession(null); setUser(null); setProfile(null); setCurrentUserForEffect(null); }
          return;
        }

        console.log(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): getSession resolved. Session:`, initialSession ? `User ID: ${initialSession.user.id}` : 'null');
        
        if (isActive) {
          setSession(initialSession);
          const newAuthUser = initialSession?.user ?? null;
          setUser(newAuthUser);
          if (currentUserForEffect?.id !== newAuthUser?.id || (!!currentUserForEffect !== !!newAuthUser)) {
             setCurrentUserForEffect(newAuthUser);
          }
        }

        if (initialSession?.user) {
          console.log(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Attempting profile fetch for user ${initialSession.user.id}.`);
          const fetchedProfile = await fetchProfile(initialSession.user.id);
          if (isActive) setProfile(fetchedProfile);
          console.log(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Profile fetch from getSession for ${initialSession.user.id} ${fetchedProfile ? 'succeeded' : 'failed/timed out'}.`);
        } else {
          if (isActive) setProfile(null); 
        }
      } catch (e) {
        console.error(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Exception during initial setup:`, e);
        if (isActive) { setSession(null); setUser(null); setProfile(null); setCurrentUserForEffect(null); }
      } finally {
        if (isActive) {
          setIsLoadingAuth(false); 
          if (isInitialSetupRunning.current && currentEffectInstanceRun >= definitiveInstanceRun.current) {
            console.log(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Definitive run. Setting isInitialSetupRunning to false.`);
            isInitialSetupRunning.current = false;
          }
          console.log(`[UserProvider] setupInitialAuth (instance ${currentEffectInstanceRun}): Finally block. isLoadingAuth: false, isInitialSetupRunning: ${isInitialSetupRunning.current}`);
        }
      }
    };

    setupInitialAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isActive) { 
          console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}): Listener is stale or component unmounted, aborting.`);
          return;
        }
        console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}) event: ${_event}, New Session:`, newSession ? `User ID: ${newSession.user.id}` : 'null', `isInitialSetupRunning: ${isInitialSetupRunning.current}`);
        
        const previousUser = user; 

        if (isActive) {
          // Only set isLoadingAuth to true if it's not the initial setup phase handling it
          if (!isInitialSetupRunning.current) {
            setIsLoadingAuth(true);
          }
          setSession(newSession);
          const newAuthUser = newSession?.user ?? null;
          setUser(newAuthUser);
          if (currentUserForEffect?.id !== newAuthUser?.id || (!!currentUserForEffect !== !!newAuthUser)) {
            setCurrentUserForEffect(newAuthUser);
          }
        }

        if (newSession?.user) {
          const userChanged = newSession.user.id !== previousUser?.id;
          let shouldFetchProfile = false;

          if (isInitialSetupRunning.current) {
            if (_event === 'USER_UPDATED') {
              shouldFetchProfile = true;
              console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}, ${_event} during setup): USER_UPDATED. ShouldFetch: true.`);
            } else {
              shouldFetchProfile = false; 
              console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}, ${_event} during setup): Suppressing listener fetch. isInitialSetupRunning is true.`);
            }
          } else {
            shouldFetchProfile = userChanged || _event === 'USER_UPDATED';
            console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}, ${_event} post-setup): UserChanged: ${userChanged}. ShouldFetch: ${shouldFetchProfile}`);
          }
          
          if (!newSession.user) { 
            shouldFetchProfile = false;
          }

          if (shouldFetchProfile) {
            console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}, ${_event}): Condition met, attempting profile fetch for user ${newSession.user.id}.`);
            const fetchedProfile = await fetchProfile(newSession.user.id);
            if (isActive) {
              setProfile(fetchedProfile);
              // Only set isLoadingAuth to false if not in initial setup phase, 
              // as setupInitialAuth's finally block will handle it.
              if (!isInitialSetupRunning.current) {
                setIsLoadingAuth(false);
              }
              console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}, ${_event}): Profile fetch for ${newSession.user.id} ${fetchedProfile ? 'succeeded' : 'failed/timed out'}. setIsLoadingAuth(${!isInitialSetupRunning.current}).`);
            }
          } else {
            console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}, ${_event}): Condition NOT met for profile fetch. UserChanged: ${userChanged}, isInitialSetupRunning: ${isInitialSetupRunning.current}, CurrentProfileExists: ${!!profile}`);
            // Only set isLoadingAuth to false if not in initial setup phase
            if (isActive && !isInitialSetupRunning.current) {
              setIsLoadingAuth(false); 
            }
          }
        } else { // User signed out
          if (isActive) {
            setProfile(null); 
            // Only set isLoadingAuth to false if not in initial setup phase
            if (!isInitialSetupRunning.current) {
              setIsLoadingAuth(false); 
            }
            console.log(`[UserProvider] onAuthStateChange (instance ${currentEffectInstanceRun}, SIGNED_OUT): User signed out. isLoadingAuth: ${isLoadingAuth}, isInitialSetupRunning: ${isInitialSetupRunning.current}`);
          }
        }
      }
    );

    return () => {
      isActive = false;
      console.log(`[UserProvider] useEffect cleanup (instance ${currentEffectInstanceRun}): Main setup effect unsubscribing auth listener.`);
      authListener?.subscription.unsubscribe();
    };
  }, [fetchProfile, currentUserForEffect?.id]);

  const signOut = async () => {
    console.log('[UserProvider] signOut called.');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[UserProvider] Error signing out:', error);
    }
    // State will be cleared by onAuthStateChange
  };

  const value = {
    session,
    user,
    profile,
    isLoadingAuth,
    signOut,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === UNINITIALIZED_SENTINEL) { 
    console.error("[UserContext] 'useUser' was called outside of a UserProvider or context is uninitialized (using sentinel).");
    throw new Error('useUser must be used within a UserProvider (sentinel check)');
  }
  return context;
};
