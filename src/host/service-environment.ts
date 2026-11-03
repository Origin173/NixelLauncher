// Capture service configuration before plugins start, then keep it out of child-process environments.
export const serviceEnvironment = Object.freeze({
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID?.trim() || '',
  curseforgeApiKey: process.env.CURSEFORGE_API_KEY?.trim() || '',
  modrinthToken: process.env.MODRINTH_TOKEN?.trim() || '',
});

delete process.env.MICROSOFT_CLIENT_ID;
delete process.env.CURSEFORGE_API_KEY;
delete process.env.MODRINTH_TOKEN;
