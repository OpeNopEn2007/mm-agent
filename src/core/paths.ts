import { createHash, randomUUID } from "node:crypto";
import {
  link,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { CaseProtocolError } from "./schema.js";

export async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
async function nearestExistingAncestor(start: string): Promise<string> {
  let cursor = start;
  for (;;) {
    try {
      return await realpath(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      cursor = parent;
    }
  }
}
async function candidateProbe(absolute: string): Promise<string> {
  try {
    return await realpath(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return nearestExistingAncestor(path.dirname(absolute));
  }
}
export async function resolveInsideCase(
  rootPath: string,
  relative: string,
  mode: "existing" | "candidate",
): Promise<string> {
  const segments = relative.split("/");
  const invalidSegment = segments.some(
    (segment, index) =>
      segment === "." ||
      segment === ".." ||
      (segment.length === 0 && index !== segments.length - 1),
  );
  if (
    !relative ||
    relative.includes("\\") ||
    relative.includes("\0") ||
    relative.includes(":") ||
    path.posix.isAbsolute(relative) ||
    path.win32.isAbsolute(relative) ||
    invalidSegment
  )
    throw new CaseProtocolError(
      "PATH_ESCAPE",
      `path is not Case-relative: ${relative}`,
    );
  const root = await realpath(rootPath);
  const absolute = path.resolve(root, ...relative.split("/"));
  const probe =
    mode === "existing"
      ? await realpath(absolute)
      : await candidateProbe(absolute);
  if (probe !== root && !probe.startsWith(`${root}${path.sep}`))
    throw new CaseProtocolError(
      "PATH_ESCAPE",
      `path escapes Case root: ${relative}`,
    );
  return absolute;
}
export async function hashPath(target: string): Promise<string> {
  const info = await stat(target);
  if (info.isFile())
    return createHash("sha256")
      .update(await readFile(target))
      .digest("hex");
  if (!info.isDirectory())
    throw new CaseProtocolError(
      "SCHEMA_INVALID",
      `unsupported artifact type: ${target}`,
    );
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) files.push(child);
      else
        throw new CaseProtocolError(
          "PATH_ESCAPE",
          `artifact contains link: ${child}`,
        );
    }
  }
  await walk(target);
  files.sort((a, b) => a.localeCompare(b));
  const hash = createHash("sha256");
  for (const file of files)
    hash
      .update(path.relative(target, file).split(path.sep).join("/"))
      .update("\0")
      .update(await hashPath(file))
      .update("\n");
  return hash.digest("hex");
}
export async function readJson<T>(
  target: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error instanceof CaseProtocolError) throw error;
    throw new CaseProtocolError(
      "SCHEMA_INVALID",
      `cannot read JSON: ${target}`,
      error,
    );
  }
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof CaseProtocolError) throw error;
    throw new CaseProtocolError(
      "SCHEMA_INVALID",
      `invalid JSON schema: ${target}`,
      error,
    );
  }
}
export async function writeJsonAtomic(
  target: string,
  value: unknown,
): Promise<void> {
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    const handle = await open(temporary, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

type CaseLockRecord = {
  pid: number;
  token: string;
  acquired_at: string;
};
type CaseLockRequest = CaseLockRecord & {
  ticket: number;
};

function parseCaseLock(value: string): CaseLockRecord | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<CaseLockRecord>;
    if (
      Number.isSafeInteger(parsed.pid) &&
      (parsed.pid ?? 0) > 0 &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0 &&
      typeof parsed.acquired_at === "string" &&
      !Number.isNaN(Date.parse(parsed.acquired_at))
    )
      return parsed as CaseLockRecord;
  } catch {
    return undefined;
  }
  return undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH" || code === "EINVAL") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

function parseCaseLockRequest(value: string): CaseLockRequest | undefined {
  const record = parseCaseLock(value);
  if (!record) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<CaseLockRequest>;
    if (Number.isSafeInteger(parsed.ticket) && (parsed.ticket ?? 0) > 0)
      return { ...record, ticket: parsed.ticket! };
  } catch {
    return undefined;
  }
  return undefined;
}

