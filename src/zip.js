import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const inflateRaw = promisify(zlib.inflateRaw);
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_SYMLINK = 0o120000;
const DOS_EPOCH_TIME = 0;

export async function extractZip(zipFile, destination) {
  const archive = await fs.readFile(zipFile);
  const entries = readCentralDirectory(archive);
  await fs.mkdir(destination, { recursive: true });
  const extracted = [];
  for (const entry of entries) {
    const name = normalizeZipEntryName(entry.name);
    if (!name) continue;
    if (entry.isSymlink) throw new Error(`zip 包含符号链接，已拒绝：${entry.name}`);
    const target = safeExtractPath(destination, name);
    if (!target) throw new Error(`zip 条目路径不安全：${entry.name}`);
    if (entry.isDirectory) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await readEntryData(archive, entry));
    extracted.push(name);
  }
  return extracted;
}

function readCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (centralDirectoryOffset + centralDirectorySize > buffer.length) throw new Error('zip 中央目录损坏');

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) throw new Error('zip 中央目录条目损坏');
    const flags = buffer.readUInt16LE(offset + 8);
    if (flags & 0x1) throw new Error('不支持加密 zip');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (![0, 8].includes(method)) throw new Error(`不支持的 zip 压缩方法：${method}`);
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDirectory: name.endsWith('/'),
      isSymlink: (unixMode & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('不是有效的 zip 文件');
}

async function readEntryData(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) throw new Error(`zip 本地文件头损坏：${entry.name}`);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  const data = entry.method === 0 ? Buffer.from(compressed) : await inflateRaw(compressed);
  if (data.length !== entry.uncompressedSize) throw new Error(`zip 条目大小校验失败：${entry.name}`);
  return data;
}

export function normalizeZipEntryName(name) {
  const normalized = String(name || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized === '/') return '';
  if (normalized.startsWith('/') || normalized.includes('\0')) throw new Error(`zip 条目路径不安全：${name}`);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.')) throw new Error(`zip 条目路径不安全：${name}`);
  return parts.join('/');
}

export function safeExtractPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  return target === resolvedRoot || target.startsWith(`${resolvedRoot}${path.sep}`) ? target : null;
}

export async function createZip(zipFile, entries) {
  const normalizedEntries = entries.map((entry) => {
    const name = normalizeZipEntryName(entry.name);
    if (!name) throw new Error('zip 条目名称不能为空');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '');
    return { name, data };
  });
  const archive = createStoredZipBuffer(normalizedEntries);
  await fs.mkdir(path.dirname(zipFile), { recursive: true });
  await fs.writeFile(zipFile, archive);
  return { path: zipFile, files: normalizedEntries.length, bytes: archive.length };
}

function createStoredZipBuffer(entries) {
  const fileParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(DOS_EPOCH_TIME, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    fileParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(DOS_EPOCH_TIME, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...fileParts, ...centralParts, eocd]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
