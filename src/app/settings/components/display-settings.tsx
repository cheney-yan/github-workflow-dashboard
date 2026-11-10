'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { REFRESH_INTERVALS, useDisplaySettings } from '@/contexts/display-settings-context';
import { useTheme } from '@/contexts/theme-context';
import { Monitor, Moon, Sun, Zap } from 'lucide-react';

export function DisplaySettings() {
  const { settings, toggleCompactMode, setRefreshInterval, getRefreshIntervalLabel, setDashboardName } = useDisplaySettings();
  const { theme, toggleTheme } = useTheme();
  const [dashboardNameInput, setDashboardNameInput] = useState(settings.dashboardName);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          Display Settings
        </CardTitle>
        <CardDescription>Customize the appearance and behavior of the dashboard</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Theme</Label>
            <p className="text-sm text-muted-foreground">Choose between light and dark mode</p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="flex items-center gap-2">
            {theme === 'dark' ? (
              <><Sun className="w-4 h-4" />Light</>
            ) : (
              <><Moon className="w-4 h-4" />Dark</>
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="compact-mode">Compact Mode</Label>
            <p className="text-sm text-muted-foreground">Show more workflow statuses in less space</p>
          </div>
          <Switch id="compact-mode" checked={settings.compactMode} onCheckedChange={toggleCompactMode} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dashboard-name">Dashboard Name</Label>
          <div className="flex gap-2">
            <Input
              id="dashboard-name"
              value={dashboardNameInput}
              onChange={(event) => setDashboardNameInput(event.target.value)}
              placeholder="GitHub Workflow Dashboard"
              className="flex-1"
            />
            <Button
              onClick={() => setDashboardName(dashboardNameInput)}
              disabled={dashboardNameInput === settings.dashboardName}
              size="sm"
            >
              Update
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Customize the title shown in the dashboard header</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="refresh-interval">Auto Refresh Interval</Label>
          <Select
            value={settings.refreshInterval.toString()}
            onValueChange={(value) => {
              const interval = REFRESH_INTERVALS.find((item) => item.value === Number(value));
              if (interval) setRefreshInterval(interval.value);
            }}
          >
            <SelectTrigger className="w-full" id="refresh-interval">
              <SelectValue placeholder="Select refresh interval">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  {getRefreshIntervalLabel(settings.refreshInterval)}
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {REFRESH_INTERVALS.map((interval) => (
                <SelectItem key={interval.value} value={interval.value.toString()}>
                  {interval.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            How often the dashboard should automatically update workflow statuses
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
