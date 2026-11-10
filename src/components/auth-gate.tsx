'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { GitHubTokenProvider } from '@/contexts/github-token-context';
import { RepositorySelectionProvider } from '@/contexts/repository-selection-context';
import { WorkflowProvider } from '@/contexts/workflow-context';
import { Loader } from 'lucide-react';

function CenteredLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
      <Loader className="mr-2 h-5 w-5 animate-spin" />
      Loading account…
    </div>
  );
}

/**
 * Client-side gate for the account session. API routes enforce the same
 * session server-side; this only decides what to render.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (pathname === '/login' || loading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.mustChangePassword) {
      router.replace('/login?change=1');
    }
  }, [loading, pathname, router, user]);

  if (pathname === '/login') return <>{children}</>;
  if (loading) return <CenteredLoader />;
  if (!user || user.mustChangePassword) return <CenteredLoader />;

  return (
    <GitHubTokenProvider>
      <RepositorySelectionProvider>
        <WorkflowProvider>{children}</WorkflowProvider>
      </RepositorySelectionProvider>
    </GitHubTokenProvider>
  );
}
