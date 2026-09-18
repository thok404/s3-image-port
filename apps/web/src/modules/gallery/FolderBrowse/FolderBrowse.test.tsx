import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultStore } from "jotai";
import { render } from "@/../test/utils/render-with-providers";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { FolderBrowse } from ".";
import { displayOptionsAtom, photosAtom } from "@/stores/atoms/gallery";
import { galleryFilterDefault } from "@/stores/schemas/gallery/filter";
import type { Photo } from "@/stores/schemas/photo";

const store = getDefaultStore();
const user = userEvent.setup();

const photo = (key: string): Photo => ({
  Key: key,
  LastModified: "2024-01-01T00:00:00.000Z",
  url: `https://example.com/${key}`,
});

const photos: Photo[] = [
  photo("i/2024/05/06/a.jpg"),
  photo("i/2024/05/06/b.jpg"),
  photo("i/2024/10/c.jpg"),
  photo("other/d.jpg"),
];

beforeEach(() => {
  store.set(photosAtom, photos);
  store.set(displayOptionsAtom, galleryFilterDefault);
});

describe("FolderBrowse", () => {
  it("lists the root folders and no breadcrumb in the all-photos view", () => {
    render(<FolderBrowse />);

    expect(screen.getByTitle("i/")).toBeInTheDocument();
    expect(screen.getByTitle("other/")).toBeInTheDocument();
    // nothing to navigate back to, and the all-photos view is already recursive
    expect(screen.queryByText("All photos")).not.toBeInTheDocument();
    expect(screen.queryByText("Include subfolders")).not.toBeInTheDocument();
  });

  it("renders nothing when the bucket has no folder", () => {
    store.set(photosAtom, [photo("a.jpg"), photo("b.jpg")]);
    render(<FolderBrowse />);

    expect(screen.queryByText("Folders")).not.toBeInTheDocument();
  });

  it("drills into a folder and lists its subfolders", async () => {
    render(<FolderBrowse />);

    await user.click(screen.getByTitle("i/"));

    expect(store.get(displayOptionsAtom).prefix).toBe("i/");
    expect(screen.getByText("All photos")).toBeInTheDocument();
    expect(screen.getByText("i")).toBeInTheDocument();
    expect(screen.getByTitle("i/2024/")).toBeInTheDocument();
  });

  it("navigates back to the all-photos view from the breadcrumb", async () => {
    store.set(displayOptionsAtom, {
      ...galleryFilterDefault,
      prefix: "i/2024/",
    });
    render(<FolderBrowse />);

    expect(screen.getByText("2024")).toBeInTheDocument();

    await user.click(screen.getByText("All photos"));

    expect(store.get(displayOptionsAtom).prefix).toBeUndefined();
  });

  it("toggles the recursive listing of the current folder", async () => {
    store.set(displayOptionsAtom, { ...galleryFilterDefault, prefix: "i/" });
    render(<FolderBrowse />);

    await user.click(screen.getByText("Include subfolders"));

    expect(store.get(displayOptionsAtom).includeSubfolders).toBe(true);
  });
});
