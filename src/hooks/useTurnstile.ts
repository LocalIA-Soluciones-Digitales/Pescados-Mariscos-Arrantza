/* ------------------------------------------------------------------ */
/*  useTurnstile — Verification Hook                                  */
/*                                                                     */
/*  This hook wraps the entire Turnstile verification flow.           */
/*                                                                     */
/*  TODAY (enabled = false):                                          */
/*    • `verified` is always `true`                                   */
/*    • `verifying` is always `false`                                 */
/*    • `error` is always `null`                                      */
/*    • Everything passes through transparently — zero UX impact      */
/*                                                                     */
/*  FUTURE (enabled = true):                                          */
/*    • `verified` becomes `false` until the user solves the widget   */
/*    • `verifying` is `true` while the server-side check runs        */
/*    • `error` is populated if verification fails                    */
/*    • `reset()` clears state so the user can retry                  */
/*                                                                     */
/*  The public API is stable — enable Turnstile without touching any  */
/*  consumer code.                                                     */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useRef } from 'react';
import { isTurnstileEnabled } from '@/config/turnstile';

export interface TurnstileState {
  /** Has the user passed the Turnstile challenge? */
  verified: boolean;
  /** Is the server-side verification currently in-flight? */
  verifying: boolean;
  /** Error message if verification failed (null otherwise) */
  error: string | null;
}

export interface UseTurnstileReturn extends TurnstileState {
  /** Call when the Turnstile widget emits a token (future integration).
   *  Currently a no-op since verification is disabled. */
  onTokenReceived: (token: string) => Promise<void>;
  /** Reset verification state so the user can retry. */
  reset: () => void;
}

export function useTurnstile(): UseTurnstileReturn {
  const [verified, setVerified] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /* Ref to guard against duplicate verification in-flight calls */
  const verifyingRef = useRef(false);

  const reset = useCallback(() => {
    setVerified(true);
    setVerifying(false);
    setError(null);
    verifyingRef.current = false;
  }, []);

  /**
   * Future integration point.
   *
   * When Turnstile is enabled, this function will:
   *   1. Set `verifying = true`
   *   2. Call the verification Edge Function with the token
   *   3. Set `verified` based on the response
   *   4. Set `error` if the server rejects the token
   *
   * For now, it's a no-op.
   */
  const onTokenReceived = useCallback(async (_token: string) => {
    if (!isTurnstileEnabled()) {
      // Turnstile is disabled — verification is always implicit
      setVerified(true);
      setVerifying(false);
      setError(null);
      return;
    }

    /* ---- FUTURE IMPLEMENTATION ---- */
    // if (verifyingRef.current) return;  // prevent duplicate calls
    // verifyingRef.current = true;
    // setVerifying(true);
    // setError(null);
    //
    // try {
    //   const { data, error: invokeError } = await supabase.functions.invoke(
    //     turnstileConfig.verificationEndpoint,
    //     { body: { token } },
    //   );
    //
    //   if (invokeError || !data?.success) {
    //     setVerified(false);
    //     setError(data?.message || 'Verification failed. Please try again.');
    //   } else {
    //     setVerified(true);
    //     setError(null);
    //   }
    // } catch (err) {
    //   setVerified(false);
    //   setError('Network error during verification. Please try again.');
    // } finally {
    //   setVerifying(false);
    //   verifyingRef.current = false;
    // }
    /* ---- END FUTURE ---- */

    // Placeholder — always succeed
    setVerified(true);
    setVerifying(false);
    setError(null);
  }, []);

  return {
    verified,
    verifying,
    error,
    onTokenReceived,
    reset,
  };
}