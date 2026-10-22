import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = new URL("../../src/", import.meta.url);

function withTsExtension(path) {
  for (const candidate of [`${path}.ts`, `${path}/index.ts`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = fileURLToPath(new URL(specifier.slice(2), srcRoot));
    const file = withTsExtension(base) ?? base;
    return nextResolve(pathToFileURL(file).href, context);
  }
  const fromSource = context.parentURL?.startsWith(srcRoot.href);
  if (fromSource && specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const file = withTsExtension(base);
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
