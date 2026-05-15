export type WaitUntil = (promise: Promise<unknown>) => void;

export function getWaitUntil(locals: App.Locals): WaitUntil | undefined {
  const ctx = locals.cfContext;
  if (!ctx) return undefined;
  return (promise) => ctx.waitUntil(promise);
}
