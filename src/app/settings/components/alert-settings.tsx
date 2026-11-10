'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDisplaySettings } from '@/contexts/display-settings-context';
import { Bell, BellOff } from 'lucide-react';

type PermissionState = NotificationPermission | 'unsupported';

function currentPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function AlertSettings() {
  const { settings, setAlertPreferences } = useDisplaySettings();
  const alerts = settings.alerts;
  const [permission, setPermission] = useState<PermissionState>(currentPermission);

  const requestPermission = async (): Promise<boolean> => {
    if (permission === 'unsupported') return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (!enabled) {
      setAlertPreferences({ enabled: false });
      return;
    }
    const granted = await requestPermission();
    setAlertPreferences({ enabled: granted });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {alerts.enabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          Alerts
        </CardTitle>
        <CardDescription>
          Browser notifications while this dashboard is open. Nothing is sent to a server.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="alerts-enabled">Enable browser notifications</Label>
            <p className="text-sm text-muted-foreground">
              {permission === 'granted'
                ? 'Permission granted for this site.'
                : permission === 'denied'
                  ? 'Permission blocked in the browser settings.'
                  : permission === 'unsupported'
                    ? 'This browser does not support notifications.'
                    : 'The browser will ask for permission.'}
            </p>
          </div>
          <Switch
            id="alerts-enabled"
            checked={alerts.enabled}
            onCheckedChange={toggleEnabled}
            disabled={permission === 'unsupported' || permission === 'denied'}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="alerts-failure">Default-branch failures</Label>
            <p className="text-sm text-muted-foreground">
              Notify when the latest run on the default branch fails.
            </p>
          </div>
          <Switch
            id="alerts-failure"
            checked={alerts.notifyOnFailure}
            onCheckedChange={(checked) => setAlertPreferences({ notifyOnFailure: checked })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="alerts-queue">Queue warning (minutes)</Label>
            <Input
              id="alerts-queue"
              type="number"
              min={5}
              max={240}
              value={alerts.queueMinutes}
              onChange={(event) => setAlertPreferences({ queueMinutes: Number(event.target.value) })}
            />
            <p className="text-xs text-muted-foreground">5–240 minutes before a queued run alerts.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="alerts-runtime">Runtime warning (minutes)</Label>
            <Input
              id="alerts-runtime"
              type="number"
              min={10}
              max={480}
              value={alerts.runMinutes}
              onChange={(event) => setAlertPreferences({ runMinutes: Number(event.target.value) })}
            />
            <p className="text-xs text-muted-foreground">10–480 minutes before a running job alerts.</p>
          </div>
        </div>

        {permission !== 'granted' && permission !== 'unsupported' && permission !== 'denied' && (
          <Button variant="outline" size="sm" onClick={requestPermission}>
            Request notification permission
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
