/**
 * Read a response body as UTF-8 text, giving up as soon as it exceeds `limit`
 * bytes. Returns null when the cap is hit, cancelling the body so the socket
 * isn't left draining a large file.
 *
 * Exists for /api/subtitle-proxy, which is public, unauthenticated and
 * unrated, and whose host allowlist constrains only the hostname — the path is
 * entirely attacker-chosen. `await res.text()` there had no byte cap, so any
 * large file on an allowed CDN could be buffered into RAM (doubled by the
 * UTF-8 decode) and a few concurrent requests could OOM the server. The
 * request timeout bounds wall clock, not bytes.
 */
export async function readCappedText(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  onExceeded?: (bytesRead: number) => void,
): Promise<string | null> {
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        onExceeded?.(total);
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(joined);
}
