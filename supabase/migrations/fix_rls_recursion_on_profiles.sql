```sql
/*
  # Fix RLS Recursion on Profiles Table

  This migration changes the `public.get_current_user_role()` function
  to use `SECURITY DEFINER` instead of `SECURITY INVOKER`.

  This is necessary to prevent a "stack depth limit exceeded" error
  caused by RLS policies on `public.profiles` calling this function,
  which in turn queries `public.profiles`, creating a recursive loop
  when the function runs with invoker's rights.

  With `SECURITY DEFINER`, the function's internal query to `public.profiles`
  will bypass the RLS policies of the calling user, thus breaking the
  recursion.

  The function remains STABLE and `search_path` is correctly set at the
  function definition level.
*/

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER -- Changed from INVOKER to DEFINER
SET search_path = public
AS $$
  SELECT lower(role) FROM public.profiles WHERE id = auth.uid();
$$;

-- Re-grant execute permission to ensure authenticated users can still call it.
-- The function owner (usually postgres or a superuser) must have SELECT rights on profiles.
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
```