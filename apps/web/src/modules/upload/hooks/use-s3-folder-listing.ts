import ImageS3Client from "@/lib/s3/image-s3-client";
import { validS3SettingsAtom } from "@/stores/atoms/settings";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";

/**
 * Reads the folder structure of the bucket, one level at a time.
 *
 * A folder picker cannot rely on the gallery cache: the gallery may not have
 * been opened yet, and it only holds what its filters let through. Listing with
 * a delimiter costs one request per level and always shows the real bucket.
 */
export function useS3FolderListing() {
  const s3Settings = useAtomValue(validS3SettingsAtom);
  const client = useMemo(
    () => (s3Settings ? new ImageS3Client(s3Settings) : undefined),
    [s3Settings],
  );
  /** `null` while loading. */
  const [folders, setFolders] = useState<string[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const refresh = useCallback(
    async (prefix: string) => {
      if (!client) {
        setFolders([]);
        setHasError(true);
        return;
      }
      setFolders(null);
      setHasError(false);
      try {
        setFolders(await client.listFolders(prefix));
      } catch (error) {
        console.error("Failed to list folders", error);
        setFolders([]);
        setHasError(true);
      }
    },
    [client],
  );

  const createFolder = useCallback(
    async (path: string) => {
      if (!client) {
        return false;
      }
      setIsCreating(true);
      try {
        await client.createFolder(path);
        return true;
      } catch (error) {
        console.error("Failed to create folder", error);
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [client],
  );

  return { folders, hasError, isCreating, refresh, createFolder };
}
