declare module "playwright-extra-plugin-stealth" {
  import type { BrowserPlugin } from "playwright-extra";
  const StealthPlugin: () => BrowserPlugin;
  export default StealthPlugin;
}
