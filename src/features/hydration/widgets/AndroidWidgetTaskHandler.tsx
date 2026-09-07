import { registerWidgetTaskHandler, requestWidgetUpdate } from 'react-native-android-widget';
import { SiplyCircularWidget } from './SiplyCircularWidget';
import { SiplyLinearWidget } from './SiplyLinearWidget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

export async function renderAndroidWidget(isLinear: boolean = false) {
  let progress = { date: '', consumedMl: 0 };
  let settings = { targetLiters: 3 };
  
  try {
    const storeData = await AsyncStorage.getItem('siply:hydration_store:v1');
    if (storeData) {
      const parsed = JSON.parse(storeData);
      if (parsed.state) {
        if (parsed.state.progress) progress = parsed.state.progress;
        if (parsed.state.settings) settings = parsed.state.settings;
      }
    }
  } catch (err) {
    console.error('Failed to load widget data', err);
  }

  const targetMl = Math.round(settings.targetLiters * 1000);
  const percentage = targetMl > 0 ? Math.round((progress.consumedMl / targetMl) * 100) : 0;

  if (isLinear) {
    return <SiplyLinearWidget consumedMl={progress.consumedMl} targetMl={targetMl} percentage={percentage} />;
  }
  return <SiplyCircularWidget consumedMl={progress.consumedMl} targetMl={targetMl} percentage={percentage} />;
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
