import { readFile } from "fs/promises";
import { join } from "path";

// hls.js for /lite (old TV browsers, no bundler). The UMD build is ES5.
export async function GET() {
  const js = await readFile(join(process.cwd(), "node_modules/hls.js/dist/hls.min.js"));
  return new Response(js, {
    headers: { "content-type": "application/javascript", "cache-control": "public, max-age=86400" },
  });
}
