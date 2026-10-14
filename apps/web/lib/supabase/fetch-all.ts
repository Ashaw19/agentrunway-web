/**
 * Reading more than 1,000 rows. The API returns at most 1,000 rows per
 * request (supabase/config.toml max_rows), whatever .limit() asks for, so a
 * query meant to read all of an agent's clients, deals or activities quietly
 * stopped at 1,000. These helpers read in pages, and split long `.in()` lists
 * so the request stays short.
 */

/** Rows per request: the API's cap. */
export const PAGE_SIZE = 1000;

/** Ids per `.in()` request, keeping the URL well under server limits. */
export const IN_CHUNK = 200;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/** Same shape as a Supabase result, so a paged read drops in where a query was. */
export interface AllRows<T> {
  data: T[];
  error: { message: string; code?: string } | null;
}

/**
 * Every row of a query, page by page. `page(from, to)` must build the full
 * query, ending in `.range(from, to)`, and order by a unique column (for
 * example `.order("id")` last) so rows don't shift between pages.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => Page<T>): Promise<AllRows<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error: { message: error.message, code: error.code } };
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

/**
 * A query over a long id list, `IN_CHUNK` ids at a time, results joined.
 * Each chunk's result is itself paged, so a chunk matching more than 1,000
 * rows is read in full too: `run(chunk, from, to)` must end in
 * `.range(from, to)` with a unique order.
 */
export async function fetchAllIn<K, T>(
  ids: readonly K[],
  run: (chunk: K[], from: number, to: number) => Page<T>,
): Promise<AllRows<T>> {
  const rows: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const { data, error } = await fetchAllRows<T>((from, to) => run(chunk, from, to));
    rows.push(...data);
    if (error) return { data: rows, error };
  }
  return { data: rows, error: null };
}
