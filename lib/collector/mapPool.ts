/**
 * Tiny bounded-concurrency helper (Naver search: keep 3–5).
 */

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runOne() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runOne()));
  return results;
}
