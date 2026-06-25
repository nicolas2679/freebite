import { useState } from "react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";

const STORAGE_KEY = "freebite-beta-access";

export default function App() {
  const [hasAccess, setHasAccess] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true",
  );
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!hasSupabaseConfig || !supabase) {
      setError("Beta access is not configured yet.");
      return;
    }

    const normalizedCode = inviteCode.trim();

    if (!normalizedCode) {
      setError("Enter your invite code.");
      return;
    }

    setIsChecking(true);
    setError("");

    const { data, error: redeemError } = await supabase.rpc(
      "redeem_beta_invite",
      {
        invite_code: normalizedCode,
      },
    );

    setIsChecking(false);

    if (redeemError) {
      setError("We could not check that code. Try again in a moment.");
      return;
    }

    if (data === true) {
      localStorage.setItem(STORAGE_KEY, "true");
      setHasAccess(true);
      return;
    }

    setError("That invite code is invalid, expired, or already used.");
  }

  if (hasAccess) {
    return (
      <main className="site portal-page">
        <p className="eyebrow">FreeBite restaurant portal</p>
        <h1>Welcome to the FreeBite beta.</h1>
        <p>
          This is a sample portal page. Restaurant login, registration, and
          listing submission will be added after the account and approval flow
          is planned.
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setHasAccess(false);
            setInviteCode("");
          }}
          type="button"
        >
          Lock portal
        </button>
      </main>
    );
  }

  return (
    <main className="site gate-page">
      <section className="gate-panel">
        <img
          alt="FreeBite"
          className="gate-logo"
          src="/freebite-logo-horizontal-green.svg"
        />
        <p className="eyebrow">FreeBite restaurant portal</p>
        <h1>Beta access</h1>
        <p>
          Enter your invite code to continue to the restaurant partner portal.
        </p>

        <form className="gate-form" onSubmit={handleSubmit}>
          <label htmlFor="invite-code">Invite code</label>
          <input
            autoComplete="one-time-code"
            id="invite-code"
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Enter invite code"
            type="password"
            value={inviteCode}
          />
          {error ? <p className="error-message">{error}</p> : null}
          <button disabled={isChecking} type="submit">
            {isChecking ? "Checking..." : "Continue"}
          </button>
        </form>

        <p className="note">For invited restaurant partners.</p>
      </section>
    </main>
  );
}
