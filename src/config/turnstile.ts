/* ------------------------------------------------------------------ */
/*  Cloudflare Turnstile — Central Configuration                      */
/*                                                                     */
/*  When you're ready to enable Turnstile:                            */
/*    1. Set `enabled` to `true`                                      */
/*    2. Add your real `siteKey`                                      */
/*    3. Add your real `secretKey` (kept in a Supabase Edge Function  */
/*       secret, never exposed to the browser)                        */
/*    4. Deploy the verification Edge Function                        */
/*                                                                     */
/*  Until then, the entire Turnstile layer is a no-op that always     */
/*  returns "verification successful" — no UX impact whatsoever.       */
/* ------------------------------------------------------------------ */

export interface TurnstileConfig {
  /** Master toggle — set to `true` to enable Turnstile verification */
  enabled: boolean;

  /**
   * Cloudflare Turnstile Site Key (public, client-side).
   * Get this from the Cloudflare Turnstile dashboard.
   * This is safe to expose to the browser.
   */
  siteKey: string;

  /**
   * Cloudflare Turnstile Secret Key (private, server-side).
   * NEVER include a real value here.
   * Store it as a Supabase Edge Function secret (e.g. TURNSTILE_SECRET_KEY)
   * and reference it via Deno.env.get('TURNSTILE_SECRET_KEY') in your
   * verification Edge Function.
   */
  secretKey: string;

  /** Environment — helps with conditional logging / dev behaviour */
  environment: 'development' | 'production';

  /**
   * Path to the verification Edge Function relative to the Supabase
   * functions base.  The actual deploy slug will be used as-is when
   * calling supabase.functions.invoke(...).
   */
  verificationEndpoint: string;

  /** Theme passed to the Turnstile widget (light / dark / auto) */
  theme: 'light' | 'dark' | 'auto';

  /** Size of the Turnstile widget (normal / compact) */
  size: 'normal' | 'compact';
}

const turnstileConfig: TurnstileConfig = {
  enabled: false,

  /* ---- Replace with real keys when enabling Turnstile ---- */
  siteKey: '',
  secretKey: '',

  environment: 'development',

  /* Edge Function slug that verifies the Turnstile token.
     Deploy via deploy_edge_function when ready. */
  verificationEndpoint: 'verify-turnstile',

  theme: 'auto',
  size: 'normal',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Whether Turnstile verification is currently active.
 *  When `false`, verification is skipped and the order flow proceeds
 *  as if every challenge passes. */
export function isTurnstileEnabled(): boolean {
  return turnstileConfig.enabled && turnstileConfig.siteKey.length > 0;
}

/** Get the public config subset safe to expose to the browser.
 *  Secret key is intentionally excluded. */
export function getPublicTurnstileConfig(): Omit<TurnstileConfig, 'secretKey'> {
  const { secretKey: _, ...publicConfig } = turnstileConfig;
  return publicConfig;
}

export default turnstileConfig;