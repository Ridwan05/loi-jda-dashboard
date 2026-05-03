import { cp, mkdir, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (process.env.VERCEL && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable.");
}

await writeFile(
  "dist/config.js",
  `window.MESHGRID_CONFIG = ${JSON.stringify(
    {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: supabaseAnonKey,
    },
    null,
    2
  )};\n`
);

console.log("Built static site to dist/");
