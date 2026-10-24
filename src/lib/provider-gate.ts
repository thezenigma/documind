import "server-only";

/**
 * Internal pacing for the provider API. The account budget is 40 requests
 * per minute, so every provider request start is spaced at least 1.5
 * seconds apart (60000 / NVIDIA_RPM). Waiters run in arrival order through
 * a single chain, which keeps bursts from several browser tabs or an
 * ingestion loop from tripping the upstream limit. If the provider still
 * reports 429, the caller invokes reportProviderPressure, all starts pause
 * for a cooldown, and the caller retries once.
 *
 * The gate is per server process. On one Vercel instance this holds to the
 * minute; a shared database token bucket would be needed to coordinate
 * across many cold instances at once (see docs/decisions.md).
 */

const DEFAULT_RPM = 40;
const COOLDOWN_MS = 10_000;

function readRpm(): number {
  const raw = Number(process.env.NVIDIA_RPM);
  return Number.isFinite(raw) && raw >= 1 && raw <= 1000 ? Math.floor(raw) : DEFAULT_RPM;
}

const RPM = readRpm();
const MIN_GAP_MS = Math.ceil(60_000 / RPM);

let lastStartAt = 0;
let cooldownUntil = 0;
let starts = 0;
let chain: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Waits until this process may start another provider request, then
 * returns. Resolves in FIFO order; the returned wait is logged so bursts
 * show up in the server log as observable slowdowns.
 */
export async function acquireProviderSlot(): Promise<void> {
  const ticket = chain.then(async () => {
    const waitMs = Math.max(lastStartAt + MIN_GAP_MS, cooldownUntil) - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    lastStartAt = Date.now();
    starts += 1;
    console.log(
      `[provider-gate] ${new Date(lastStartAt).toISOString()} start #${starts} waited=${Math.max(waitMs, 0)}ms rpm=${RPM}`,
    );
  });
  chain = ticket.catch(() => {});
  await ticket;
}

/** The provider pushed back: pause new starts briefly; the caller retries once. */
export function reportProviderPressure(): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + COOLDOWN_MS);
  console.warn(
    `[provider-gate] provider reported 429, pausing starts until ${new Date(cooldownUntil).toISOString()}`,
  );
}
