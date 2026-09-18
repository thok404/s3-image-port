import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStore } from "jotai";
import { render } from "@/../test/utils/render-with-providers";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { produce } from "immer";
import { GalleryControl } from "./GalleryControl";
import {
  currentPageAtom,
  displayOptionsAtom,
  photosAtom,
  selectedPhotosAtom,
} from "@/stores/atoms/gallery";
import { profilesAtom } from "@/stores/atoms/settings";
import { getDefaultOptions } from "@/stores/schemas/settings";
import { galleryFilterDefault } from "@/stores/schemas/gallery/filter";
import type { Photo } from "@/stores/schemas/photo";

// DisplayControl needs a router context, it is irrelevant to what is tested here.
vi.mock(import("./DisplayControl"), () => ({
  DisplayControl: () => <></>,
}));

const store = getDefaultStore();
const user = userEvent.setup();

const SELECT_ALL = "Select current page. Shortcut: Ctrl+A";

const photo = (key: string): Photo => ({
  Key: key,
  LastModified: "2024-01-01T00:00:00.000Z",
  url: `https://example.com/${key}`,
});

const photos = Array.from({ length: 21 }, (_, index) =>
  photo(`i/${index}.jpg`),
);

beforeEach(() => {
  localStorage.clear();
  store.set(profilesAtom, {
    list: [
      [
        "Test Profile",
        produce(getDefaultOptions(), (draft) => {
          draft.s3.endpoint = "https://s3.example.com";
          draft.s3.bucket = "test-bucket";
          draft.s3.region = "us-east-1";
          draft.s3.accKeyId = "test-key";
          draft.s3.secretAccKey = "test-secret";
          draft.s3.pubUrl = "https://cdn.example.com";
        }),
      ],
    ],
    current: 0,
  });
  store.set(displayOptionsAtom, galleryFilterDefault);
  store.set(currentPageAtom, 1);
  store.set(selectedPhotosAtom, new Set<string>());
  store.set(photosAtom, photos);
});

describe("GalleryControl", () => {
  it("selects every photo of the current page", async () => {
    render(<GalleryControl />);

    await user.click(screen.getByRole("button", { name: SELECT_ALL }));

    // PER_PAGE is 20, so the 21st photo belongs to the next page
    expect(store.get(selectedPhotosAtom).size).toBe(20);
  });

  it("adds the photos of the other pages to the selection", async () => {
    render(<GalleryControl />);

    await user.click(screen.getByRole("button", { name: SELECT_ALL }));
    store.set(currentPageAtom, 2);
    await user.click(screen.getByRole("button", { name: SELECT_ALL }));

    expect(store.get(selectedPhotosAtom).size).toBe(21);
  });

  it("is disabled when there is nothing to select", () => {
    store.set(photosAtom, []);
    render(<GalleryControl />);

    expect(screen.getByRole("button", { name: SELECT_ALL })).toBeDisabled();
  });
});
