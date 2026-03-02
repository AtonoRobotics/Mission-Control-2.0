import type { DisplayPlugin } from './DisplayPlugin';

type DisplayConstructor = new () => DisplayPlugin;

const registry = new Map<string, DisplayConstructor>();

export function registerDisplay(type: string, ctor: DisplayConstructor) {
  registry.set(type, ctor);
}

export function createDisplay(type: string): DisplayPlugin | null {
  const Ctor = registry.get(type);
  if (!Ctor) return null;
  return new Ctor();
}

export function getDisplayTypes(): string[] {
  return Array.from(registry.keys());
}

export function getDisplayConstructor(type: string): DisplayConstructor | undefined {
  return registry.get(type);
}
