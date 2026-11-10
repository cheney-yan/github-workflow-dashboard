'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export function SecuritySection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          Security &amp; Privacy
        </CardTitle>
        <CardDescription>
          The dashboard is client-only: no backend ever receives your token.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          The token is encrypted with AES-256-GCM using a random per-browser key kept in
          IndexedDB. Only ciphertext is written to localStorage.
        </p>
        <p>
          GitHub API requests go directly from this browser to{' '}
          <code className="bg-muted px-1 rounded">api.github.com</code>. Workflow data and
          selections stay on this device.
        </p>
        <p>
          Use <strong>Remove</strong> above before using a shared computer. Residual risk: any
          script running on this origin could use the key, so keep the app self-hosted and up to date.
        </p>
        <p>
          <a
            href="https://github.com/cheney-yan/github-workflow-dashboard/blob/main/docs/SECURITY-AUDIT.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Read the security audit and residual risks →
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
