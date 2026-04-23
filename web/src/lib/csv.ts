import Papa from "papaparse";

export interface ParseOptions<T> {
  url: string;
  transform?: (row: Record<string, string>) => T;
  onProgress?: (rowsProcessed: number) => void;
}

export async function parseCSV<T>({ url, transform, onProgress }: ParseOptions<T>): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const text = await res.text();

  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      step: (result) => {
        const row = result.data;
        const mapped = (transform ? transform(row) : (row as unknown as T)) as T;
        rows.push(mapped);
        if (onProgress && rows.length % 10000 === 0) onProgress(rows.length);
      },
      complete: () => {
        onProgress?.(rows.length);
        resolve(rows);
      },
      error: reject,
    });
  });
}

export async function loadJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}
