import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Orialis Brief preview plugin ready");
  },
  async onHealth() {
    return { status: "ok", message: "Brief preview UI is ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
