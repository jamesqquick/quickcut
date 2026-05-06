// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  adapter: cloudflare({
    remoteBindings: false,
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  output: "server",
});
