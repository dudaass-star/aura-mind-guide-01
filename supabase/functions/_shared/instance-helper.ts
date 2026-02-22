/**
 * WhatsApp Instance Helper
 * 
 * Provides functions to:
 * - Get instance credentials for a user (by user_id or phone)
 * - Allocate a new user to an instance (random balancing)
 * - Anti-burst delay for scheduled messages
 */

import { ZapiConfig, getZapiConfig, cleanPhoneNumber } from "./zapi-client.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface WhatsAppInstance {
  id: string;
  name: string;
  phone_number: string | null;
  zapi_instance_id: string;
  zapi_token: string;
  zapi_client_token: string;
  max_users: number;
  current_users: number;
  status: string;
}

// ============================================================================
// GET INSTANCE CONFIG FOR A USER
// ============================================================================

/**
 * Get Z-API config for a specific user.
 * Looks up the user's whatsapp_instance_id and fetches credentials from the DB.
 * Falls back to env vars if no instance is assigned.
 */
export async function getInstanceConfigForUser(
  supabase: any,
  userId: string
): Promise<ZapiConfig> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('whatsapp_instance_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.whatsapp_instance_id) {
      return await getInstanceConfigById(supabase, profile.whatsapp_instance_id);
    }
  } catch (error) {
    console.warn('⚠️ [Instance] Error fetching user instance, falling back to env vars:', error);
  }

  return getZapiConfig();
}

/**
 * Get Z-API config for a specific user by phone number.
 * Falls back to env vars if no instance is assigned.
 */
export async function getInstanceConfigForPhone(
  supabase: any,
  phone: string
): Promise<ZapiConfig> {
  try {
    const cleanPhone = cleanPhoneNumber(phone);
    const { data: profile } = await supabase
      .from('profiles')
      .select('whatsapp_instance_id')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (profile?.whatsapp_instance_id) {
      return await getInstanceConfigById(supabase, profile.whatsapp_instance_id);
    }
  } catch (error) {
    console.warn('⚠️ [Instance] Error fetching phone instance, falling back to env vars:', error);
  }

  return getZapiConfig();
}

/**
 * Get Z-API config by instance UUID.
 */
export async function getInstanceConfigById(
  supabase: any,
  instanceId: string
): Promise<ZapiConfig> {
  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('zapi_instance_id, zapi_token, zapi_client_token, status')
    .eq('id', instanceId)
    .single();

  if (error || !instance) {
    console.warn(`⚠️ [Instance] Instance ${instanceId} not found, falling back to env vars`);
    return getZapiConfig();
  }

  if (instance.status !== 'active') {
    console.warn(`⚠️ [Instance] Instance ${instanceId} is ${instance.status}, falling back to env vars`);
    return getZapiConfig();
  }

  return {
    instanceId: instance.zapi_instance_id,
    token: instance.zapi_token,
    clientToken: instance.zapi_client_token,
  };
}

// ============================================================================
// ALLOCATE INSTANCE FOR NEW USER
// ============================================================================

/**
 * Allocate a WhatsApp instance for a new user using random distribution.
 * Returns the instance UUID to be stored in the profile.
 * Returns null if no active instance with capacity is available.
 */
export async function allocateInstance(supabase: any): Promise<string | null> {
  try {
    // Use the DB function for atomic allocation
    const { data, error } = await supabase.rpc('allocate_whatsapp_instance');

    if (error) {
      console.error('❌ [Instance] Error allocating instance:', error);
      return null;
    }

    if (data) {
      console.log(`✅ [Instance] Allocated instance: ${data}`);
    } else {
      console.warn('⚠️ [Instance] No available instance with capacity');
    }

    return data;
  } catch (error) {
    console.error('❌ [Instance] Allocation exception:', error);
    return null;
  }
}

// ============================================================================
// ANTI-BURST DELAY
// ============================================================================

/**
 * Wait a random delay between 25-45 seconds to prevent burst sending.
 * Use between each message in batch/scheduled functions.
 * @deprecated Use antiBurstDelayForInstance() for per-instance delays
 */
export async function antiBurstDelay(): Promise<void> {
  const delay = 25000 + Math.random() * 20000; // 25-45 seconds
  const seconds = (delay / 1000).toFixed(1);
  console.log(`⏳ [Anti-burst] Waiting ${seconds}s before next send...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

// ============================================================================
// PER-INSTANCE ANTI-BURST DELAY
// ============================================================================

const lastSendByInstance = new Map<string, number>();

/**
 * Per-instance anti-burst delay. Only waits if the SAME instance
 * sent a message too recently. Different instances can send in parallel.
 */
export async function antiBurstDelayForInstance(instanceId: string): Promise<void> {
  const lastSend = lastSendByInstance.get(instanceId) || 0;
  const elapsed = Date.now() - lastSend;
  const minDelay = 25000 + Math.random() * 20000; // 25-45 seconds

  if (elapsed < minDelay) {
    const waitTime = minDelay - elapsed;
    const seconds = (waitTime / 1000).toFixed(1);
    const shortId = instanceId.length > 8 ? instanceId.substring(0, 8) : instanceId;
    console.log(`⏳ [Anti-burst/${shortId}] Waiting ${seconds}s before next send...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastSendByInstance.set(instanceId, Date.now());
}

// ============================================================================
// GROUP ITEMS BY WHATSAPP INSTANCE
// ============================================================================

/**
 * Group an array of items by their whatsapp_instance_id field.
 * Items without an instance go to the 'default' group.
 */
export function groupByInstance<T extends Record<string, any>>(
  items: T[],
  keyField: string = 'whatsapp_instance_id'
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item[keyField] || 'default';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  console.log(`📡 Grouped ${items.length} items into ${groups.size} instance group(s): ${Array.from(groups.entries()).map(([k, v]) => `${k.substring(0, 8)}(${v.length})`).join(', ')}`);
  return groups;
}
