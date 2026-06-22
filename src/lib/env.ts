export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

export function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}
