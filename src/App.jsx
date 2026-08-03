import { useCallback, useEffect, useRef, useState } from "react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";

const STORAGE_KEY = "freebite-beta-access";
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

const emptySubmission = {
  name: "",
  cuisine: "",
  address: "",
  priceLevel: "",
  latitude: "",
  longitude: "",
};

const requiredFields = ["name", "cuisine", "address", "priceLevel"];

export default function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const isRestaurantPortal = normalizedPath === "/restaurants";
  const isPrivacyPage = normalizedPath === "/privacy";

  useEffect(() => {
    if (isRestaurantPortal) {
      document.title = "Restaurant portal | FreeBite";
    } else if (isPrivacyPage) {
      document.title = "Privacy | FreeBite";
    } else {
      document.title = "FreeBite | Stay updated";
    }
  }, [isPrivacyPage, isRestaurantPortal]);

  if (isRestaurantPortal) {
    return <RestaurantPortal />;
  }

  if (isPrivacyPage) {
    return <PrivacyPage />;
  }

  return <LaunchPage />;
}

function LaunchPage() {
  const [hasJoined, setHasJoined] = useState(false);
  const [usefulness, setUsefulness] = useState("");
  const [isSubmittingInterest, setIsSubmittingInterest] = useState(false);
  const [interestError, setInterestError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const handleTurnstileError = useCallback(() => {
    setTurnstileToken("");
    setInterestError(
      "The security check could not load. Refresh and try again.",
    );
  }, []);

  async function handleEarlyAccessSubmit(event) {
    event.preventDefault();

    if (!turnstileToken) {
      setInterestError("Complete the security check and try again.");
      return;
    }

    setIsSubmittingInterest(true);
    setInterestError("");

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          usefulness: formData.get("usefulness"),
          consent: formData.get("consent") === "on",
          turnstileToken,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "We could not save your response.");
      }

      setHasJoined(true);
    } catch (error) {
      setInterestError(
        error instanceof Error
          ? error.message
          : "We could not save your response. Please try again.",
      );
      setTurnstileToken("");
      setTurnstileResetKey((currentKey) => currentKey + 1);
    } finally {
      setIsSubmittingInterest(false);
    }
  }

  return (
    <div className="launch-page">
      <LaunchHeader />

      <main className="interest-main">
        <section className="interest-content" aria-labelledby="interest-title">
          <h1 id="interest-title">Interested in FreeBite?</h1>
          <p>
            Leave your email to receive updates and hear when FreeBite becomes
            available.
          </p>

          {hasJoined ? (
            <div className="interest-success" role="status">
              <h2>Thanks.</h2>
              <p>We&apos;ll keep you updated.</p>
            </div>
          ) : (
            <form className="interest-form" onSubmit={handleEarlyAccessSubmit}>
              <label className="interest-field-label" htmlFor="interest-email">
                Email address <span aria-hidden="true">*</span>
              </label>
              <input
                autoComplete="email"
                className="interest-email"
                id="interest-email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />

              <label
                className="interest-field-label interest-question-label"
                htmlFor="interest-usefulness"
              >
                What would make FreeBite most useful to you?
                <span>Optional</span>
              </label>
              <textarea
                className="interest-response"
                id="interest-usefulness"
                maxLength="1000"
                name="usefulness"
                onChange={(event) => setUsefulness(event.target.value)}
                placeholder="Enter your answer"
                rows="4"
                value={usefulness}
              />
              <p className="interest-character-count">
                {usefulness.length}/1000
              </p>

              <label className="interest-consent">
                <input name="consent" required type="checkbox" />
                <span>
                  I agree to receive emails from FreeBite Inc. about product
                  updates and availability. I can unsubscribe at any time.
                </span>
              </label>

              <p className="interest-legal">
                FreeBite Inc., 303-740 Proudfoot Lane, London, ON N6H 5H2,
                Canada. <a href="mailto:hello@freebite.ca">hello@freebite.ca</a>
                {" | "}
                <a href="/privacy">Privacy</a>
              </p>

              <TurnstileWidget
                key={turnstileResetKey}
                onError={handleTurnstileError}
                onToken={setTurnstileToken}
              />

              {interestError ? (
                <p className="interest-error" role="alert">
                  {interestError}
                </p>
              ) : null}

              <button
                className="interest-submit"
                disabled={isSubmittingInterest || !turnstileToken}
                type="submit"
              >
                {isSubmittingInterest ? "Submitting..." : "Keep me updated"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function TurnstileWidget({ onError, onToken }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let widgetId;
    let renderTimer;
    const isLocalhost = ["localhost", "127.0.0.1"].includes(
      window.location.hostname,
    );
    const siteKey = isLocalhost
      ? TURNSTILE_TEST_SITE_KEY
      : import.meta.env.VITE_TURNSTILE_SITE_KEY;

    if (!siteKey) {
      onError();
      return undefined;
    }

    function renderWidget() {
      if (!containerRef.current || !window.turnstile || widgetId !== undefined) {
        return;
      }

      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: "interest_signup",
        appearance: "interaction-only",
        size: "flexible",
        theme: "light",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": onError,
      });

      window.clearInterval(renderTimer);
    }

    renderWidget();

    if (widgetId === undefined) {
      renderTimer = window.setInterval(renderWidget, 100);
    }

    return () => {
      window.clearInterval(renderTimer);

      if (widgetId !== undefined && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [onError, onToken]);

  return <div className="interest-turnstile" ref={containerRef} />;
}

function PrivacyPage() {
  return (
    <div className="launch-page">
      <LaunchHeader />
      <main className="privacy-main">
        <article className="privacy-content">
          <p className="eyebrow">Last updated August 3, 2026</p>
          <h1>Privacy</h1>
          <p>
            FreeBite Inc. collects the information you choose to submit through
            the interest form on freebite.ca.
          </p>

          <h2>Information we collect</h2>
          <p>
            We collect your email address, your consent to receive updates, and
            your optional answer about what would make FreeBite useful to you.
          </p>

          <h2>How we use it</h2>
          <p>
            We use this information to send FreeBite product and availability
            updates and to understand what prospective users value. We do not
            sell this information.
          </p>

          <h2>Storage and service providers</h2>
          <p>
            Responses are stored in FreeBite&apos;s Microsoft 365 environment.
            Cloudflare processes form submissions and security checks for the
            website. We limit access to people and services that need it for
            these purposes and keep it only as long as needed for those
            purposes or our legal obligations.
          </p>

          <h2>Your choices</h2>
          <p>
            You can unsubscribe from emails at any time. You may also ask to
            access, correct, or delete your submitted information by contacting
            us.
          </p>

          <h2>Contact</h2>
          <address>
            FreeBite Inc.
            <br />
            303-740 Proudfoot Lane
            <br />
            London, ON N6H 5H2, Canada
            <br />
            <a href="mailto:hello@freebite.ca">hello@freebite.ca</a>
          </address>
        </article>
      </main>
    </div>
  );
}

function LaunchHeader() {
  return (
    <header className="launch-header">
      <a aria-label="FreeBite home" className="launch-brand" href="/">
        <img alt="FreeBite" src="/freebite-logo-horizontal-green.svg" />
      </a>
      <a className="restaurant-portal-link" href="/restaurants">
        Restaurant portal
      </a>
    </header>
  );
}

function RestaurantPortal() {
  const [hasAccess, setHasAccess] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true",
  );
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [screen, setScreen] = useState("entry");
  const [isPortalSignedIn, setIsPortalSignedIn] = useState(false);
  const [submission, setSubmission] = useState(emptySubmission);
  const [submissionStatus, setSubmissionStatus] = useState("none");
  const [portalMessage, setPortalMessage] = useState("");

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

  function unlockMockAccount(nextScreen = "dashboard") {
    setIsPortalSignedIn(true);
    setPortalMessage("");
    setScreen(nextScreen);
  }

  function handleSubmissionChange(event) {
    const { name, value } = event.target;

    setSubmission((currentSubmission) => ({
      ...currentSubmission,
      [name]: value,
    }));
  }

  function saveDraft(event) {
    event.preventDefault();
    setSubmissionStatus("draft");
    setPortalMessage("Draft saved for this local prototype.");
    setScreen("dashboard");
  }

  function submitForReview(event) {
    event.preventDefault();

    const hasMissingRequiredField = requiredFields.some(
      (field) => !submission[field].trim(),
    );

    if (hasMissingRequiredField) {
      setPortalMessage("Add the required restaurant details before submitting.");
      return;
    }

    setSubmissionStatus("submitted");
    setPortalMessage("Submission received. FreeBite review is the next step.");
    setScreen("dashboard");
  }

  function resetBetaAccess() {
    localStorage.removeItem(STORAGE_KEY);
    setHasAccess(false);
    setInviteCode("");
    setScreen("entry");
    setIsPortalSignedIn(false);
  }

  if (!hasAccess) {
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

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <img
          alt="FreeBite"
          className="portal-logo"
          src="/freebite-logo-horizontal-green.svg"
        />
        <div className="portal-header-actions">
          {isPortalSignedIn ? (
            <button
              className="text-button"
              onClick={() => {
                setIsPortalSignedIn(false);
                setScreen("entry");
              }}
              type="button"
            >
              Sign out
            </button>
          ) : null}
          <button className="text-button" onClick={resetBetaAccess} type="button">
            Lock beta
          </button>
        </div>
      </header>

      {screen === "entry" ? (
        <PortalEntry
          onLogin={() => setScreen("login")}
          onRegister={() => setScreen("register")}
        />
      ) : null}

      {screen === "login" ? (
        <AuthPanel
          mode="login"
          onBack={() => setScreen("entry")}
          onSubmit={() => unlockMockAccount("dashboard")}
          switchMode={() => setScreen("register")}
        />
      ) : null}

      {screen === "register" ? (
        <AuthPanel
          mode="register"
          onBack={() => setScreen("entry")}
          onSubmit={() => unlockMockAccount("submission")}
          switchMode={() => setScreen("login")}
        />
      ) : null}

      {screen === "dashboard" ? (
        <Dashboard
          message={portalMessage}
          onEditSubmission={() => {
            setPortalMessage("");
            setScreen("submission");
          }}
          status={submissionStatus}
          submission={submission}
        />
      ) : null}

      {screen === "submission" ? (
        <SubmissionForm
          message={portalMessage}
          onBack={() => {
            setPortalMessage("");
            setScreen("dashboard");
          }}
          onChange={handleSubmissionChange}
          onSaveDraft={saveDraft}
          onSubmitForReview={submitForReview}
          submission={submission}
        />
      ) : null}
    </main>
  );
}

function PortalEntry({ onLogin, onRegister }) {
  return (
    <section className="portal-grid">
      <div className="portal-intro">
        <p className="eyebrow">Restaurant beta</p>
        <h1>Manage your FreeBite restaurant profile.</h1>
        <p>
          Create or submit one restaurant listing for review. Approved listings
          can later become part of the FreeBite app experience using the fields
          the mobile app already supports.
        </p>
      </div>

      <section className="portal-card action-card">
        <h2>Continue to the portal</h2>
        <p>
          This draft uses mock login/register screens locally. Supabase Auth and
          restaurant submission storage come next.
        </p>
        <div className="button-stack">
          <button onClick={onRegister} type="button">
            Create restaurant account
          </button>
          <button className="secondary-button" onClick={onLogin} type="button">
            Log in
          </button>
        </div>
      </section>
    </section>
  );
}

function AuthPanel({ mode, onBack, onSubmit, switchMode }) {
  const isRegistering = mode === "register";

  return (
    <section className="portal-card auth-card">
      <button className="back-button" onClick={onBack} type="button">
        Back
      </button>
      <p className="eyebrow">Restaurant account</p>
      <h1>{isRegistering ? "Create your account" : "Log in"}</h1>
      <p>
        {isRegistering
          ? "Use the email you want associated with your restaurant submission."
          : "Return to your restaurant submission and portal status."}
      </p>

      <form
        className="portal-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {isRegistering ? (
          <label>
            Contact name
            <input placeholder="Your name" type="text" />
          </label>
        ) : null}
        <label>
          Email
          <input placeholder="you@example.com" type="email" />
        </label>
        <label>
          Password
          <input placeholder="Password" type="password" />
        </label>
        <button type="submit">
          {isRegistering ? "Create account" : "Log in"}
        </button>
      </form>

      <button className="inline-link" onClick={switchMode} type="button">
        {isRegistering
          ? "Already have an account? Log in"
          : "Need an account? Register"}
      </button>
    </section>
  );
}

