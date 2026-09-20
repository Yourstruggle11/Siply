import { registerWidgetTaskHandler, requestWidgetUpdate } from 'react-native-android-widget';
import { SiplyCircularWidget } from './SiplyCircularWidget';
import { SiplyLinearWidget } from './SiplyLinearWidget';
import React from 'react';
import { DEFAULT_SETTINGS } from '../../../core/constants';
import { getDateKey } from '../../../core/time';
import { buildWidgetHydrationData } from './widgetData';
import { getScheduleSnapshot } from '../notifications/scheduleEngine';

export async function renderAndroidWidget(isLinear: boolean = false) {
  let source = {
    progress: { date: getDateKey(new Date()), consumedMl: 0 },
    settings: DEFAULT_SETTINGS,
  };
  
  try {
    // Deferred to avoid the store/widget registration import cycle on Android.
    const { readPersistedHydrationSnapshot } = require('../state/hydrationStore') as typeof import('../state/hydrationStore');
    const snapshot = await readPersistedHydrationSnapshot();
    if (snapshot) source = { progress: snapshot.progress, settings: snapshot.settings };
  } catch (err) {
    console.error('Failed to load widget data', err);
  }

  const scheduleSnapshot = await getScheduleSnapshot().catch(() => null);
  const widgetData = buildWidgetHydrationData(source, new Date(), scheduleSnapshot);

  if (isLinear) {
    return <SiplyLinearWidget {...widgetData} />;
  }
  return <SiplyCircularWidget {...widgetData} />;
}

export function registerAndroidWidget() {
  registerWidgetTaskHandler(async ({ widgetAction, widgetInfo }) => {
    if (widgetAction === 'WIDGET_ADDED' || widgetAction === 'WIDGET_UPDATE' || widgetAction === 'WIDGET_RESIZED') {
      const isLinear = widgetInfo.widgetName === 'SiplyLinearWidget';
      requestWidgetUpdate({
        widgetName: widgetInfo.widgetName,
        renderWidget: () => renderAndroidWidget(isLinear),
      });
    }
  });
}

export async function updateAndroidWidget() {
  // Update both widgets if they exist
  requestWidgetUpdate({
    widgetName: 'SiplyWidget',
    renderWidget: () => renderAndroidWidget(false),
  });
  
  requestWidgetUpdate({
    widgetName: 'SiplyLinearWidget',
    renderWidget: () => renderAndroidWidget(true),
  });
}
