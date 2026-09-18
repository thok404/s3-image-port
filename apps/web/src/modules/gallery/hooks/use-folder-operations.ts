import ImageS3Client from "@/lib/s3/image-s3-client";
import { displayOptionsAtom } from "@/stores/atoms/gallery";
import { validS3SettingsAtom } from "@/stores/atoms/settings";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import {
  isDescendantPrefix,
  normalizePrefix,
  parentPrefix,
} from "./folder-logic";
import { useFetchPhotoList } from "./use-photo-list";

/**
 * Create / rename / delete operations for S3 folders.
 *
 * Every operation re-fetches the photo list and keeps the browsing state
 * consistent: after creating a folder the user lands inside it, after deleting
 * the folder they are browsing they land in its parent, and after moving the
 * folder they are browsing the browsing path follows the move.
 */
export function useFolderOperations() {
  const s3Settings = useAtomValue(validS3SettingsAtom);
  const setDisplayOptions = useSetAtom(displayOptionsAtom);
  const { fetchPhotoList } = useFetchPhotoList();
  const t = useTranslations("gallery.folder.manage");
  const [isWorking, setIsWorking] = useState(false);

  const getClient = useCallback(() => {
    if (!s3Settings) {
      toast.error(t("noS3Settings"));
      return undefined;
    }
    return new ImageS3Client(s3Settings);
  }, [s3Settings, t]);

  const createFolder = useCallback(
    async (target: string) => {
      const client = getClient();
      if (!client) {
        return false;
      }
      setIsWorking(true);
      try {
        toast.message(t("creating"));
        await client.createFolder(target);
        toast.success(t("createSuccess"));
        await fetchPhotoList({ toastLevel: "error" });
        setDisplayOptions((prev) => ({ ...prev, prefix: target }));
        return true;
      } catch (error) {
        console.error("Failed to create folder", error);
        toast.error(t("createFailed"));
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [getClient, fetchPhotoList, setDisplayOptions, t],
  );

  const deleteFolder = useCallback(
    async (prefix: string) => {
      const client = getClient();
      if (!client) {
        return false;
      }
      setIsWorking(true);
      try {
        toast.message(t("deleting"));
        const { deleted } = await client.deleteFolder(prefix);
        toast.success(t("deleteSuccess", { count: deleted }));
        await fetchPhotoList({ toastLevel: "error" });

        const deletedPath = normalizePrefix(prefix);
        setDisplayOptions((prev) => {
          const current =
            prev.prefix === undefined
              ? undefined
              : normalizePrefix(prev.prefix);
          if (
            current === undefined ||
            !(
              current === deletedPath ||
              isDescendantPrefix(deletedPath, current)
            )
          ) {
            return prev;
          }
          const parent = parentPrefix(deletedPath);
          // An empty parent means the bucket root: there is no folder left to
          // browse, so fall back to the all-photos view.
          return { ...prev, prefix: parent === "" ? undefined : parent };
        });
        return true;
      } catch (error) {
        console.error("Failed to delete folder", error);
        toast.error(t("deleteFailed"));
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [getClient, fetchPhotoList, setDisplayOptions, t],
  );

  const moveFolder = useCallback(
    async (from: string, to: string) => {
      const client = getClient();
      if (!client) {
        return false;
      }
      setIsWorking(true);
      try {
        toast.message(t("moving"));
        const { moved } = await client.moveFolder(from, to);
        toast.success(t("moveSuccess", { count: moved }));
        await fetchPhotoList({ toastLevel: "error" });

        const fromPath = normalizePrefix(from);
        const toPath = normalizePrefix(to);
        setDisplayOptions((prev) => {
          const current =
            prev.prefix === undefined
              ? undefined
              : normalizePrefix(prev.prefix);
          if (
            current === undefined ||
            !(current === fromPath || isDescendantPrefix(fromPath, current))
          ) {
            return prev;
          }
          return {
            ...prev,
            prefix: `${toPath}${current.slice(fromPath.length)}`,
          };
        });
        return true;
      } catch (error) {
        console.error("Failed to move folder", error);
        if (error instanceof Error && error.message.includes("inside itself")) {
          toast.error(t("nestedPath"));
        } else {
          toast.error(t("moveFailed"));
        }
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [getClient, fetchPhotoList, setDisplayOptions, t],
  );

  /**
   * Number of objects a delete would remove, live from S3. The gallery only
   * holds the photos it listed, so it cannot answer this on its own.
   *
   * Returns `null` when the count could not be read.
   */
  const countObjects = useCallback(
    async (prefix: string) => {
      const client = getClient();
      if (!client) {
        return null;
      }
      try {
        const keys = await client.listKeys(normalizePrefix(prefix));
        return keys.length;
      } catch (error) {
        console.error("Failed to count objects in folder", error);
        return null;
      }
    },
    [getClient],
  );

  return {
    isWorking,
    createFolder,
    deleteFolder,
    moveFolder,
    countObjects,
  };
}
