import { describe, expect, it } from "vitest";
import {
  deriveBreadcrumbSegments,
  deriveChildFolders,
  isDescendantPrefix,
  isFolderMarker,
  isPhotoInFolderScope,
  joinFolderPath,
  normalizeFolderPathInput,
  normalizePrefix,
  parentPrefix,
} from "./folder-path";
import type { Photo } from "@/stores/schemas/photo";

const photo = (key: string): Photo => ({
  Key: key,
  LastModified: "2024-01-01T00:00:00.000Z",
  url: `https://example.com/${key}`,
});

/** A folder marker: an empty object whose key ends with a slash. */
const marker = (key: string): Photo => photo(key);

const photos: Photo[] = [
  photo("root.png"),
  photo("i/2024/05/06/a.jpg"),
  photo("i/2024/05/06/b.jpg"),
  photo("i/2024/05/07/c.jpg"),
  photo("i/2024/10/d.jpg"),
  photo("i/2024-backup/e.jpg"),
  photo("other/f.jpg"),
];

describe("normalizePrefix", () => {
  it("appends a trailing slash", () => {
    expect(normalizePrefix("i/2024")).toBe("i/2024/");
    expect(normalizePrefix("i/2024/")).toBe("i/2024/");
    expect(normalizePrefix("")).toBe("");
  });
});

describe("deriveChildFolders", () => {
  it("lists only the direct subfolders of the root", () => {
    expect(deriveChildFolders(photos, "")).toEqual([
      { name: "i", prefix: "i/", photoCount: 0, totalPhotoCount: 5 },
      { name: "other", prefix: "other/", photoCount: 1, totalPhotoCount: 1 },
    ]);
  });

  it("counts direct children separately from descendants", () => {
    expect(deriveChildFolders(photos, "i/2024/05/")).toEqual([
      {
        name: "06",
        prefix: "i/2024/05/06/",
        photoCount: 2,
        totalPhotoCount: 2,
      },
      {
        name: "07",
        prefix: "i/2024/05/07/",
        photoCount: 1,
        totalPhotoCount: 1,
      },
    ]);
  });

  it("does not treat a sibling folder with a common prefix as a child", () => {
    const names = deriveChildFolders(photos, "i/2024/").map((f) => f.name);
    expect(names).toEqual(["05", "10"]);
  });

  it("accepts a prefix without a trailing slash", () => {
    expect(deriveChildFolders(photos, "i/2024")).toEqual(
      deriveChildFolders(photos, "i/2024/"),
    );
  });

  it("returns nothing for a leaf folder", () => {
    expect(deriveChildFolders(photos, "i/2024/05/06/")).toEqual([]);
  });

  it("knows a folder that only exists as a marker object", () => {
    const withEmpty = [
      ...photos,
      marker("empty/"),
      marker("i/2024/06/"),
      marker("i/2024/06/nested/"),
    ];

    expect(deriveChildFolders(withEmpty, "")).toContainEqual({
      name: "empty",
      prefix: "empty/",
      photoCount: 0,
      totalPhotoCount: 0,
    });
    // `i/2024/06/nested/` is not a direct child of `i/2024/`
    expect(deriveChildFolders(withEmpty, "i/2024/")).toEqual([
      { name: "05", prefix: "i/2024/05/", photoCount: 0, totalPhotoCount: 3 },
      { name: "06", prefix: "i/2024/06/", photoCount: 0, totalPhotoCount: 0 },
      { name: "10", prefix: "i/2024/10/", photoCount: 1, totalPhotoCount: 1 },
    ]);
  });

  it("does not count a folder marker as a photo", () => {
    const withMarkers = [
      marker("i/"),
      marker("i/2024/"),
      photo("i/2024/a.jpg"),
    ];

    expect(deriveChildFolders(withMarkers, "i/")).toEqual([
      {
        name: "2024",
        prefix: "i/2024/",
        photoCount: 1,
        totalPhotoCount: 1,
      },
    ]);
    expect(deriveChildFolders(withMarkers, "i/2024/")).toEqual([]);
  });
});

describe("isFolderMarker", () => {
  it("recognizes the marker objects", () => {
    expect(isFolderMarker("i/2024/")).toBe(true);
    expect(isFolderMarker("i/2024/a.jpg")).toBe(false);
  });
});

