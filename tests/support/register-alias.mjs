// Lets `node --test` load app source that uses the Next.js `@/` alias and
// extensionless relative imports. Test-only; the app itself is built by Next.
import { register } from "node:module";

register(new URL("./alias-hooks.mjs", import.meta.url));
