import "server-only";
import type { Q } from "./db";
import { shortId } from "./security";

export async function notify(q: Q, userId: string, text: string, href?: string) {
  await q("INSERT INTO notices (id,user_id,text,href,at,read) VALUES ($1,$2,$3,$4,$5,FALSE)", [shortId(), userId, text, href ?? null, Date.now()]);
}
