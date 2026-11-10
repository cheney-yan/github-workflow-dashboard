'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

interface InsecureContextBannerProps {
  /** Injectable for tests; defaults to the real page protocol. */
  protocol?: string;
}

/**
 * Warn when the UI is served over plain HTTP. A network attacker who can modify
 * this page could also read the GitHub token entered into it, so the warning is
 * shown before the dashboard is used. The page itself remains fully usable.
 *
 * The protocol is read after mount so the static HTML (which has no banner) and
 * the client render stay identical during hydration.
 */
export function InsecureContextBanner({ protocol }: InsecureContextBannerProps) {
  const [isHttp, setIsHttp] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration-safe check
    setIsHttp((protocol ?? window.location.protocol) === 'http:');
  }, [protocol]);

  if (!isHttp) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
    >
      <div className="container mx-auto flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <p>
          <strong>Insecure connection.</strong> This page is served over HTTP, so a network
          attacker could modify it and steal your GitHub token. Use the HTTPS endpoint before
          entering a token.
        </p>
      </div>
    </div>
  );
}
