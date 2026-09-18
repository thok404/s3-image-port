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

/**
 * Whether the key is a folder marker rather than a photo.
 *
 * S3 has no directories: a folder only exists because of an empty object whose
 * key ends with a slash. The client keeps those markers in the photo list so
 * empty folders stay browsable, and every consumer that renders photos has to
 * filter them out.
 */
export function isFolderMarker(key: string): boolean {
  return key.endsWith("/");
}

/** The folder holding `prefix`, `""` for a top-level folder. */
export function parentPrefix(prefix: string): string {
  const withoutTrailingSlash = normalizePrefix(prefix).slice(0, -1);
  const lastSlash = withoutTrailingSlash.lastIndexOf("/");
  return lastSlash === -1 ? "" : withoutTrailingSlash.slice(0, lastSlash + 1);
}

/**
 * Whether `child` lives strictly inside `parent`. Used to reject moving a
 * folder into its own subtree, which would otherwise recurse forever.
 */
export function isDescendantPrefix(parent: string, child: string): boolean {
  const parentPath = normalizePrefix(parent);
  const childPath = normalizePrefix(child);
  if (parentPath === "") {
    return childPath !== "";
  }
  return childPath !== parentPath && childPath.startsWith(parentPath);
}

/** Longest folder path we accept, well under the 1024-byte S3 key limit. */
const MAX_FOLDER_PATH_LENGTH = 900;

/**
 * Cleans up a folder path typed by the user into a canonical `a/b/` form.
 *
 * Returns `null` when the input cannot be used as a folder path, so callers can
 * surface a validation error instead of creating a weird key.
 */
export function normalizeFolderPathInput(input: string): string | null {
  // Windows users tend to paste backslashes.
  const unified = input.trim().replace(/\\/g, "/");
  const segments = unified
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }
  // "." and ".." have no meaning in S3 (the key would literally be ".."),
  // listing them would only lead to confusing objects.
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (segments.some((segment) => /[\u0000-\u001f\u007f]/.test(segment))) {
    return null;
  }

  const path = `${segments.join("/")}/`;
  return path.length > MAX_FOLDER_PATH_LENGTH ? null : path;
}

/**
 * Resolves a path typed by the user against the folder being browsed, e.g.
 * `joinFolderPath("i/", "2024")` -> `"i/2024/"`.
 */
export function joinFolderPath(parent: string, input: string): string | null {
  const relative = normalizeFolderPathInput(input);
  if (relative === null) {
    return null;
  }
  return `${normalizePrefix(parent)}${relative}`;
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
 *
 * A subfolder is reported as soon as one of its keys is seen, which is also how
 * an empty folder shows up: it is known from its marker object alone.
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
    if (!isFolderMarker(photo.Key)) {
      entry.totalPhotoCount += 1;
      if (!rest.slice(slashIndex + 1).includes("/")) {
        entry.photoCount += 1;
      }
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
