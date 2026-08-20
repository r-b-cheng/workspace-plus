import { callCommand } from '@/features/api/tauri-client';
import type { AppSettings, UpdateAppSettingsInput } from '@/lib/types';

export const settingsApi = {
  getAppSettings(): Promise<AppSettings> {
    return callCommand<AppSettings>('get_app_settings');
  },

  updateAppSettings(input: UpdateAppSettingsInput = {}): Promise<AppSettings> {
    return callCommand<AppSettings>('update_app_settings', {
      quickSwitchShortcut: input.quickSwitchShortcut,
    });
  },
};
