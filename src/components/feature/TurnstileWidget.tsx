/* ------------------------------------------------------------------ */
/*  TurnstileWidget — Placeholder Container                           */
/*                                                                     */
/*  TODAY (Turnstile disabled):                                       */
/*    • Renders nothing — `display: none` via the `hidden` class      */
/*    • Reserves zero space in the layout                             */
/*    • Does not affect any existing flow or styling                  */
/*                                                                     */
/*  FUTURE (Turnstile enabled):                                       */
/*    • Renders the Cloudflare Turnstile widget via the official      */
/*      <script> tag or turnstile-react package                       */
/*    • Shows a loading state while the widget initializes            */
/*    • Emits the token via `onTokenReceived` when the user solves    */
/*    • Shows an error state with a retry button on failure           */
/*    • The reserved space (`min-h-[72px]`) prevents layout shift     */
/*                                                                     */
/*  Usage (already wired into CartDrawer footer):                     */
/*    <TurnstileWidget onTokenReceived={turnstile.onTokenReceived} /> */
/* ------------------------------------------------------------------ */

import { isTurnstileEnabled } from '@/config/turnstile';

interface TurnstileWidgetProps {
  /** Callback when the Turnstile challenge is completed successfully.
   *  Receives the verification token from Cloudflare. */
  onTokenReceived: (token: string) => void;
}

export default function TurnstileWidget({ onTokenReceived: _onTokenReceived }: TurnstileWidgetProps) {
  /* When Turnstile is disabled, render nothing at all.
   * The parent layout is structured so that this container
   * does not affect spacing when it's invisible. */

  if (!isTurnstileEnabled()) {
    return null;
  }

  /* ---- FUTURE IMPLEMENTATION ---- */

  /* When Turnstile is enabled, this will render:
   *
   *   1. A container with `min-h-[72px]` to reserve space
   *      and prevent layout shift when the widget loads.
   *
   *   2. The Cloudflare Turnstile <div> ref that the
   *      turnstile.render() call attaches to.
   *
   *   3. An error state if the widget fails to load.
   *
   * Example structure:
   *
   *   <div className="turnstile-container min-h-[72px] flex flex-col items-center justify-center py-2">
   *     <div
   *       ref={turnstileRef}
   *       id="turnstile-widget"
   *       className="cf-turnstile"
   *       data-sitekey={turnstileConfig.siteKey}
   *       data-theme={turnstileConfig.theme}
   *       data-size={turnstileConfig.size}
   *       data-callback="turnstileCallback"
   *     />
   *     {error && (
   *       <p className="text-xs text-red-500 mt-1">
   *         <i className="ri-error-warning-line mr-1"></i>
   *         {error}
   *       </p>
   *     )}
   *   </div>
   */

  /* ---- END FUTURE ---- */

  /* Placeholder render for when enabled but not yet implemented.
   * Shows a subtle placeholder so developers can see it during
   * integration testing.  This block is removed once the real
   * widget is implemented. */

  return (
    <div
      id="turnstile-placeholder"
      className="min-h-[72px] flex flex-col items-center justify-center py-2"
      aria-hidden="true"
    >
      <div className="w-full max-w-[304px] h-[65px] rounded-lg border-2 border-dashed border-background-300/50 bg-background-100/30 flex items-center justify-center">
        <span className="text-[10px] text-foreground-300 uppercase tracking-wider">
          Turnstile Verification
        </span>
      </div>
    </div>
  );
}