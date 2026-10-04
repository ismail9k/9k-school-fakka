"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Locale } from "@/i18n/routing";
import { loadTurnstile } from "@/lib/turnstile";

export type TurnstileHandle = { reset(): void };

type Props = {
  siteKey: string;
  locale: Locale;
  onToken(token: string | null): void;
  onError(): void;
  ref?: Ref<TurnstileHandle>;
};

// Cloudflare's bot check. Usually invisible; it only shows a box when it
// needs the visitor to click.
export function TurnstileWidget({ siteKey, locale, onToken, onError, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  });

  useImperativeHandle(
    ref,
    () => ({
      // Tokens are single-use: get a fresh one after every attempt.
      reset() {
        onTokenRef.current(null);
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId.current =
          turnstile.render(container.current, {
            sitekey: siteKey,
            action: "waitlist",
            language: locale,
            theme: "auto",
            appearance: "interaction-only",
            "response-field": false,
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => {
              onTokenRef.current(null);
              onErrorRef.current();
            },
          }) ?? null;
      })
      .catch(() => {
        if (cancelled) return;
        onTokenRef.current(null);
        onErrorRef.current();
      });

    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, locale]);

  return <div ref={container} className="mt-3 empty:mt-0" />;
}
