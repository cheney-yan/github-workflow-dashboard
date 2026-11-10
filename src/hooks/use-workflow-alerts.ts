'use client';

import { useEffect, useRef } from 'react';
import type { RepositoryWorkflows } from '@/contexts/workflow-context';
import { evaluateWorkflowAlerts, type AlertPreferences } from '@/lib/alerts';

/**
 * Deliver browser notifications for alert rules. Delivery is deduplicated per
 * repository/run/kind, so a refresh does not repeat the same alert.
 */
export function useWorkflowAlerts(
  repositories: RepositoryWorkflows[],
  preferences: AlertPreferences
): void {
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!preferences.enabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const alerts = evaluateWorkflowAlerts(repositories, preferences);
    for (const alert of alerts) {
      if (notifiedRef.current.has(alert.key)) continue;
      try {
        new Notification(alert.title, {
          body: alert.body,
          tag: alert.key,
          icon: '/favicon.ico',
        });
      } catch {
        // Notification construction can fail on some platforms; keep the
        // dashboard working and do not retry endlessly.
      }
      notifiedRef.current.add(alert.key);
    }

    if (notifiedRef.current.size > 1000) notifiedRef.current.clear();
  }, [repositories, preferences]);
}
