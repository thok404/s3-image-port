import { describe, expect, it } from "vitest";
import {
  composeObjectKey,
  defaultKeyTemplate,
  S3KeyMetadata,
  templateLiteralDir,
} from "./s3-key";

const staticUlid = () => "01J00000000000000000000ABCD";

function createFile(name = "photo.jpg", type = "image/jpeg") {
  return new File(["x"], name, { type });
}

describe("templateLiteralDir", () => {
  it("returns the fixed directory before the first placeholder", () => {
    expect(templateLiteralDir(defaultKeyTemplate)).toBe("i/");
    expect(templateLiteralDir("images/2024/{{filename}}.{{ext}}")).toBe(
      "images/2024/",
    );
  });

  it("returns an empty string when the template starts with a placeholder", () => {
    expect(templateLiteralDir("{{year}}/{{month}}/{{ulid}}.{{ext}}")).toBe("");
    expect(templateLiteralDir("{{filename}}.{{ext}}")).toBe("");
  });
});

describe("composeObjectKey", () => {
  const template = defaultKeyTemplate;
  const rendered = "i/2026/09/18/abc.jpg";

  it("lets the template decide when no folder is chosen", () => {
    expect(
      composeObjectKey({
        folder: null,
        template,
        rendered,
        keepTemplateSubdirs: true,
      }),
    ).toBe(rendered);
    expect(
      composeObjectKey({
        folder: null,
        template,
        rendered,
        keepTemplateSubdirs: false,
      }),
    ).toBe(rendered);
  });

  it("keeps the generated subfolders under a chosen folder", () => {
    expect(
      composeObjectKey({
        folder: "photos/",
        template,
        rendered,
        keepTemplateSubdirs: true,
      }),
    ).toBe("photos/2026/09/18/abc.jpg");
  });

  it("drops the generated subfolders when asked to", () => {
    expect(
      composeObjectKey({
        folder: "photos/",
        template,
        rendered,
        keepTemplateSubdirs: false,
      }),
    ).toBe("photos/abc.jpg");
  });

  it("treats the bucket root as a folder of its own", () => {
    expect(
      composeObjectKey({
        folder: "",
        template,
        rendered,
        keepTemplateSubdirs: true,
      }),
    ).toBe("2026/09/18/abc.jpg");
    expect(
      composeObjectKey({
        folder: "",
        template,
        rendered,
        keepTemplateSubdirs: false,
      }),
    ).toBe("abc.jpg");
  });

  it("does not add a separator twice when the template has no fixed directory", () => {
    expect(
      composeObjectKey({
        folder: "photos/",
        template: "{{filename}}.{{ext}}",
        rendered: "photo.jpg",
        keepTemplateSubdirs: true,
      }),
    ).toBe("photos/photo.jpg");
  });

  it("replaces the fixed directory of the template instead of nesting it", () => {
    expect(
      composeObjectKey({
        folder: "photos/",
        template: "images/2024/{{filename}}.{{ext}}",
        rendered: "images/2024/photo.jpg",
        keepTemplateSubdirs: true,
      }),
    ).toBe("photos/photo.jpg");
  });
});

describe("S3KeyMetadata", () => {
  it("appends the chosen folder to the generated key", () => {
    const key = S3KeyMetadata.create(
      createFile(),
      "{{filename}}.{{ext}}",
      staticUlid,
      "photos/2024/",
    );
    expect(key.toString()).toBe("photos/2024/photo.jpg");
  });

  it("keeps following the template when no folder is given", () => {
    const key = S3KeyMetadata.create(
      createFile(),
      "{{filename}}.{{ext}}",
      staticUlid,
    );
    expect(key.folder).toBeNull();
    expect(key.toString()).toBe("photo.jpg");
  });

  it("keeps the folder when the template changes", () => {
    const key = S3KeyMetadata.create(
      createFile(),
      "{{filename}}.{{ext}}",
      staticUlid,
      "photos/",
    );
    const withNewTemplate = S3KeyMetadata.updateTemplate(
      "{{ulid}}.{{ext}}",
      key,
    );
    expect(withNewTemplate.folder).toBe("photos/");
    expect(withNewTemplate.toString()).toBe(
      "photos/01J00000000000000000000ABCD.jpg",
    );
  });

  it("keeps the folder when the file is reprocessed", () => {
    const key = S3KeyMetadata.create(
      createFile(),
      "{{filename}}.{{ext}}",
      staticUlid,
      "photos/",
    );
    const reprocessed = S3KeyMetadata.updateFile(
      createFile("photo.webp", "image/webp"),
      key,
    );
    expect(reprocessed.toString()).toBe("photos/photo.webp");
  });

  it("does not repeat the extension in the file name", () => {
    // `updateFile` used to store the whole file name, so `{{filename}}.{{ext}}`
    // produced `photo.jpg.jpg` after a re-compress.
    const key = S3KeyMetadata.create(
      createFile(),
      "{{filename}}.{{ext}}",
      staticUlid,
    );
    const reprocessed = S3KeyMetadata.updateFile(
      createFile("photo.jpg", "image/jpeg"),
      key,
    );
    expect(reprocessed.toString()).toBe("photo.jpg");
  });
});
