/// <reference path="../.astro/types.d.ts" />

interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  STREAM_ACCOUNT_ID: string;
  STREAM_API_TOKEN: string;
  STREAM_WEBHOOK_SECRET: string;
  APP_URL: string;
}

declare module "cloudflare:workers" {
  namespace Cloudflare {
    interface Env extends CloudflareEnv {}
  }
  export const env: CloudflareEnv;
}

interface StreamPlayer {
  currentTime: number;
  duration: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  addEventListener(event: string, handler: () => void): void;
  removeEventListener(event: string, handler: () => void): void;
  play(): Promise<void>;
  pause(): void;
}

declare global {
  interface Window {
    Stream?: (iframe: HTMLIFrameElement) => StreamPlayer;
  }
}

export {};
