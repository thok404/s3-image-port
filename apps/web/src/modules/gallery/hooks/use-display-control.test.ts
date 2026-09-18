import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "jotai";
import type { Photo } from "@/stores/schemas/photo";
import { displayOptionsAtom, photosAtom } from "@/stores/atoms/gallery";
import { galleryFilterDefault } from "@/stores/schemas/gallery/filter";
import { filteredPhotosAtom } from "./use-photo-list";
import {
  galleryFilterOptionsFromSearchParams,
  galleryFilterOptionsToSearchParams,
} from "./use-display-control";

const photo = (key: string, lastModified: string): Photo => ({
  Key: key,
  LastModified: lastModified,
  url: `https://cdn.example.com/${key}`,
});

const byName = [
  photo("i/a.jpg", "2024-01-03T00:00:00.000Z"),
  photo("i/b.jpg", "2024-01-01T00:00:00.000Z"),
  photo("i/c.jpg", "2024-01-02T00:00:00.000Z"),
];

describe("gallery sort defaults", () => {
  it("sorts by date by default", () => {
    expect(galleryFilterDefault.sortBy).toBe("date");
    expect(galleryFilterDefault.sortOrder).toBe("desc");
  });

  it("keeps the default out of the search params", () => {
    expect(
      galleryFilterOptionsToSearchParams({ ...galleryFilterDefault }),
    ).not.toHaveProperty("sortBy");
  });

  it("writes the name sort as the exception into the search params", () => {
    expect(
      galleryFilterOptionsToSearchParams({
        ...galleryFilterDefault,
        sortBy: "key",
      }).sortBy,
    ).toBe("key");
  });

  it("reads the name sort back from the search params", () => {
    expect(galleryFilterOptionsFromSearchParams({ sortBy: "key" }).sortBy).toBe(
      "key",
    );
  });

  it("falls back to the date sort when nothing is given", () => {
    expect(galleryFilterOptionsFromSearchParams({}).sortBy).toBe("date");
  });

  it("falls back to the date sort on an unknown value", () => {
    expect(
      galleryFilterOptionsFromSearchParams({ sortBy: "whatever" }).sortBy,
    ).toBe("date");
  });
});

describe("filteredPhotosAtom", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    store.set(photosAtom, byName);
  });

  it("lists the newest photo first by default", () => {
    expect(store.get(filteredPhotosAtom).map((item) => item.Key)).toEqual([
      "i/a.jpg",
      "i/c.jpg",
      "i/b.jpg",
    ]);
  });

  it("lists by name when the sort is switched to name", () => {
    store.set(displayOptionsAtom, { ...galleryFilterDefault, sortBy: "key" });

    expect(store.get(filteredPhotosAtom).map((item) => item.Key)).toEqual([
      "i/c.jpg",
      "i/b.jpg",
      "i/a.jpg",
    ]);
  });

  it("lists by name in ascending order when the order is flipped", () => {
    store.set(displayOptionsAtom, {
      ...galleryFilterDefault,
      sortBy: "key",
      sortOrder: "asc",
    });

    expect(store.get(filteredPhotosAtom).map((item) => item.Key)).toEqual([
      "i/a.jpg",
      "i/b.jpg",
      "i/c.jpg",
    ]);
  });
});
