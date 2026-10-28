import { llmsFullTxt } from "@/lib/llmsText";

// built per request from the hourly in-memory catalogue, never at build time
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(await llmsFullTxt(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
