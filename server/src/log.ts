const ts = () => new Date().toISOString().replace("T", " ").replace("Z", "");

export function log(scope: string, ...args: unknown[]): void {
  console.log(`[${ts()}] [${scope}]`, ...args);
}

export function warn(scope: string, ...args: unknown[]): void {
  console.warn(`[${ts()}] [${scope}]`, ...args);
}

export function err(scope: string, ...args: unknown[]): void {
  console.error(`[${ts()}] [${scope}]`, ...args);
}
