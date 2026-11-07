/**
 * Next.js calls register() once at startup, in both the Node and Edge runtimes. Node-only code
 * (the database driver) must live in a separate file that is imported ONLY inside this exact
 * runtime check, or the Edge bundle tries to include it and fails on missing Node modules.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startInlineWorker } = await import('./instrumentation-node');
    startInlineWorker();
  }
}
