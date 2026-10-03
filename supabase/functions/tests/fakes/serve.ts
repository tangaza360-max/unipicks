// Stand-in for deno.land/std http/server: captures the handler so tests can call it directly.
export let handler: ((req: Request) => Promise<Response>) | null = null

export function serve(h: (req: Request) => Promise<Response>) {
  handler = h
}
