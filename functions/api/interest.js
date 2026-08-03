const MAX_USEFULNESS_LENGTH = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

let tokenCache = null;

export async function onRequestPost({ request, env }) {
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (contentLength > 8192) {
    return jsonResponse({ error: "Submission is too large." }, 413);
  }

  let submission;

  try {
    const rawSubmission = await request.text();

    if (rawSubmission.length > 8192) {
      return jsonResponse({ error: "Submission is too large." }, 413);
    }

    submission = JSON.parse(rawSubmission);
  } catch {
    return jsonResponse({ error: "Invalid submission." }, 400);
  }

  const email = String(submission.email || "").trim().toLowerCase();
  const usefulness = String(submission.usefulness || "").trim();
  const turnstileToken = String(submission.turnstileToken || "");

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return jsonResponse({ error: "Enter a valid email address." }, 400);
  }

  if (usefulness.length > MAX_USEFULNESS_LENGTH) {
    return jsonResponse(
      { error: "The optional response must be 1,000 characters or fewer." },
      400,
    );
  }

  if (submission.consent !== true) {
    return jsonResponse({ error: "Consent is required." }, 400);
  }

  if (!turnstileToken || turnstileToken.length > 2048) {
    return jsonResponse(
      { error: "Complete the security check and try again." },
      400,
    );
  }

  const isLocalRequest = ["localhost", "127.0.0.1"].includes(
    new URL(request.url).hostname,
  );

  if (!isLocalRequest && !env.TURNSTILE_SECRET_KEY) {
    console.error("Turnstile configuration is incomplete.");
    return jsonResponse(
      { error: "The interest form is not configured yet." },
      503,
    );
  }

  try {
    const isHuman = await validateTurnstile({
      env,
      isLocalRequest,
      request,
      token: turnstileToken,
    });

    if (!isHuman) {
      return jsonResponse(
        { error: "The security check expired. Please try again." },
        400,
      );
    }
  } catch (error) {
    console.error("Turnstile validation failed", error);
    return jsonResponse(
      { error: "The security check is unavailable. Please try again." },
      503,
    );
  }

  if (!hasMicrosoftConfig(env)) {
    console.error("Microsoft interest form configuration is incomplete.");
    return jsonResponse(
      { error: "The interest form is not configured yet." },
      503,
    );
  }

  try {
    const accessToken = await getAccessToken(env);
    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(env.MICROSOFT_SITE_ID)}/lists/${encodeURIComponent(env.MICROSOFT_LIST_ID)}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Title: email,
            Email: email,
            Usefulness: usefulness,
            Consented: "Yes",
            SubmittedAt: new Date().toISOString(),
            ConsentVersion: "interest-v2",
            Source: "freebite.ca",
          },
        }),
      },
    );

    if (!graphResponse.ok) {
      console.error("Microsoft Graph rejected an interest submission", {
        status: graphResponse.status,
        requestId: graphResponse.headers.get("request-id"),
      });
      return jsonResponse(
        { error: "We could not save your response. Please try again." },
        502,
      );
    }

    return jsonResponse({ success: true }, 201);
  } catch (error) {
    console.error("Interest submission failed", error);
    return jsonResponse(
      { error: "We could not save your response. Please try again." },
      502,
    );
  }
}

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}

function hasMicrosoftConfig(env) {
  return [
    "MICROSOFT_TENANT_ID",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_SITE_ID",
    "MICROSOFT_LIST_ID",
  ].every((name) => Boolean(env[name]));
}

async function validateTurnstile({ env, isLocalRequest, request, token }) {
  const secret = isLocalRequest
    ? TURNSTILE_TEST_SECRET_KEY
    : env.TURNSTILE_SECRET_KEY;
  const validationBody = new URLSearchParams({
    secret,
    response: token,
    idempotency_key: crypto.randomUUID(),
  });
  const remoteIp = request.headers.get("CF-Connecting-IP");

  if (remoteIp) {
    validationBody.set("remoteip", remoteIp);
  }

  const validationResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: validationBody,
    },
  );

  if (!validationResponse.ok) {
    throw new Error(`Turnstile returned ${validationResponse.status}.`);
  }

  const validation = await validationResponse.json();

  if (!validation.success) {
    return false;
  }

  if (isLocalRequest) {
    return true;
  }

  return (
    validation.hostname === new URL(request.url).hostname &&
    validation.action === "interest_signup"
  );
}

async function getAccessToken(env) {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.value;
  }

  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(env.MICROSOFT_TENANT_ID)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  if (!tokenResponse.ok) {
    throw new Error(`Microsoft authentication failed (${tokenResponse.status}).`);
  }

  const token = await tokenResponse.json();
  tokenCache = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in - 120, 60) * 1000,
  };

  return tokenCache.value;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
