import { describe, expect, it } from "vitest";
import {
  deriveBreadcrumbSegments,
  deriveChildFolders,
  isPhotoInFolderScope,
  normalizePrefix,
} from "./folder-logic";
import type { Photo } from "@/stores/schemas/photo";

const photo = (key: string): Photo => ({
  Key: key,
  LastModified: "2024-01-01T00:00:00.000Z",
  url: `https://example.com/${key}`,
});

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
