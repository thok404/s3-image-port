import type { Photo } from "@/stores/schemas/photo";

/**
 * A S3 "folder" is always terminated by a slash. Keys are user input (or URL
 * search params), so normalize before using them for prefix matching,
 * otherwise `i/2024` would also match `i/2024-backup/x.jpg`.
 */
export function normalizePrefix(prefix: string): string {
  if (prefix === "" || prefix.endsWith("/")) {
    return prefix;
  }
  return `${prefix}/`;
}

export type ChildFolder = {
  /** The folder name, e.g. `2024` */
  name: string;
  /** The full prefix of the folder, always with a trailing slash */
  prefix: string;
  /** Number of photos directly inside the folder */
  photoCount: number;
  /** Number of photos inside the folder and all of its subfolders */
  totalPhotoCount: number;
};

/**
 * The direct subfolders of `prefix`, derived from the photo list.
 *
 * `prefix` is normalized internally, so both `i/2024` and `i/2024/` work.
 */
export function deriveChildFolders(
  photos: Photo[],
  prefix: string,
): ChildFolder[] {
  const base = normalizePrefix(prefix);
  const folders = new Map<
    string,
    { photoCount: number; totalPhotoCount: number }
  >();

  for (const photo of photos) {
    if (!photo.Key.startsWith(base) || photo.Key.length === base.length) {
      continue;
    }
    const rest = photo.Key.slice(base.length);
    const slashIndex = rest.indexOf("/");
    if (slashIndex === -1) {
      continue; // a photo directly inside this folder, not a subfolder
    }
    const name = rest.slice(0, slashIndex);
    const childPrefix = `${base}${name}/`;
    const entry = folders.get(childPrefix) ?? {
      photoCount: 0,
      totalPhotoCount: 0,
    };
    entry.totalPhotoCount += 1;
    if (!rest.slice(slashIndex + 1).includes("/")) {
      entry.photoCount += 1;
    }
    folders.set(childPrefix, entry);
  }

  return Array.from(folders, ([childPrefix, counts]) => ({
    name: childPrefix.slice(base.length, -1),
    prefix: childPrefix,
    ...counts,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/** A `name` of `null` is the root segment, `prefix: undefined` means "all photos". */
export type BreadcrumbSegment = { name: string | null; prefix?: string };

export function deriveBreadcrumbSegments(
  prefix: string | undefined,
): BreadcrumbSegment[] {
  if (prefix === undefined) {
    return [{ name: null }];
  }
  const segments: BreadcrumbSegment[] = [{ name: null, prefix: undefined }];
  let accumulated = "";
  for (const part of normalizePrefix(prefix).split("/").filter(Boolean)) {
    accumulated += `${part}/`;
    segments.push({ name: part, prefix: accumulated });
  }
  return segments;
}

/**
 * Whether a photo belongs to the current folder scope.
 *
 * - `prefix === undefined`: no folder restriction at all (the default view, it
 *   lists every photo in the bucket, recursively).
 * - `includeSubfolders === false`: only the photos directly inside `prefix`.
 * - `includeSubfolders === true`: `prefix` and all of its descendants.
 */
export function isPhotoInFolderScope(
  photo: Photo,
  prefix: string | undefined,
  includeSubfolders: boolean,
): boolean {
  if (prefix === undefined) {
    return true;
  }
  const base = normalizePrefix(prefix);
  if (base !== "" && !photo.Key.startsWith(base)) {
    return false;
  }
  if (!includeSubfolders) {
    const rest = base === "" ? photo.Key : photo.Key.slice(base.length);
    if (rest.includes("/")) {
      return false;
    }
  }
  return true;
}
