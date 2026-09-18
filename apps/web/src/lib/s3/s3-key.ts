import { format } from "date-fns";
import { ulid, type ULIDFactory } from "ulid";
import mime from "mime";
import type { S3Options } from "@/stores/schemas/settings";

const _availablePlaceholders = [
  "year",
  "month",
  "day",
  "timestamp",
  "filename",
  "ulid",
  "ext",

  /**
   * Should always be used with year & month & day
   */
  "ulid-dayslice",
  /**
   * @deprecated renamed to `ulid-dayslice`
   */
  "random",
] as const;

type AvailablePlaceholders = (typeof _availablePlaceholders)[number];

export const defaultKeyTemplate =
  "i/{{year}}/{{month}}/{{day}}/{{ulid-dayslice}}.{{ext}}";

/**
 * The fixed directory in front of the first placeholder of a template.
 *
 * `i/{{year}}/{{month}}/x.{{ext}}` -> `"i/"`, `{{filename}}.{{ext}}` -> `""`.
 * This is the part a user picking a target folder means to replace, which is
 * why {@link composeObjectKey} strips it when a folder is set.
 */
export function templateLiteralDir(template: string): string {
  const firstPlaceholder = template.indexOf("{{");
  const literal =
    firstPlaceholder === -1 ? template : template.slice(0, firstPlaceholder);
  const lastSlash = literal.lastIndexOf("/");
  return lastSlash === -1 ? "" : literal.slice(0, lastSlash + 1);
}

/** The last path segment of a rendered key, e.g. `i/2024/a.jpg` -> `a.jpg`. */
function lastSegment(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

/**
 * Builds the final S3 key from the template output and the target folder.
 *
 * - `folder === null`: the template decides everything (the default, and what
 *   the app did before a target folder existed).
 * - `keepTemplateSubdirs`: keep the directories the template generates under
 *   the target folder, minus the template's own fixed leading directory.
 *   Otherwise only the generated file name is kept.
 */
export function composeObjectKey({
  folder,
  template,
  rendered,
  keepTemplateSubdirs,
}: {
  folder: string | null;
  template: string;
  rendered: string;
  keepTemplateSubdirs: boolean;
}): string {
  if (folder === null) {
    return rendered;
  }
  const relative = keepTemplateSubdirs
    ? rendered.slice(templateLiteralDir(template).length)
    : lastSegment(rendered);
  const path = relative.replace(/^\/+/, "");
  return path === "" ? folder : `${folder}${path}`;
}

function filenameOf(file: File): string {
  return file.name.split(".").shift() || "";
}

function extensionOf(file: File): string {
  return mime.getExtension(file.type) ?? file.name.split(".").pop() ?? "";
}

/**
 * Utility class for generating and updating a S3 key.
 *
 * use `create` to generate a new key metadata from a file and template.
 *
 * the `toString` method will return the final S3 key.
 */
export class S3KeyMetadata {
  template: string;
  data: Record<AvailablePlaceholders, string>;
  /**
   * The folder the user picked for this upload, `null` when the template is
   * allowed to decide the whole path. Kept next to the template because both
   * are edited independently but only combine into a key together.
   */
  folder: string | null;
  keepTemplateSubdirs: boolean;
  private constructor(
    template: string,
    data: Record<AvailablePlaceholders, string>,
    folder: string | null = null,
    keepTemplateSubdirs = true,
  ) {
    this.template = template;
    this.data = data;
    this.folder = folder;
    this.keepTemplateSubdirs = keepTemplateSubdirs;
  }
  static create(
    file: File,
    template: string,
    ulidGenerator?: ULIDFactory,
    folder: string | null = null,
    keepTemplateSubdirs = true,
  ) {
    const generatedUlid = ulidGenerator ? ulidGenerator() : ulid();
    const date = new Date();
    const data: Record<AvailablePlaceholders, string> = {
      year: format(date, "yyyy"),
      month: format(date, "MM"),
      day: format(date, "dd"),
      filename: filenameOf(file),
      ext: extensionOf(file),
      "ulid-dayslice": `${generatedUlid.slice(4, 10).toLowerCase()}-${generatedUlid.slice(-4).toLowerCase()}`,
      random: `${generatedUlid.slice(4, 10).toLowerCase()}-${generatedUlid.slice(-4).toLowerCase()}`,
      timestamp: date.getTime().toString(),
      ulid: generatedUlid,
    };
    return new S3KeyMetadata(template, data, folder, keepTemplateSubdirs);
  }
  static updateFile(file: File, prev: S3KeyMetadata) {
    return new S3KeyMetadata(
      prev.template,
      {
        ...prev.data,
        filename: filenameOf(file),
        ext: extensionOf(file),
      },
      prev.folder,
      prev.keepTemplateSubdirs,
    );
  }
  static updateTemplate(template: string, prev: S3KeyMetadata) {
    return new S3KeyMetadata(
      template,
      prev.data,
      prev.folder,
      prev.keepTemplateSubdirs,
    );
  }
  /** Points this upload at another folder (or back at the template). */
  withFolder(folder: string | null, keepTemplateSubdirs = true) {
    return new S3KeyMetadata(
      this.template,
      this.data,
      folder,
      keepTemplateSubdirs,
    );
  }
  /** The template with its placeholders replaced, before the folder applies. */
  rendered() {
    return this.template.replace(
      /{{(.*?)}}/g,
      (match, key) => this.data[key as AvailablePlaceholders] || match,
    );
  }
  toString() {
    return composeObjectKey({
      folder: this.folder,
      template: this.template,
      rendered: this.rendered(),
      keepTemplateSubdirs: this.keepTemplateSubdirs,
    });
  }
}

function addTrailingSlash(url: string) {
  if (url.endsWith("/")) {
    return url;
  }
  return url + "/";
}
export function s3Key2Url(key: string, config: S3Options) {
  if (!config.pubUrl) {
    return addTrailingSlash(config.endpoint) + config.bucket + "/" + key;
  } else {
    return addTrailingSlash(config.pubUrl) + key;
  }
}
