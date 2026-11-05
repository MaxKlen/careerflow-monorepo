import {
  lstatSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "./env.js";

const PROJECT_ROOT = realpathSync(process.cwd());
function within(root: string, candidate: string, allowRoot = false): boolean {
  const rel = relative(root, candidate);
  return (
    (allowRoot && rel === "") ||
    (rel !== "" &&
      rel !== ".." &&
      !rel.startsWith(`..${sep}`) &&
      !isAbsolute(rel))
  );
}
function ensureDirectoryTree(root: string, target: string): string {
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(
      `STORAGE_DIR must be a dedicated directory inside project root: ${target}`,
    );
  let current = root;
  for (const part of rel.split(sep)) {
    if (!part || part === "." || part === "..")
      throw new Error("Invalid storage directory component");
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink())
        throw new Error(`Storage directory contains a symlink: ${current}`);
      if (!stat.isDirectory())
        throw new Error(
          `Storage path component is not a directory: ${current}`,
        );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      mkdirSync(current, { mode: 0o700 });
    }
    if (!within(root, realpathSync(current)))
      throw new Error(`Storage directory escapes project root: ${current}`);
  }
  return realpathSync(target);
}
function resolveRoot(): string {
  const candidate = resolve(PROJECT_ROOT, env.STORAGE_DIR);
  const rel = relative(PROJECT_ROOT, candidate);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(
      `STORAGE_DIR must be a dedicated subdirectory inside project root: ${candidate}`,
    );
  return ensureDirectoryTree(PROJECT_ROOT, candidate);
}
const ROOT = resolveRoot();
const remoteStorage =
  env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      })
    : null;

export function storageProvider(): "s3" | "local" {
  return remoteStorage ? "s3" : "local";
}

export function storagePath(key: string): string {
  if (
    !key ||
    key.indexOf(String.fromCharCode(0)) !== -1 ||
    key.indexOf(String.fromCharCode(92)) !== -1 ||
    isAbsolute(key) ||
    key.startsWith("/")
  )
    throw new Error("Invalid storage key");
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error("Invalid storage key component");
  const full = resolve(ROOT, ...parts);
  if (!within(ROOT, full)) throw new Error(`Storage key escapes root: ${key}`);
  return full;
}
function ensureSafeParent(full: string): void {
  const rel = relative(ROOT, dirname(full));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("Storage parent escapes root");
  let current = ROOT;
  for (const part of rel ? rel.split(sep) : []) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink())
        throw new Error(`Storage path contains a symlink: ${current}`);
      if (!stat.isDirectory())
        throw new Error(
          `Storage path component is not a directory: ${current}`,
        );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      mkdirSync(current, { mode: 0o700 });
    }
    if (!within(ROOT, realpathSync(current), true))
      throw new Error(`Storage path escapes root: ${current}`);
  }
  if (!within(ROOT, realpathSync(dirname(full)), true))
    throw new Error("Storage parent escapes root");
}
export async function putObject(
  key: string,
  body: Buffer,
  mime: string,
): Promise<void> {
  if (remoteStorage) {
    await remoteStorage.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: mime,
      }),
    );
    return;
  }
  const full = storagePath(key);
  ensureSafeParent(full);
  writeFileSync(full, body, { flag: "wx", mode: 0o600 });
}
export async function getObject(key: string): Promise<Buffer> {
  if (remoteStorage) {
    const response = await remoteStorage.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    if (!response.Body) throw new Error("Stored object is empty");
    return Buffer.from(await response.Body.transformToByteArray());
  }
  const full = storagePath(key);
  ensureSafeParent(full);
  const stat = lstatSync(full);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error("Invalid stored object");
  const real = realpathSync(full);
  if (!within(ROOT, real)) throw new Error("Stored object escapes root");
  return readFileSync(real);
}

export async function deleteObject(key: string): Promise<boolean> {
  if (remoteStorage) {
    await remoteStorage.send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    return true;
  }
  const full = storagePath(key);
  const parentRel = relative(ROOT, dirname(full));
  if (
    parentRel === ".." ||
    parentRel.startsWith(`..${sep}`) ||
    isAbsolute(parentRel)
  ) {
    throw new Error("Storage parent escapes root");
  }
  let current = ROOT;
  for (const part of parentRel ? parentRel.split(sep) : []) {
    current = join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("Invalid storage parent");
    if (!within(ROOT, realpathSync(current), true))
      throw new Error("Storage parent escapes root");
  }
  let stat;
  try {
    stat = lstatSync(full);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error("Invalid stored object");
  if (!within(ROOT, realpathSync(full)))
    throw new Error("Stored object escapes root");
  unlinkSync(full);
  return true;
}
