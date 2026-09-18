import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  GetBucketCorsCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3Options } from "@/stores/schemas/settings";
import mime from "mime";
import { s3Key2Url } from "./s3-key";
import type { Photo } from "@/stores/schemas/photo";

/**
 * A client for the S3 API.
 *
 * The creation overhead of the class is ignorable, so we can create one from
 * settings every time we need it.
 */
class ImageS3Client {
  /**
   * S3 has no directories: a "folder" is just an object whose key ends with a
   * slash. Such an object carries no content, it only makes the folder exist
   * even when it holds nothing.
   */
  static readonly FOLDER_SUFFIX = "/";

  client: S3Client;
  bucket: string;
  config: S3Options;

  constructor(s3Settings: S3Options) {
    this.config = s3Settings;
    this.client = new S3Client({
      region: s3Settings.region,
      forcePathStyle: s3Settings.forcePathStyle,
      credentials: {
        accessKeyId: s3Settings.accKeyId,
        secretAccessKey: s3Settings.secretAccKey,
      },
      endpoint: s3Settings.endpoint,
      // TODO: Remove workaround once https://github.com/aws/aws-sdk-js-v3/issues/6834 is fixed.
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
    this.bucket = s3Settings.bucket;
  }

  /**
   *
   * @param file The (processed) file to upload
   * @param key The key to use in S3
   * @returns The response from the S3 upload operation
   */
  async upload(file: File | string, key: string) {
    const mimeType = ImageS3Client.calculateMIME(file, key);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ContentType: mimeType,
    });
    const response = await this.client.send(command);
    // If the HTTP status code is not 200, throw an error
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`List operation get http code: ${httpStatusCode}`);
    }

    return response;
  }

  async get(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.client.send(command);
    // If the HTTP status code is not 200, throw an error
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`Get operation get http code: ${httpStatusCode}`);
    }

    return response;
  }

  async head(key: string) {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.client.send(command);
    // If the HTTP status code is not 200, throw an error
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`Head operation get http code: ${httpStatusCode}`);
    }

    return response;
  }

  async list(onlyOnce = false, maxAttempts = 200): Promise<Photo[]> {
    const fetchAllContents = async (
      nextToken?: string,
      acc = [] as Photo[],
      attempts = 0,
    ) => {
      if (attempts >= maxAttempts) {
        // hit max attempts, return the accumulated contents
        return acc;
      }

      const response = await this.listOnce(nextToken);
      const newContents = [...acc, ...response.contents];

      if (!response.IsTruncated || onlyOnce) {
        return newContents;
      }

      return fetchAllContents(
        response.NextContinuationToken,
        newContents,
        attempts + 1,
      );
    };

    return fetchAllContents();
  }

  async listOnce(NextContinuationToken?: string): Promise<{
    contents: Photo[];
    IsTruncated: boolean | undefined;
    NextContinuationToken: string | undefined;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      ContinuationToken: NextContinuationToken,
      ...(this.config.includePath && { Prefix: this.config.includePath }),
    });
    const response = await this.client.send(command);

    // If the HTTP status code is not 200, throw an error
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`List operation get http code: ${httpStatusCode}`);
    }

    // if bucket is empty, return empty array
    if (!response.Contents) {
      if (response.KeyCount !== 0) {
        console.warn("Bucket is not empty but no contents returned", response);
      }

      return {
        contents: [],
        IsTruncated: false,
        NextContinuationToken: undefined,
      };
    }

    // Folder markers (keys ending with a slash) are intentionally kept: they
    // are how an empty folder stays visible in the gallery. Consumers that want
    // photos only have to filter them out, see `isFolderMarker`.
    const contents = response.Contents.map((photo) => {
      return {
        Key: photo.Key,
        LastModified: photo.LastModified?.toISOString(),
        url: s3Key2Url(photo.Key!, this.config),
      } as Photo;
    });
    return {
      contents,
      IsTruncated: response.IsTruncated,
      NextContinuationToken: response.NextContinuationToken,
    };
  }

  async delete(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.client.send(command);
    // If the HTTP status code is not 200, throw an error
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`Delete operation get http code: ${httpStatusCode}`);
    }

    return response;
  }

  /**
   * Deletes many objects with as few requests as the API allows (up to 1000
   * keys per request). S3 reports per-key failures inside the response instead
   * of failing the whole request, so those are checked explicitly.
   *
   * @returns The number of keys that were sent for deletion
   */
  async deleteMany(keys: string[]) {
    const BATCH_SIZE = 1000;

    for (let index = 0; index < keys.length; index += BATCH_SIZE) {
      const batch = keys.slice(index, index + BATCH_SIZE);
      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      });
      const response = await this.client.send(command);
      const httpStatusCode = response.$metadata.httpStatusCode!;
      if (httpStatusCode >= 300) {
        throw new Error(`Delete operation get http code: ${httpStatusCode}`);
      }
      const firstError = response.Errors?.[0];
      if (firstError) {
        throw new Error(
          `Delete operation failed for ${response.Errors!.length} object(s), e.g. "${firstError.Key}": ${firstError.Message}`,
        );
      }
    }

    return keys.length;
  }

  /**
   * Lists every raw key under `prefix`, following pagination.
   *
   * Unlike {@link list}, this keeps the folder markers and returns keys instead
   * of `Photo` objects, which is what the folder operations need: they must see
   * every object they are about to delete or move, including the empty folders.
   */
  async listKeys(prefix = "", maxAttempts = 200): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    let attempts = 0;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await this.client.send(command);
      const httpStatusCode = response.$metadata.httpStatusCode!;
      if (httpStatusCode >= 300) {
        throw new Error(`List operation get http code: ${httpStatusCode}`);
      }

      for (const object of response.Contents ?? []) {
        if (object.Key) {
          keys.push(object.Key);
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
      attempts += 1;
    } while (continuationToken && attempts < maxAttempts);

    return keys;
  }

  /**
   * The direct subfolders of `prefix`, as full folder paths with a trailing
   * slash.
   *
   * Uses a delimiter, which makes S3 roll everything below a subfolder into a
   * single `CommonPrefixes` entry. That is what a folder picker needs: one
   * request per level instead of downloading every key in the bucket.
   */
  async listFolders(prefix = ""): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      Delimiter: "/",
    });
    const response = await this.client.send(command);
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`List operation get http code: ${httpStatusCode}`);
    }

    return (response.CommonPrefixes ?? [])
      .map((item) => item.Prefix)
      .filter((item): item is string => !!item && item !== prefix)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Server-side copy of a single object, so the bytes never travel through the
   * browser.
   */
  async copy(fromKey: string, toKey: string) {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${fromKey}`,
      Key: toKey,
    });
    const response = await this.client.send(command);
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`Copy operation get http code: ${httpStatusCode}`);
    }

    return response;
  }

  /**
   * Creates a folder by putting an empty marker object at `key`.
   *
   * S3 has no real directories, so this is exactly what every S3 client does:
   * without the marker, an empty folder would be indistinguishable from a
   * non-existent one.
   */
  async createFolder(key: string) {
    const folderKey = ImageS3Client.folderKey(key);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: folderKey,
      Body: "",
      ContentType: "application/x-directory",
    });
    const response = await this.client.send(command);
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`Create folder get http code: ${httpStatusCode}`);
    }

    return response;
  }

  /**
   * Deletes a folder, every object it holds and every one of its subfolders.
   *
   * DESTRUCTIVE AND NOT ATOMIC: the objects are listed first, then deleted in
   * batches. There is no S3 transaction, so a failure in the middle leaves the
   * folder partially deleted.
   *
   * @param key The folder key, must not be the bucket root
   * @returns The number of objects that were requested for deletion
   */
  async deleteFolder(key: string) {
    const folderKey = ImageS3Client.folderKey(key);
    if (folderKey === "") {
      throw new Error("Refusing to delete the bucket root");
    }

    const keys = await this.listKeys(folderKey);
    await this.deleteMany(keys);

    return { deleted: keys.length };
  }

  /**
   * Moves a folder by copying every object it holds to the new prefix, then
   * deleting the originals. Like {@link rename} it cannot be atomic, but it is
   * the best S3 can offer and the bytes stay server-side.
   *
   * @param fromKey The folder to move
   * @param toKey The destination folder (must be outside of `fromKey`)
   */
  async moveFolder(fromKey: string, toKey: string, concurrency = 4) {
    const from = ImageS3Client.folderKey(fromKey);
    const to = ImageS3Client.folderKey(toKey);

    if (from === "" || to === "") {
      throw new Error("Refusing to move the bucket root");
    }
    if (from === to) {
      throw new Error("The destination is the same as the source");
    }
    if (to.startsWith(from)) {
      throw new Error("A folder cannot be moved inside itself");
    }

    const keys = await this.listKeys(from);

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, keys.length) },
      async () => {
        while (cursor < keys.length) {
          const key = keys[cursor++];
          await this.copy(key, `${to}${key.slice(from.length)}`);
        }
      },
    );
    // Everything is copied before anything is deleted, so an interrupted move
    // duplicates objects instead of losing them.
    await Promise.all(workers);
    await this.deleteMany(keys);

    return { moved: keys.length };
  }

  /**
   * Normalizes a folder key: strips leading slashes and guarantees a single
   * trailing slash. `""` / `"/"` both mean the bucket root.
   */
  static folderKey(key: string) {
    const trimmed = key.replace(/^\/+/, "");
    if (trimmed === "") {
      return "";
    }
    return trimmed.endsWith(ImageS3Client.FOLDER_SUFFIX)
      ? trimmed
      : `${trimmed}${ImageS3Client.FOLDER_SUFFIX}`;
  }

  /**
   * Renames an object by copying it to a new key and deleting the old one.
   * This is the most ACID approach possible with S3 (server-side copy, no data transfer).
   *
   * IMPORTANT: Race condition exists - another process could create an object at newKey
   * between the existence check and the copy operation. This is a limitation of S3's API.
   *
   * Notes:
   * - There's a brief window between copy and delete where both objects exist
   * - Checks if newKey already exists to prevent accidental data loss
   * - Use force=true to intentionally overwrite an existing object at newKey
   *
   * @param oldKey The current key of the object
   * @param newKey The new key for the object
   * @param force If true, allows overwriting an existing object at newKey (default: false)
   * @returns The response from the copy operation
   * @throws Error if newKey already exists and force=false
   */
  async rename(oldKey: string, newKey: string, force = false) {
    // Step 1: Check if newKey already exists (to prevent data loss)
    if (!force) {
      try {
        await this.head(newKey);
        // If head succeeds, object exists at newKey
        throw new Error(
          `Object already exists at key "${newKey}". Use force=true to overwrite, or choose a different key.`,
        );
      } catch (error: unknown) {
        // If head fails with 404/NotFound, the key doesn't exist (safe to proceed)
        // If it's our custom error about existing object, re-throw it
        if (
          error instanceof Error &&
          error.message?.includes("Object already exists")
        ) {
          throw error;
        }
        // Other errors (404, NotFound) mean object doesn't exist - continue
        const awsError = error as {
          $metadata?: { httpStatusCode?: number };
          name?: string;
        };
        if (
          awsError.$metadata?.httpStatusCode !== 404 &&
          awsError.name !== "NotFound"
        ) {
          // Unexpected error during head operation
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to check if ${newKey} exists: ${errorMessage}`,
          );
        }
      }
    }

    // Step 2: Copy the object to the new key (server-side, preserves metadata)
    const copyResponse = await this.copy(oldKey, newKey);

    // Step 3: Delete the old object
    try {
      await this.delete(oldKey);
    } catch (error) {
      // Copy succeeded but delete failed - log warning but don't throw
      // This leaves both objects in the bucket, which is safer than losing data
      console.error(
        `Rename: Copy succeeded but delete of old key failed for ${oldKey}`,
        error,
      );
      throw new Error(
        `Renamed to ${newKey} but failed to delete old key ${oldKey}. Both objects exist.`,
      );
    }

    return copyResponse;
  }

  async getCors() {
    const command = new GetBucketCorsCommand({
      Bucket: this.bucket,
    });
    const response = await this.client.send(command);
    // If the HTTP status code is not 200, throw an error
    const httpStatusCode = response.$metadata.httpStatusCode!;
    if (httpStatusCode >= 300) {
      throw new Error(`GetCors operation get http code: ${httpStatusCode}`);
    }
    return response;
  }

  private static calculateMIME(file: File | Blob | string, key: string) {
    const defaultMIME = "application/octet-stream";
    const keyExt = key.split(".").pop();

    switch (true) {
      case file instanceof String:
        return "text/plain";
      case file instanceof File || file instanceof Blob:
        if (file.type) {
          return file.type;
        } else if (keyExt) {
          return mime.getType(keyExt) ?? defaultMIME;
        } else {
          console.error("Unexpected file type", key);
          return defaultMIME;
        }
      default:
        return defaultMIME;
    }
  }
}

export default ImageS3Client;
