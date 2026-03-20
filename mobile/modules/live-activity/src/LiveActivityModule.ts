import { requireNativeModule } from 'expo';
import type { StartLiveActivityParams, UpdateLiveActivityParams } from './LiveActivity.types';

const nativeModule = requireNativeModule('LiveActivity');

export async function startLiveActivity(params: StartLiveActivityParams): Promise<void> {
  const raw = JSON.stringify(params);
  return nativeModule.startLiveActivity(raw);
}

export async function updateLiveActivity(params: UpdateLiveActivityParams): Promise<void> {
  const raw = JSON.stringify(params);
  return nativeModule.updateLiveActivity(raw);
}

export async function stopLiveActivity(): Promise<void> {
  return nativeModule.stopLiveActivity();
}

export function isLiveActivityRunning(): boolean {
  return nativeModule.isLiveActivityRunning();
}

export const areLiveActivitiesEnabled: boolean = nativeModule.areLiveActivitiesEnabled;
