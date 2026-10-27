import type { Plugin } from "vite";
import type { BeforeAfterPluginOptions } from "./index";

export type { BeforeAfterPluginOptions };
export function beforeAfter(options?: BeforeAfterPluginOptions): Plugin;
export default beforeAfter;
