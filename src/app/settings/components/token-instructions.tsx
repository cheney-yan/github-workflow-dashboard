'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TokenInstructions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Token Instructions</CardTitle>
        <CardDescription>How to create and configure your GitHub Personal Access Token</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Required Permissions (fine-grained token):</h4>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                <code>Actions</code> - Read
              </span>
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                <code>Contents</code> - Read
              </span>
              <span className="text-xs bg-slate-100 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 px-2 py-1 rounded">
                <code>Metadata</code> - Read (automatic)
              </span>
              <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 px-2 py-1 rounded">
                <code>read:org</code> - only if you monitor organizations
              </span>
            </div>
          </div>

          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">💡 How to Create Your Token</h4>
            <div className="space-y-3">
              <div>
                <h5 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Option 1: Fine-grained Token (Recommended)</h5>
                <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <li>1. Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline font-medium">GitHub Settings → Personal access tokens</a></li>
                  <li>2. Click &quot;Generate new token&quot; → &quot;Fine-grained personal access token&quot;</li>
                  <li>3. Select your repositories or choose &quot;All repositories&quot;</li>
                  <li>4. Under &quot;Repository permissions&quot;, set:</li>
                  <li className="ml-4">• <strong>Actions:</strong> Read</li>
                  <li className="ml-4">• <strong>Contents:</strong> Read</li>
                  <li className="ml-4">• <strong>Metadata:</strong> Read (auto-selected)</li>
                  <li>5. Set an expiration date (90 days recommended)</li>
                  <li>6. Generate and copy your token immediately</li>
                </ol>
              </div>

              <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                <h5 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Option 2: Classic Token (Also Works)</h5>
                <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <li>1. Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline font-medium">GitHub Settings → Personal access tokens</a></li>
                  <li>2. Click &quot;Generate new token&quot; → &quot;Generate new token (classic)&quot;</li>
                  <li>3. Set an expiration date and note</li>
                  <li>4. Select these scopes:</li>
                  <li className="ml-4">• <strong>repo</strong> (read access to private repositories; use <strong>public_repo</strong> if you only monitor public ones)</li>
                  <li className="ml-4">• <strong>read:org</strong> (Read organization membership) - <em>for organization access</em></li>
                  <li>5. Generate and copy your token immediately</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">🔒 Security Best Practices</h4>
            <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
              <li>• Use <strong>fine-grained tokens</strong> instead of classic tokens for better security</li>
              <li>• Limit access to only the repositories you need to monitor</li>
              <li>• Set reasonable expiration dates and rotate tokens regularly</li>
              <li>• Never share your token or commit it to version control</li>
              <li>• This app encrypts tokens with AES-256-GCM; the key stays in IndexedDB, never in localStorage</li>
            </ul>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
            <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2">⚠️ Organization &amp; Cross-Repo Access</h4>
            <div className="text-xs text-orange-800 dark:text-orange-200 space-y-2">
              <p><strong>For scanning ALL organizations and repositories, you may need additional permissions:</strong></p>
              <ul className="space-y-1 mt-2">
                <li>• <strong>Organization approval:</strong> Fine-grained tokens require org admin approval</li>
                <li>• <strong>Classic tokens:</strong> May need <code className="bg-orange-100 dark:bg-orange-900 px-1 rounded">read:org</code> scope for organization access</li>
                <li>• <strong>Multiple orgs:</strong> Separate tokens may be needed for each organization</li>
                <li>• <strong>Private repos:</strong> Token must have explicit access to each private repository</li>
              </ul>
              <p className="mt-2 italic">Note: Some organizations may restrict or require approval for external tokens.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
