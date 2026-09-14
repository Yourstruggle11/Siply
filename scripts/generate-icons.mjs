import { mkdir, readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const alternateDir = path.join(assetsDir, "app-icons");

const modernIconSource = path.join(assetsDir, "siply-logo-v2.png");
const modernForegroundSource = path.join(assetsDir, "siply-logo-modern-foreground.png");
const classicIconSource = path.join(assetsDir, "siply-logo-classic.png");
const glossyForegroundSource = path.join(assetsDir, "siply-logo-glossy.png");

const primaryIconPath = path.join(assetsDir, "icon.png");
const primaryForegroundPath = path.join(assetsDir, "adaptive-icon.png");
const splashIconPath = path.join(assetsDir, "splash-icon.png");

const classicIconPath = path.join(alternateDir, "classic.png");
const classicForegroundPath = path.join(alternateDir, "classic-foreground.png");
const glossyIconPath = path.join(alternateDir, "glossy.png");
const glossyForegroundPath = path.join(alternateDir, "glossy-foreground.png");

const ICON_SIZE = 1024;
const ADAPTIVE_ARTBOARD_SIZE = 800;
const MODERN_BACKGROUND = "#0C1117";
const CLASSIC_BACKGROUND = "#F5F6F7";

const adaptiveForeground = (source) => {
  const inset = (ICON_SIZE - ADAPTIVE_ARTBOARD_SIZE) / 2;
  return sharp(source)
    .resize(ADAPTIVE_ARTBOARD_SIZE, ADAPTIVE_ARTBOARD_SIZE)
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png();
};

await mkdir(alternateDir, { recursive: true });

const [modernIcon, modernForeground, classicIcon, glossyForeground] = await Promise.all([
  readFile(modernIconSource),
  readFile(modernForegroundSource),
  readFile(classicIconSource),
  readFile(glossyForegroundSource),
]);

await Promise.all([
  // The clean mark is Siply's default, fully opaque iOS/legacy Android icon.
  sharp(modernIcon)
    .resize(ICON_SIZE, ICON_SIZE)
    .flatten({ background: MODERN_BACKGROUND })
    .png()
    .toFile(primaryIconPath),
  // Android adaptive icon and splash use the isolated mark over a native background.
  adaptiveForeground(modernForeground).toFile(primaryForegroundPath),
  adaptiveForeground(modernForeground).toFile(splashIconPath),
  // Alternate iOS icons must be opaque; their Android foregrounds retain transparency.
  sharp(classicIcon)
    .resize(ICON_SIZE, ICON_SIZE)
    .flatten({ background: CLASSIC_BACKGROUND })
    .png()
    .toFile(classicIconPath),
  sharp(classicIcon)
    .resize(ICON_SIZE, ICON_SIZE)
    .png()
    .toFile(classicForegroundPath),
  sharp(glossyForeground)
    .resize(ICON_SIZE, ICON_SIZE)
    .flatten({ background: MODERN_BACKGROUND })
    .png()
    .toFile(glossyIconPath),
  adaptiveForeground(glossyForeground).toFile(glossyForegroundPath),
]);

console.log("Generated primary and alternate Siply app icons.");
