import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of traces in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  integrations: [
    // Session Replay masks all text and inputs by default.
    Sentry.replayIntegration(),
  ],

  // Replay 10% of sessions, plus 100% of sessions that hit an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
