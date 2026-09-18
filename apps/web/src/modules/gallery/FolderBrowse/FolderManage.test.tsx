import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStore } from "jotai";
import { render } from "@/../test/utils/render-with-providers";
import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { produce } from "immer";
import { FolderBrowse } from ".";
import { displayOptionsAtom, photosAtom } from "@/stores/atoms/gallery";
import { profilesAtom } from "@/stores/atoms/settings";
import { getDefaultOptions } from "@/stores/schemas/settings";
import { galleryFilterDefault } from "@/stores/schemas/gallery/filter";
import type { Photo } from "@/stores/schemas/photo";
import type ImageS3Client from "@/lib/s3/image-s3-client";

const mocks = vi.hoisted(() => {
  return {
    list: vi.fn(),
    listKeys: vi.fn(),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveFolder: vi.fn(),
  };
});

vi.mock(import("@/lib/s3/image-s3-client"), () => {
  return {
    default: class MockImageS3Client {
      list = mocks.list;
      listKeys = mocks.listKeys;
      createFolder = mocks.createFolder;
      deleteFolder = mocks.deleteFolder;
      moveFolder = mocks.moveFolder;
    } as unknown as typeof ImageS3Client,
  };
});

const store = getDefaultStore();
const user = userEvent.setup();

const photo = (key: string): Photo => ({
  Key: key,
  LastModified: "2024-01-01T00:00:00.000Z",
  url: `https://example.com/${key}`,
});

const photos: Photo[] = [
  photo("i/2024/"),
  photo("i/2024/a.jpg"),
  photo("i/other/b.jpg"),
];

/** Queries scoped to the dialog currently on screen. */
function dialog() {
  const element = document.querySelector('[data-slot="dialog-content"]');
  if (!element) {
    throw new Error("No dialog is open");
  }
  return within(element as HTMLElement);
}

beforeEach(() => {
  vi.clearAllMocks();
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

  mocks.list.mockResolvedValue(photos);
  mocks.listKeys.mockResolvedValue(["i/2024/", "i/2024/a.jpg"]);
  mocks.createFolder.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });
  mocks.deleteFolder.mockResolvedValue({ deleted: 2 });
  mocks.moveFolder.mockResolvedValue({ moved: 2 });

  store.set(photosAtom, photos);
  store.set(displayOptionsAtom, galleryFilterDefault);
});

describe("folder management", () => {
  it("creates a folder in the folder being browsed and moves into it", async () => {
    render(<FolderBrowse />);

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(dialog().getByLabelText("Folder name"), "empty");
    expect(dialog().getByText("empty/")).toBeInTheDocument();

    await user.click(dialog().getByRole("button", { name: "Create" }));

    await expect.poll(() => mocks.createFolder.mock.calls.length).toBe(1);
    expect(mocks.createFolder).toHaveBeenCalledWith("empty/");
    await expect
      .poll(() => store.get(displayOptionsAtom).prefix)
      .toBe("empty/");
  });

  it("supports nested paths and resolves them against the current folder", async () => {
    store.set(displayOptionsAtom, { ...galleryFilterDefault, prefix: "i/" });
    render(<FolderBrowse />);

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(dialog().getByLabelText("Folder name"), "2024/05");
    expect(dialog().getByText("i/2024/05/")).toBeInTheDocument();

    await user.click(dialog().getByRole("button", { name: "Create" }));

    await expect.poll(() => mocks.createFolder.mock.calls.length).toBe(1);
    expect(mocks.createFolder).toHaveBeenCalledWith("i/2024/05/");
  });

  it("refuses an unusable folder name", async () => {
    render(<FolderBrowse />);

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(dialog().getByLabelText("Folder name"), "../escape");

    expect(dialog().getByRole("button", { name: "Create" })).toBeDisabled();
    expect(mocks.createFolder).not.toHaveBeenCalled();
  });

  it("deletes the folder being browsed and goes back to its parent", async () => {
    store.set(displayOptionsAtom, {
      ...galleryFilterDefault,
      prefix: "i/2024/",
    });
    render(<FolderBrowse />);

    await user.click(
      screen.getByRole("button", { name: "Delete this folder" }),
    );
    expect(dialog().getByText("i/2024/")).toBeInTheDocument();
    // the count is read live from S3, not from the photos already loaded
    await expect.poll(() => mocks.listKeys.mock.calls.length).toBe(1);
    expect(mocks.listKeys).toHaveBeenCalledWith("i/2024/");
    await expect
      .poll(() => dialog().queryByText("2 objects will be deleted") !== null)
      .toBe(true);

    await user.click(dialog().getByRole("button", { name: "Delete" }));

    await expect.poll(() => mocks.deleteFolder.mock.calls.length).toBe(1);
    expect(mocks.deleteFolder).toHaveBeenCalledWith("i/2024/");
    await expect.poll(() => store.get(displayOptionsAtom).prefix).toBe("i/");
  });

  it("renames a folder from its tile menu", async () => {
    render(<FolderBrowse />);

    await user.click(screen.getByRole("button", { name: "Actions for i" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Rename or move" }),
    );

    const input = dialog().getByLabelText("New path");
    await user.clear(input);
    await user.type(input, "images/");
    await user.click(dialog().getByRole("button", { name: "Rename" }));

    await expect.poll(() => mocks.moveFolder.mock.calls.length).toBe(1);
    expect(mocks.moveFolder).toHaveBeenCalledWith("i/", "images/");
  });

  it("refuses to move a folder inside itself", async () => {
    render(<FolderBrowse />);

    await user.click(screen.getByRole("button", { name: "Actions for i" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Rename or move" }),
    );

    const input = dialog().getByLabelText("New path");
    await user.clear(input);
    await user.type(input, "i/nested/");

    expect(
      dialog().getByText("A folder cannot be moved inside itself"),
    ).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(mocks.moveFolder).not.toHaveBeenCalled();
  });

  it("refuses a path that cannot be a folder key", async () => {
    render(<FolderBrowse />);

    await user.click(screen.getByRole("button", { name: "Actions for i" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Rename or move" }),
    );

    const input = dialog().getByLabelText("New path");
    await user.clear(input);
    await user.type(input, "..");

    expect(dialog().getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(mocks.moveFolder).not.toHaveBeenCalled();
  });
});
