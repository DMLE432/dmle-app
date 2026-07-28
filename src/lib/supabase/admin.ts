import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

let serviceRoleClient: ReturnType<typeof createClient<Database>> | null = null;

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('Supabase service-role client is disabled. Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    return null;
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return serviceRoleClient;
}
