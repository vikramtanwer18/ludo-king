// Runs once when the server starts. The check lives in a Node.js-only module.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkEnvOrExit } = await import("./server/env");
    checkEnvOrExit();
  }
}
