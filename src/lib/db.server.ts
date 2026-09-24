// Server-only Turso/libSQL connection. The `.server.ts` filename keeps this
// module (and the credentials it reads) out of every browser bundle.
// Credentials are read on first use inside a request, never at module scope.
import { createClient, type Client, type Transaction } from "@libsql/client/web";

let client: Client | undefined;

export function getDb(): Client {
  if (client) return client;
  const url = process.env["TURSO_DATABASE_URL"];
  const authToken = process.env["TURSO_AUTH_TOKEN"];
  if (!url) {
    console.error("[db] TURSO_DATABASE_URL is not set");
    throw new Error("Database is not configured");
  }
  client = createClient(authToken ? { url, authToken } : { url });
  return client;
}

/**
 * Runs `fn` inside a write transaction. libSQL "write" mode issues
 * BEGIN IMMEDIATE, taking the write lock up front so concurrent sales
 * serialize instead of racing. Any throw rolls back everything.
 */
export async function withWriteTx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await getDb().transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
}

export const newId = () => crypto.randomUUID();
