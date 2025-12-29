import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const root = process.cwd();
const svgPath = path.join(root, "assets", "icon", "siply-icon.svg");
const iconPath = path.join(root, "assets", "icon.png");
const adaptivePath = path.join(root, "assets", "adaptive-icon.png");

const svgBuffer = await readFile(svgPath);

await sharp(svgBuffer).resize(1024, 1024).png().toFile(iconPath);
await sharp(svgBuffer).resize(1024, 1024).png().toFile(adaptivePath);

console.log("Generated icons:", iconPath, adaptivePath);
