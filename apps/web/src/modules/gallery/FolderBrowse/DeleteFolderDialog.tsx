"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { useFolderOperations } from "../hooks/use-folder-operations";

/**
 * Confirms the recursive deletion of a folder.
 *
 * The object count is read from S3 when the dialog opens, because a recursive
 * delete removes everything under the prefix, including the photos the gallery
 * has not listed (they may be filtered out, or simply not loaded yet).
 */
export function DeleteFolderDialog({
  prefix,
  open,
  onOpenChange,
}: {
  prefix: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("gallery.folder.manage");
  const { deleteFolder, countObjects, isWorking } = useFolderOperations();
  const [count, setCount] = useState<number | null | "loading">("loading");

  // Counting must not depend on the identity of the callbacks, otherwise a
  // re-render would trigger another listing request.
  const countObjectsRef = useRef(countObjects);
  useEffect(() => {
    countObjectsRef.current = countObjects;
  }, [countObjects]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void countObjectsRef.current(prefix).then((result) => {
      if (!cancelled) {
        setCount(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, prefix]);

  // count again from scratch next time the dialog is opened
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCount("loading");
    }
    onOpenChange(next);
  };

  const confirm = async () => {
    const deleted = await deleteFolder(prefix);
    if (deleted) {
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>{t("deleteDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="font-mono text-sm break-all">{prefix}</span>
          </div>
          <p className="pl-6 text-sm text-muted-foreground">
            {count === "loading"
              ? t("counting")
              : count === null
                ? t("countFailed")
                : t("objectCount", { count })}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isWorking}
          >
            {t("cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={isWorking}>
            {isWorking ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
