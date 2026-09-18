import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { Provider, createStore, useAtomValue, useSetAtom } from "jotai";
import { S3KeyMetadata } from "@/lib/s3/s3-key";
import { uploadSettingsAtom } from "@/stores/atoms/settings";
import {
  applyUploadTargetAtom,
  applyUploadTemplateAtom,
  applyUploadCompressionAtom,
  appendFilesAtom,
  fileListAtom,
  uploadTargetAtom,
} from "./upload-atoms";
import type { PendingUpload } from "../types";

vi.mock(import("sonner"), () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  } as unknown as typeof import("sonner").toast,
}));

function createTestFile(name: string, type = "image/jpeg"): File {
  return new File(["test content"], name, { type });
}

function entry(name: string, status: PendingUpload["status"]): PendingUpload {
  return {
    file: createTestFile(name),
    processedFile: null,
    key: S3KeyMetadata.create(createTestFile(name), "i/{{filename}}.{{ext}}"),
    compressOption: null,
    status,
    id: name,
    supportProcess: true,
  };
}

let store: ReturnType<typeof createStore>;

function wrapper({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  store = createStore();
});

describe("upload destination", () => {
  it("follows the key template until a folder is chosen", async () => {
    const { result, act } = await renderHook(
      () => ({
        target: useAtomValue(uploadTargetAtom),
        append: useSetAtom(appendFilesAtom),
        applyTarget: useSetAtom(applyUploadTargetAtom),
        files: useAtomValue(fileListAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.append([createTestFile("a.jpg")]);
    });
    expect(result.current.files[0].key.toString()).toMatch(/^i\/\d{4}\//);

    await act(() => {
      result.current.applyTarget({
        folder: "photos/2024/",
        keepTemplateSubdirs: false,
      });
    });

    // no subfolder from the template is kept, only the generated file name
    expect(result.current.files[0].key.toString()).toMatch(
      /^photos\/2024\/[^/]+\.jpg$/,
    );
    expect(result.current.target.folder).toBe("photos/2024/");
  });

  it("keeps the generated subfolders by default", async () => {
    const { result, act } = await renderHook(
      () => ({
        append: useSetAtom(appendFilesAtom),
        applyTarget: useSetAtom(applyUploadTargetAtom),
        files: useAtomValue(fileListAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.append([createTestFile("a.jpg")]);
    });
    await act(() => {
      result.current.applyTarget({ folder: "photos/2024/" });
    });

    expect(result.current.files[0].key.toString()).toMatch(
      /^photos\/2024\/\d{4}\/\d{2}\/\d{2}\/.*\.jpg$/,
    );
  });

  it("persists the destination for the files added afterwards", async () => {
    const { result, act } = await renderHook(
      () => ({
        append: useSetAtom(appendFilesAtom),
        applyTarget: useSetAtom(applyUploadTargetAtom),
        files: useAtomValue(fileListAtom),
        settings: useAtomValue(uploadSettingsAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.applyTarget({ folder: "photos/" });
    });
    await act(() => {
      result.current.append([createTestFile("late.jpg")]);
    });

    expect(result.current.settings.targetFolder).toBe("photos/");
    expect(result.current.files[0].key.toString()).toMatch(/^photos\//);
  });

  it("leaves uploaded files on the key they were uploaded with", async () => {
    store.set(fileListAtom, [
      entry("done.jpg", "uploaded"),
      entry("pending.jpg", "pending"),
    ]);

    const { result, act } = await renderHook(
      () => ({
        applyTarget: useSetAtom(applyUploadTargetAtom),
        files: useAtomValue(fileListAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.applyTarget({
        folder: "photos/",
        keepTemplateSubdirs: false,
      });
    });

    expect(result.current.files[0].key.toString()).toBe("i/done.jpg");
    expect(result.current.files[1].key.toString()).toBe("photos/pending.jpg");
  });

  it("applies a template change to the queued files", async () => {
    store.set(fileListAtom, [entry("a.jpg", "pending")]);

    const { result, act } = await renderHook(
      () => ({
        applyTemplate: useSetAtom(applyUploadTemplateAtom),
        files: useAtomValue(fileListAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.applyTemplate("archive/{{filename}}.{{ext}}");
    });

    expect(result.current.files[0].key.toString()).toBe("archive/a.jpg");
  });

  it("keeps the folder when the template changes", async () => {
    const { result, act } = await renderHook(
      () => ({
        append: useSetAtom(appendFilesAtom),
        applyTarget: useSetAtom(applyUploadTargetAtom),
        applyTemplate: useSetAtom(applyUploadTemplateAtom),
        files: useAtomValue(fileListAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.applyTarget({
        folder: "photos/",
        keepTemplateSubdirs: false,
      });
    });
    await act(() => {
      result.current.append([createTestFile("a.jpg")]);
    });
    await act(() => {
      result.current.applyTemplate("{{filename}}.{{ext}}");
    });

    expect(result.current.files[0].key.toString()).toBe("photos/a.jpg");
  });
});

describe("upload compression", () => {
  const webp = { type: "webp", quality: 70 } as const;

  it("stores the default and applies it to the queued files", async () => {
    store.set(fileListAtom, [entry("a.jpg", "pending")]);

    const { result, act } = await renderHook(
      () => ({
        setOption: useSetAtom(applyUploadCompressionAtom),
        option: useAtomValue(applyUploadCompressionAtom),
        files: useAtomValue(fileListAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.setOption(webp);
    });

    expect(result.current.option).toEqual(webp);
    expect(result.current.files[0].compressOption).toEqual(webp);
    expect(result.current.files[0].status).toBe("pending");
  });

  it("leaves the files that are already in flight alone", async () => {
    store.set(fileListAtom, [
      entry("converting.jpg", "processing"),
      entry("sending.jpg", "uploading"),
      entry("done.jpg", "uploaded"),
      entry("queued.jpg", "pending"),
    ]);

    const { result, act } = await renderHook(
      () => ({
        setOption: useSetAtom(applyUploadCompressionAtom),
        files: useAtomValue(fileListAtom),
      }),
      { wrapper },
    );

    await act(() => {
      result.current.setOption(webp);
    });

    // a conversion in progress already picked its format
    expect(result.current.files[0].compressOption).toBeNull();
    expect(result.current.files[0].status).toBe("processing");
    // the upload already carries the previous key and body
    expect(result.current.files[1].compressOption).toBeNull();
    expect(result.current.files[1].status).toBe("uploading");
    expect(result.current.files[2].status).toBe("uploaded");

    expect(result.current.files[3].compressOption).toEqual(webp);
  });
});
