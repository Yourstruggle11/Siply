import type { ImageSourcePropType } from "react-native";

export type AppIconId = "modern" | "classic" | "glossy";

type AlternateAppIconsModule = {
  supportsAlternateIcons: boolean;
  getAppIconName: () => string | null;
  setAlternateAppIcon: (name: string | null) => Promise<string | null>;
};

let alternateAppIcons: AlternateAppIconsModule | null = null;

try {
  // Keep older development clients usable until they are rebuilt with the
  // native module. Metro still bundles this static dependency for new builds.
  alternateAppIcons = require("expo-alternate-app-icons") as AlternateAppIconsModule;
} catch {
  alternateAppIcons = null;
}

const NATIVE_ICON_NAMES: Record<AppIconId, string | null> = {
  modern: null,
  classic: "Classic",
  glossy: "Glossy",
};

export const APP_ICON_OPTIONS: ReadonlyArray<{
  id: AppIconId;
  label: string;
  description: string;
  preview: ImageSourcePropType;
}> = [
  {
    id: "modern",
    label: "Modern",
    description: "Clean water-drop progress mark",
    preview: require("../../assets/icon.png"),
  },
  {
    id: "classic",
    label: "Classic",
    description: "The original Siply reminder icon",
    preview: require("../../assets/app-icons/classic.png"),
  },
  {
    id: "glossy",
    label: "Glossy",
    description: "A brighter dimensional finish",
    preview: require("../../assets/app-icons/glossy.png"),
  },
];

export const supportsAppIconSelection = alternateAppIcons?.supportsAlternateIcons === true;

export const appIconIdFromNativeName = (name: string | null): AppIconId => {
  if (name === NATIVE_ICON_NAMES.classic) return "classic";
  if (name === NATIVE_ICON_NAMES.glossy) return "glossy";
  return "modern";
};

export const getSelectedAppIcon = (): AppIconId => {
  if (!supportsAppIconSelection || !alternateAppIcons) return "modern";

  try {
    return appIconIdFromNativeName(alternateAppIcons.getAppIconName());
  } catch {
    return "modern";
  }
};

export const selectAppIcon = async (icon: AppIconId): Promise<AppIconId> => {
  if (!supportsAppIconSelection || !alternateAppIcons) {
    throw new Error("Alternate app icons are not available in this build.");
  }

  const appliedName = await alternateAppIcons.setAlternateAppIcon(NATIVE_ICON_NAMES[icon]);
  return appIconIdFromNativeName(appliedName);
};
