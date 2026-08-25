import { lookup, resolveSrv } from "node:dns/promises";
import { isIP } from "node:net";

export type ResolvedServerTarget = {
  host: string;
  port: number;
};

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && ((second === 0 && (third === 0 || third === 2)) || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const firstHextet = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  if (!Number.isFinite(firstHextet)) return true;

  return (
    firstHextet === 0 ||
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xff00) === 0xff00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xffc0) === 0xfec0 ||
    normalized === "::1"
  );
}

function isInternalAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) !== 6) return true;

  const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  const mappedHex = address.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    const mapped = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    return isPrivateIpv4(mapped);
  }

  return isPrivateIpv6(address);
}

async function lookupPublicAddresses(host: string): Promise<string[] | null> {
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0 || records.some((record) => isInternalAddress(record.address))) return null;
    return records.map((record) => record.address);
  } catch {
    return null;
  }
}

function isMissingSrvRecord(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENODATA" || code === "ENOTFOUND";
}

/**
 * Resolves one public destination and returns its concrete address. The
 * caller can pass this address to the Java ping with SRV disabled, so the
 * address checked here is the address used for the outbound connection.
 */
export async function resolvePublicServerTarget(host: string, port: number): Promise<ResolvedServerTarget | null> {
  const directAddresses = await lookupPublicAddresses(host);
  if (!directAddresses) return null;

  try {
    const srvRecords = await resolveSrv(`_minecraft._tcp.${host}`);
    if (srvRecords.length === 0 || srvRecords.some((record) => record.name === "." || record.port < 1 || record.port > 65535)) {
      return null;
    }

    const srvAddresses: string[] = [];
    for (const record of srvRecords) {
      const addresses = await lookupPublicAddresses(record.name);
      if (!addresses) return null;
      srvAddresses.push(...addresses);
    }

    return srvAddresses.length > 0 ? { host: srvAddresses[0], port: srvRecords[0].port } : null;
  } catch (error) {
    if (!isMissingSrvRecord(error)) return null;
    return { host: directAddresses[0], port };
  }
}

/** Resolves a hostname and reports whether its direct or SRV destination is internal. */
export async function hasInternalServerTarget(host: string): Promise<boolean> {
  return (await resolvePublicServerTarget(host, 25565)) === null;
}