function Dashboard({ message, onEditSubmission, status, submission }) {
  const hasSubmission = status !== "none";
  const statusLabel = {
    none: "Not started",
    draft: "Draft",
    submitted: "Pending review",
  }[status];

  return (
    <section className="dashboard-layout">
      <div>
        <p className="eyebrow">Portal dashboard</p>
        <h1>{hasSubmission ? "Restaurant submission" : "Start your listing"}</h1>
        <p>
          The beta portal is focused on one thing first: collecting a restaurant
          profile for FreeBite review using the current app restaurant fields.
        </p>
      </div>

      {message ? <p className="success-message">{message}</p> : null}

      <section className="portal-card status-card">
        <div>
          <p className="card-label">Current status</p>
          <h2>{statusLabel}</h2>
          <p>
            {status === "none"
              ? "Create a restaurant profile draft and submit it for review."
              : null}
            {status === "draft"
              ? "Your local draft is started. Continue editing when ready."
              : null}
            {status === "submitted"
              ? "Your submission is in review. Public listings are not created automatically."
              : null}
          </p>
        </div>
        <button onClick={onEditSubmission} type="button">
          {status === "none" ? "Start submission" : "Edit submission"}
        </button>
      </section>

      {hasSubmission ? (
        <section className="portal-card details-card">
          <p className="card-label">Submitted details</p>
          <h2>{submission.name || "Untitled restaurant"}</h2>
          <dl className="details-list">
            <div>
              <dt>Cuisine</dt>
              <dd>{submission.cuisine || "Not added"}</dd>
            </div>
            <div>
              <dt>Price level</dt>
              <dd>{submission.priceLevel || "Not added"}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{submission.address || "Not added"}</dd>
            </div>
            <div>
              <dt>Latitude</dt>
              <dd>{submission.latitude || "To be geocoded"}</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{submission.longitude || "To be geocoded"}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="portal-card quiet-card">
        <p className="card-label">App-controlled fields</p>
        <h2>Ratings and tags come from reviews.</h2>
        <p>
          Food rating, safety rating, review count, allergy tags, diet tags, and
          photos are derived from active user reviews in the mobile app. They
          are intentionally not editable by restaurants.
        </p>
      </section>
    </section>
  );
}

function SubmissionForm({
  message,
  onBack,
  onChange,
  onSaveDraft,
  onSubmitForReview,
  submission,
}) {
  return (
    <section className="portal-card submission-card">
      <button className="back-button" onClick={onBack} type="button">
        Back to dashboard
      </button>
      <p className="eyebrow">Restaurant submission</p>
      <h1>Create your restaurant profile</h1>
      <p>
        This form only includes fields the current mobile app already stores for
        restaurants. Coordinates can be entered manually for now or geocoded
        during review.
      </p>

      {message ? <p className="error-message">{message}</p> : null}

      <form className="portal-form submission-form" onSubmit={onSubmitForReview}>
        <label>
          Restaurant name *
          <input
            name="name"
            onChange={onChange}
            placeholder="Restaurant name"
            type="text"
            value={submission.name}
          />
        </label>
        <label>
          Cuisine *
          <input
            name="cuisine"
            onChange={onChange}
            placeholder="Thai, bakery, cafe..."
            type="text"
            value={submission.cuisine}
          />
        </label>
        <label className="span-two">
          Address *
          <input
            name="address"
            onChange={onChange}
            placeholder="Street address"
            type="text"
            value={submission.address}
          />
        </label>
        <label>
          Price level *
          <select
            name="priceLevel"
            onChange={onChange}
            value={submission.priceLevel}
          >
            <option value="">Select one</option>
            <option value="$">$</option>
            <option value="$$">$$</option>
            <option value="$$$">$$$</option>
          </select>
        </label>
        <label>
          Latitude
          <input
            name="latitude"
            onChange={onChange}
            placeholder="43.6532"
            step="any"
            type="number"
            value={submission.latitude}
          />
        </label>
        <label>
          Longitude
          <input
            name="longitude"
            onChange={onChange}
            placeholder="-79.3832"
            step="any"
            type="number"
            value={submission.longitude}
          />
        </label>

        <div className="form-actions span-two">
          <button className="secondary-button" onClick={onSaveDraft} type="button">
            Save draft
          </button>
          <button type="submit">Submit for review</button>
        </div>
      </form>
    </section>
  );
}
