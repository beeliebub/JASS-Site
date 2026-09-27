/** Pure formatting helpers safe to import from both server and client code. */

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Java's Properties parser treats a literal ':' as a key/value separator
 * even mid-value, so every colon in the download URL (the "https://" scheme
 * separator, and a port if the site URL has one) must be escaped or a
 * server.properties parser mangles the resource-pack line.
 */
export function buildResourcePackSnippet(pack: { downloadUrl: string; sha1: string; uuid: string }): string {
  const escapedUrl = pack.downloadUrl.replace(/:/g, "\\:");
  return `resource-pack=${escapedUrl}\nresource-pack-sha1=${pack.sha1}\nresource-pack-id=${pack.uuid}`;
}
