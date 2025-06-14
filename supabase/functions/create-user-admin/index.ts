import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CreateUserPayload {
  email: string;
  password?: string; // Password is required by createUser but might be omitted in other contexts
  full_name: string;
  username: string;
  role: 'user' | 'moderator' | 'admin'; // Ensure this matches your expected roles
}

// IMPORTANT: These environment variables must be set in your Supabase project's Edge Function settings
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  // In a real scenario, you might want to prevent the function from serving if these are missing.
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or your specific frontend URL
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error: Missing Supabase credentials.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
  
  let payload: CreateUserPayload;
  try {
    payload = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload: ' + error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const { email, password, full_name, username, role } = payload;

  if (!email || !password || !full_name || !username || !role) {
    return new Response(JSON.stringify({ error: 'Missing required fields: email, password, full_name, username, role are required.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  try {
    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Create the user in auth.users
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: false, // Admin-created users are confirmed by default
      // user_metadata can be used if needed, but we'll update profiles table directly
    });

    if (authError) {
      console.error('Supabase auth.admin.createUser error:', authError);
      return new Response(JSON.stringify({ error: `Auth error: ${authError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: authError.status || 500,
      });
    }

    if (!authUser || !authUser.user) {
      console.error('User creation did not return a user object.');
      return new Response(JSON.stringify({ error: 'User creation failed: No user object returned.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const newUserId = authUser.user.id;

    // 2. Update the profile in public.profiles
    // The handle_new_user trigger should have already created a basic profile row.
    // We update it with full_name, username, role, and set status to 'approved'.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: full_name,
        username: username,
        role: role,
        status: 'approved', // Admin-created users are approved by default
      })
      .eq('id', newUserId);

    if (profileError) {
      console.error(`Profile update error for user ${newUserId}:`, profileError);
      // Potentially, you might want to delete the auth user if profile update fails,
      // but this can be complex to handle robustly. For now, log and return error.
      return new Response(JSON.stringify({ error: `Profile update error: ${profileError.message}. Auth user created but profile update failed.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ message: 'User created successfully', userId: newUserId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201, // 201 Created
    });

  } catch (error) {
    console.error('Unexpected error in Edge Function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error: ' + error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
