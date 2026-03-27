/**
 * Profile Resolver — centralizes profile lookup by phone variations + email fallback
 * 
 * Used by stripe-webhook and other functions that need to find a profile
 * from Stripe customer data (phone in metadata, email, etc.)
 */

import { getPhoneVariations } from "./zapi-client.ts";

export interface ResolvedProfile {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  plan: string | null;
  trial_started_at: string | null;
  email: string | null;
}

export interface ResolveResult {
  profile: ResolvedProfile | null;
  matchedBy: 'phone' | 'email' | 'checkout_session' | null;
  phoneUsed: string | null;
  variationsTried: string[];
}

/**
 * Resolve a profile using phone variations, email fallback, and checkout_sessions fallback.
 * 
 * @param supabase - Supabase client (service role)
 * @param phone - Raw phone from Stripe metadata (may be in any format)
 * @param email - Customer email from Stripe
 */
export async function resolveProfile(
  supabase: any,
  phone: string | null | undefined,
  email: string | null | undefined
): Promise<ResolveResult> {
  const selectFields = 'id, user_id, name, phone, status, plan, trial_started_at, email';

  // === Strategy 1: Phone variations ===
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const variations = getPhoneVariations(cleanPhone);

    for (const variation of variations) {
      const { data } = await supabase
        .from('profiles')
        .select(selectFields)
        .eq('phone', variation)
        .maybeSingle();

      if (data) {
        console.log(`✅ [ProfileResolver] Found by phone variation: ${variation}`);
        return { profile: data, matchedBy: 'phone', phoneUsed: variation, variationsTried: variations };
      }
    }

    console.log(`⚠️ [ProfileResolver] No match for phone variations: ${variations.join(', ')}`);
  }

  // === Strategy 2: Email fallback ===
  if (email) {
    const { data } = await supabase
      .from('profiles')
      .select(selectFields)
      .eq('email', email)
      .maybeSingle();

    if (data) {
      console.log(`✅ [ProfileResolver] Found by email: ${email}`);
      return { profile: data, matchedBy: 'email', phoneUsed: data.phone, variationsTried: [] };
    }
  }

  // === Strategy 3: checkout_sessions fallback (by phone variations) ===
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const variations = getPhoneVariations(cleanPhone);

    for (const variation of variations) {
      const { data: session } = await supabase
        .from('checkout_sessions')
        .select('phone')
        .eq('phone', variation)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session?.phone) {
        // Now try to find profile with the checkout session phone
        const sessionPhoneVariations = getPhoneVariations(session.phone);
        for (const spv of sessionPhoneVariations) {
          const { data: profile } = await supabase
            .from('profiles')
            .select(selectFields)
            .eq('phone', spv)
            .maybeSingle();

          if (profile) {
            console.log(`✅ [ProfileResolver] Found via checkout_session phone: ${spv}`);
            return { profile, matchedBy: 'checkout_session', phoneUsed: spv, variationsTried: variations };
          }
        }
      }
    }
  }

  console.log(`❌ [ProfileResolver] No profile found for phone=${phone}, email=${email}`);
  return { profile: null, matchedBy: null, phoneUsed: null, variationsTried: phone ? getPhoneVariations(phone.replace(/\D/g, '')) : [] };
}
