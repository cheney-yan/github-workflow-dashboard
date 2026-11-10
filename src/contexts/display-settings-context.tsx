'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { normalizeAlertPreferences, type AlertPreferences } from '@/lib/alerts';

export const REFRESH_INTERVALS = [
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' }
] as const;

type RefreshInterval = typeof REFRESH_INTERVALS[number]['value'];

interface DisplaySettings {
  compactMode: boolean;
  refreshInterval: RefreshInterval;
  dashboardName: string;
  alerts: AlertPreferences;
}

interface DisplaySettingsContextType {
  settings: DisplaySettings;
  updateSettings: (updates: Partial<DisplaySettings>) => void;
  toggleCompactMode: () => void;
  setRefreshInterval: (interval: RefreshInterval) => void;
  getRefreshIntervalLabel: (interval: RefreshInterval) => string;
  setDashboardName: (name: string) => void;
  setAlertPreferences: (updates: Partial<AlertPreferences>) => void;
}

const DisplaySettingsContext = createContext<DisplaySettingsContextType | undefined>(undefined);

export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext);
  if (!context) {
    throw new Error('useDisplaySettings must be used within a DisplaySettingsProvider');
  }
  return context;
}

interface DisplaySettingsProviderProps {
  children: React.ReactNode;
}

const DEFAULT_SETTINGS: DisplaySettings = {
  compactMode: false,
  refreshInterval: 120, // Default 2 minutes (keeping existing behavior)
  dashboardName: 'GitHub Workflow Dashboard',
  alerts: normalizeAlertPreferences(),
};

const SETTINGS_KEY = 'github-flow-dashboard-settings';
const MAX_DASHBOARD_NAME = 80;

function sanitizeSettings(input: unknown): DisplaySettings {
  if (!input || typeof input !== 'object') return DEFAULT_SETTINGS;
  const value = input as Partial<DisplaySettings>;

  const refreshInterval = REFRESH_INTERVALS.some((interval) => interval.value === value.refreshInterval)
    ? (value.refreshInterval as RefreshInterval)
    : DEFAULT_SETTINGS.refreshInterval;

  const dashboardName =
    typeof value.dashboardName === 'string' && value.dashboardName.trim().length > 0
      ? value.dashboardName.trim().slice(0, MAX_DASHBOARD_NAME)
      : DEFAULT_SETTINGS.dashboardName;

  return {
    compactMode: value.compactMode === true,
    refreshInterval,
    dashboardName,
    alerts: normalizeAlertPreferences(value.alerts),
  };
}

export function DisplaySettingsProvider({ children }: DisplaySettingsProviderProps) {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_SETTINGS);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        setSettings(sanitizeSettings(JSON.parse(savedSettings)));
      }
    } catch (error) {
      console.warn('Failed to load display settings from localStorage:', error);
    }
  }, []);

  // Save settings to localStorage when they change
  const updateSettings = useCallback((updates: Partial<DisplaySettings>) => {
    setSettings((current) => {
      const newSettings = sanitizeSettings({ ...current, ...updates });
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      } catch (error) {
        console.warn('Failed to save display settings to localStorage:', error);
      }
      return newSettings;
    });
  }, []);

  const toggleCompactMode = useCallback(() => {
    setSettings((current) => {
      const newSettings = { ...current, compactMode: !current.compactMode };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      } catch {
        // Ignore blocked storage.
      }
      return newSettings;
    });
  }, []);

  const setRefreshInterval = useCallback((interval: RefreshInterval) => {
    updateSettings({ refreshInterval: interval });
  }, [updateSettings]);

  const setDashboardName = useCallback((name: string) => {
    updateSettings({ dashboardName: name });
  }, [updateSettings]);

  const setAlertPreferences = useCallback((updates: Partial<AlertPreferences>) => {
    setSettings((current) => {
      const newSettings = {
        ...current,
        alerts: normalizeAlertPreferences({ ...current.alerts, ...updates }),
      };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      } catch {
        // Ignore blocked storage.
      }
      return newSettings;
    });
  }, []);

  const getRefreshIntervalLabel = useCallback((interval: RefreshInterval): string => {
    const found = REFRESH_INTERVALS.find(item => item.value === interval);
    return found?.label || `${interval} seconds`;
  }, []);

  return (
    <DisplaySettingsContext.Provider
      value={{
        settings,
        updateSettings,
        toggleCompactMode,
        setRefreshInterval,
        getRefreshIntervalLabel,
        setDashboardName,
        setAlertPreferences
      }}
    >
      {children}
    </DisplaySettingsContext.Provider>
  );
}