describe("parentPrefix", () => {
  it("walks up the folder tree", () => {
    expect(parentPrefix("i/2024/")).toBe("i/");
    expect(parentPrefix("i/2024")).toBe("i/");
    expect(parentPrefix("i/")).toBe("");
  });
});

describe("isDescendantPrefix", () => {
  it("detects a strict descendant", () => {
    expect(isDescendantPrefix("i/", "i/2024/")).toBe(true);
    expect(isDescendantPrefix("i/", "i/")).toBe(false);
    expect(isDescendantPrefix("i/2024/", "i/2024-backup/")).toBe(false);
    expect(isDescendantPrefix("", "i/")).toBe(true);
    expect(isDescendantPrefix("", "")).toBe(false);
  });
});

describe("normalizeFolderPathInput", () => {
  it("accepts a simple name and a nested path", () => {
    expect(normalizeFolderPathInput("2024")).toBe("2024/");
    expect(normalizeFolderPathInput(" 2024/05 ")).toBe("2024/05/");
  });

  it("cleans up slashes and backslashes", () => {
    expect(normalizeFolderPathInput("/i//2024/")).toBe("i/2024/");
    expect(normalizeFolderPathInput("i\\2024\\05")).toBe("i/2024/05/");
  });

  it("rejects input that cannot become a folder path", () => {
    expect(normalizeFolderPathInput("")).toBeNull();
    expect(normalizeFolderPathInput("   ")).toBeNull();
    expect(normalizeFolderPathInput("///")).toBeNull();
    expect(normalizeFolderPathInput("../escape")).toBeNull();
    expect(normalizeFolderPathInput("a/./b")).toBeNull();
    expect(normalizeFolderPathInput("a\u0000b")).toBeNull();
  });

  it("rejects a path longer than an S3 key could hold", () => {
    expect(normalizeFolderPathInput("a".repeat(901))).toBeNull();
  });
});

describe("joinFolderPath", () => {
  it("resolves a typed path against the current folder", () => {
    expect(joinFolderPath("", "2024")).toBe("2024/");
    expect(joinFolderPath("i/", "2024/05")).toBe("i/2024/05/");
    expect(joinFolderPath("i/2024", "06")).toBe("i/2024/06/");
  });

  it("returns null for an unusable path", () => {
    expect(joinFolderPath("i/", "  ")).toBeNull();
    expect(joinFolderPath("i/", "..")).toBeNull();
  });
});

describe("deriveBreadcrumbSegments", () => {
  it("returns the all-photos segment when no prefix is set", () => {
    expect(deriveBreadcrumbSegments(undefined)).toEqual([{ name: null }]);
  });

  it("builds the path of the current folder", () => {
    expect(deriveBreadcrumbSegments("i/2024/05")).toEqual([
      { name: null, prefix: undefined },
      { name: "i", prefix: "i/" },
      { name: "2024", prefix: "i/2024/" },
      { name: "05", prefix: "i/2024/05/" },
    ]);
  });
});

describe("isPhotoInFolderScope", () => {
  it("includes everything when no prefix is set", () => {
    expect(isPhotoInFolderScope(photo("a/b/c.jpg"), undefined, false)).toBe(
      true,
    );
  });

  it("lists only direct children when subfolders are excluded", () => {
    expect(isPhotoInFolderScope(photo("i/2024/a.jpg"), "i/2024/", false)).toBe(
      true,
    );
    expect(
      isPhotoInFolderScope(photo("i/2024/05/b.jpg"), "i/2024/", false),
    ).toBe(false);
  });

  it("includes descendants when subfolders are included", () => {
    expect(
      isPhotoInFolderScope(photo("i/2024/06/b.jpg"), "i/2024/", true),
    ).toBe(true);
  });

  it("does not match folders sharing a prefix", () => {
    expect(
      isPhotoInFolderScope(photo("i/2024-backup/e.jpg"), "i/2024/", true),
    ).toBe(false);
  });

  it("keeps the legacy behaviour of an empty prefix", () => {
    expect(isPhotoInFolderScope(photo("root.png"), "", false)).toBe(true);
    expect(isPhotoInFolderScope(photo("i/2024/a.jpg"), "", false)).toBe(false);
    expect(isPhotoInFolderScope(photo("i/2024/a.jpg"), "", true)).toBe(true);
  });
});
