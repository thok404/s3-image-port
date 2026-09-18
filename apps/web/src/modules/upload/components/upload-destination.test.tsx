import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStore } from "jotai";
import { render } from "@/../test/utils/render-with-providers";
import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { produce } from "immer";
import { TargetFolderField } from "./TargetFolderField";
import { profilesAtom, uploadSettingsAtom } from "@/stores/atoms/settings";
import { getDefaultOptions } from "@/stores/schemas/settings";
import type ImageS3Client from "@/lib/s3/image-s3-client";

const mocks = vi.hoisted(() => {
  return {
    listFolders: vi.fn(),
    createFolder: vi.fn(),
  };
});

vi.mock(import("@/lib/s3/image-s3-client"), () => {
  return {
    default: class MockImageS3Client {
      listFolders = mocks.listFolders;
      createFolder = mocks.createFolder;
    } as unknown as typeof ImageS3Client,
  };
});

const store = getDefaultStore();
const user = userEvent.setup();

/** Queries scoped to the dialog currently on screen. */
function dialog() {
  const element = document.querySelector('[data-slot="dialog-content"]');
  if (!element) {
    throw new Error("No dialog is open");
  }
  return within(element as HTMLElement);
}

/** The destination shown in the field, e.g. "Follow key template". */
function destinationButton() {
  return screen.getByTestId("destination-picker-button");
}

const preview = () => screen.getByTestId("upload-destination-preview");

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

  mocks.listFolders.mockImplementation((prefix: string) => {
    if (prefix === "") {
      return Promise.resolve(["i/", "photos/"]);
    }
    if (prefix === "photos/") {
      return Promise.resolve(["photos/2024/"]);
    }
    return Promise.resolve([]);
  });
  mocks.createFolder.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });
});

describe("upload destination", () => {
  it("follows the key template by default", async () => {
    render(<TargetFolderField />);

    expect(destinationButton()).toHaveTextContent("Follow key template");
    await expect
      .element(preview())
      .toHaveTextContent(/IMG_0001\.jpg → i\/\d{4}\/\d{2}\/\d{2}\//);
  });

  it("browses the bucket and applies the chosen folder", async () => {
    render(<TargetFolderField />);

    await user.click(destinationButton());
    await expect.poll(() => dialog().queryByText("photos") !== null).toBe(true);
    expect(mocks.listFolders).toHaveBeenCalledWith("");

    await user.click(dialog().getByText("photos"));
    await expect.poll(() => dialog().queryByText("2024") !== null).toBe(true);
    expect(mocks.listFolders).toHaveBeenCalledWith("photos/");

    await user.click(dialog().getByRole("button", { name: "Use this folder" }));

    await expect
      .poll(() => store.get(uploadSettingsAtom).targetFolder)
      .toBe("photos/");
    expect(destinationButton()).toHaveTextContent("photos/");
    // the generated subfolders are kept by default
    await expect
      .element(preview())
      .toHaveTextContent(/photos\/\d{4}\/\d{2}\/\d{2}\//);
  });

  it("can drop the generated subfolders", async () => {
    render(<TargetFolderField />);

    await user.click(destinationButton());
    await user.click(dialog().getByText("i"));
    await user.click(dialog().getByRole("button", { name: "Use this folder" }));

    await expect.poll(() => destinationButton().textContent).toBe("i/");

    await user.click(
      screen.getByRole("switch", { name: "Keep template subfolders" }),
    );

    // only the generated file name is kept, so one path segment after the folder
    await expect.element(preview()).toHaveTextContent(/→ i\/[^/]+\.jpg$/);
  });

  it("keeps the subfolder switch out of the way while following the template", async () => {
    render(<TargetFolderField />);

    expect(
      screen.getByRole("switch", { name: "Keep template subfolders" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Only used once a folder is chosen."),
    ).toBeInTheDocument();
  });

  it("creates a folder from inside the picker", async () => {
    render(<TargetFolderField />);

    await user.click(destinationButton());
    await user.click(dialog().getByText("photos"));
    await user.click(dialog().getByRole("button", { name: "New folder" }));
    await user.type(dialog().getByLabelText("New folder"), "2026-holiday");
    await user.click(dialog().getByRole("button", { name: "Create" }));

    await expect.poll(() => mocks.createFolder.mock.calls.length).toBe(1);
    expect(mocks.createFolder).toHaveBeenCalledWith("photos/2026-holiday/");
    await expect
      .poll(() => dialog().queryByText("2026-holiday") !== null)
      .toBe(true);
  });

  it("returns to the template from the picker", async () => {
    store.set(uploadSettingsAtom, (prev) => ({
      ...prev,
      targetFolder: "photos/",
    }));
    render(<TargetFolderField />);

    await user.click(destinationButton());
    await user.click(
      dialog().getByRole("button", { name: "Follow key template" }),
    );

    await expect
      .poll(() => store.get(uploadSettingsAtom).targetFolder)
      .toBeNull();
    expect(destinationButton()).toHaveTextContent("Follow key template");
  });
});
