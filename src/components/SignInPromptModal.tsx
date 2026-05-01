interface Props {
  /** Optional reason — shown as a contextual second line (e.g. "to buy seeds"). */
  reason?: string;
  onClose:  () => void;
  onSignIn: () => void | Promise<void>;
}

/**
 * Surfaced when a guest tries to perform an authenticated action (buy a seed,
 * upgrade slots, claim a marketplace listing, etc.). Replaces the previous
 * silent-failure path where the edge call would throw "Not authenticated"
 * and the optimistic state would roll back with no UI feedback.
 */
export function SignInPromptModal({ reason, onClose, onSignIn }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-primary/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-3xl">🌱</p>
          <h2 className="text-lg font-bold">Sign in to play</h2>
          <p className="text-sm text-muted-foreground">
            Create a free account to save your garden and unlock the full game{reason ? ` ${reason}` : ""}.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={() => { void onSignIn(); }}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity text-center"
          >
            Sign in with Google
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors text-center"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
