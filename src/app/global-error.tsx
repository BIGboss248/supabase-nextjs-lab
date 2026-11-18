"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* `NextError` drives the default Next.js error UI. The App Router
        exposes no status code for errors, so pass 0 for a generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
