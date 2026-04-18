/**
 * Discord user IDs allowed to use `/developer` routes and the Developer Panel UI.
 * Enforced server-side only; do not rely on hiding links in the frontend.
 */
export const DEVELOPER_DISCORD_IDS = new Set<string>(["999033836358873260"]);

export function isDeveloperDiscordId(discordId: string): boolean {
  return DEVELOPER_DISCORD_IDS.has(discordId);
}
