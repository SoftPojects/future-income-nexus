/**
 * AI Model Configuration
 * Central config for all AI model references used in the frontend.
 * Edge functions have their own MODEL constants — this is for client-side logging.
 */

// Free model used for all web chat and terminal log generation
export const GLOBAL_CHAT_MODEL = "z-ai/glm-4.5-air:free";
export const LOGS_MODEL = "z-ai/glm-4.5-air:free";

// Premium model — ONLY used server-side for X posts and final replies
export const X_POST_MODEL = "anthropic/claude-3.5-sonnet";

/**
 * Log which AI model is being invoked from the frontend.
 * Call this before every supabase.functions.invoke() that hits an AI edge function.
 */
export function logModelUsage(functionName: string, model: string) {
  console.log(`[AI-MODEL] ${functionName} → ${model}`);
}