async function liveLockFiles<T extends CaseLockRecord>(
  caseRoot: string,
  prefix: string,
  parse: (value: string) => T | undefined,
): Promise<Array<{ path: string; record: T }>> {
  const result: Array<{ path: string; record: T }> = [];
  for (const entry of await readdir(caseRoot)) {
    if (
      !entry.startsWith(prefix) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        entry.slice(prefix.length),
      )
    )
      continue;
    const target = path.join(caseRoot, entry);
    let record: T | undefined;
    try {
      record = parse(await readFile(target, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (record && processIsAlive(record.pid))
      result.push({ path: target, record });
    else await rm(target, { force: true });
  }
  return result;
}

async function waitForLock(deadline: number, caseRoot: string): Promise<void> {
  if (Date.now() >= deadline)
    throw new CaseProtocolError("LOCK_BUSY", `Case lock busy: ${caseRoot}`);
  await new Promise((resolve) => setTimeout(resolve, 10));
}

async function acquireBakeryTurn(
  caseRoot: string,
  deadline: number,
  token: string,
): Promise<{ path: string; record: CaseLockRequest }> {
  const base: CaseLockRecord = {
    pid: process.pid,
    token,
    acquired_at: new Date().toISOString(),
  };
  const choosingPath = path.join(caseRoot, `state.lock.choosing-${token}`);
  const requestPath = path.join(caseRoot, `state.lock.request-${token}`);
  let publishedRequest = false;
  try {
    await writeJsonAtomic(choosingPath, base);
    const existing = await liveLockFiles(
      caseRoot,
      "state.lock.request-",
      parseCaseLockRequest,
    );
    const request: CaseLockRequest = {
      ...base,
      ticket:
        existing.reduce(
          (maximum, item) => Math.max(maximum, item.record.ticket),
          0,
        ) + 1,
    };
    await writeJsonAtomic(requestPath, request);
    publishedRequest = true;
    await rm(choosingPath, { force: true });
    for (;;) {
      const choosing = await liveLockFiles(
        caseRoot,
        "state.lock.choosing-",
        parseCaseLock,
      );
      if (choosing.length > 0) {
        await waitForLock(deadline, caseRoot);
        continue;
      }
      const requests = await liveLockFiles(
        caseRoot,
        "state.lock.request-",
        parseCaseLockRequest,
      );
      requests.sort(
        (left, right) =>
          left.record.ticket - right.record.ticket ||
          left.record.token.localeCompare(right.record.token),
      );
      if (requests[0]?.record.token === token)
        return { path: requestPath, record: request };
      await waitForLock(deadline, caseRoot);
    }
  } catch (error) {
    await rm(choosingPath, { force: true }).catch(() => undefined);
    if (publishedRequest)
      await rm(requestPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function removeOwnedCaseLock(
  lockPath: string,
  token: string,
): Promise<void> {
  try {
    const record = parseCaseLock(await readFile(lockPath, "utf8"));
    if (record?.token === token) await rm(lockPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function withCaseLock<T>(
  caseRoot: string,
  work: () => Promise<T>,
): Promise<T> {
  const lockPath = path.join(caseRoot, "state.lock");
  const deadline = Date.now() + 2000;
  const token = randomUUID();
  const request = await acquireBakeryTurn(caseRoot, deadline, token);
  let acquired = false;
  try {
    for (;;) {
      try {
        await link(request.path, lockPath);
        acquired = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let owner: CaseLockRecord | undefined;
        try {
          owner = parseCaseLock(await readFile(lockPath, "utf8"));
        } catch (readError) {
          if ((readError as NodeJS.ErrnoException).code !== "ENOENT")
            throw readError;
        }
        if (owner && processIsAlive(owner.pid)) {
          await waitForLock(deadline, caseRoot);
          continue;
        }
        await rm(lockPath, { force: true });
      }
    }
    return await work();
  } finally {
    if (acquired) await removeOwnedCaseLock(lockPath, token);
    await rm(request.path, { force: true }).catch(() => undefined);
  }
}
