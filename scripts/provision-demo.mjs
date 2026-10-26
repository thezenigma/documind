// One-off provisioning helper for the demo owner account (PRD F12).
// Run with: DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/provision-demo.mjs
// Creates the demo user if missing, marks the email verified, prints the id.
import { readFileSync } from "node:fs";
import { hash } from "bcryptjs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (name) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
};
const url = pick("SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");
// Credentials never live in this file: the demo account is provisioned from
// the operator's own environment.
const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
if (!url || !key || !email || !password) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_EMAIL and DEMO_PASSWORD.");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const existing = await rest(`users?select=id&email=eq.${encodeURIComponent(email)}`);
let id = existing[0]?.id;
if (!id) {
  const passwordHash = await hash(password, 10);
  const created = await rest("users", {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ email, password_hash: passwordHash }),
  });
  id = created[0].id;
  console.log("created demo user", id);
} else {
  console.log("demo user already exists", id);
}

await rest(`users?id=eq.${id}`, {
  method: "PATCH",
  body: JSON.stringify({ email_verified_at: new Date().toISOString() }),
});
console.log("DEMO_USER_ID=" + id);
