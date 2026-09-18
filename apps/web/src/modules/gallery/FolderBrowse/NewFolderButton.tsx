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
import { Input } from "@/components/ui/input";
import { useAtomValue } from "jotai";
import { FolderPlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { joinFolderPath } from "@/lib/s3/folder-path";
import { useFolderOperations } from "../hooks/use-folder-operations";
import { parentPrefixAtom } from "../hooks/use-photo-list";

/**
 * Creates a folder inside the folder currently being browsed. Nested paths
 * (`2024/05`) are accepted, S3 creates the parents implicitly.
 */
export function NewFolderButton() {
  const t = useTranslations("gallery.folder.manage");
  const parentPrefix = useAtomValue(parentPrefixAtom);
  const { createFolder, isWorking } = useFolderOperations();
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");

  const target = joinFolderPath(parentPrefix, name);

  const close = () => {
    setOpened(false);
    setName("");
  };

  const submit = async () => {
    if (!target) {
      return;
    }
    const created = await createFolder(target);
    if (created) {
      close();
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpened(true)}>
        <FolderPlusIcon className="size-4" />
        {t("newFolder")}
      </Button>

      <Dialog
        open={opened}
        onOpenChange={(open) => (open ? setOpened(true) : close())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newFolderTitle")}</DialogTitle>
            <DialogDescription>
              {parentPrefix === ""
                ? t("newFolderAtRoot")
                : t("newFolderInside", { parent: parentPrefix })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label htmlFor="new-folder-name" className="text-sm font-medium">
              {t("nameLabel")}
            </label>
            <Input
              id="new-folder-name"
              aria-label={t("nameLabel")}
              value={name}
              autoFocus
              placeholder={t("namePlaceholder")}
              disabled={isWorking}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && target) {
                  void submit();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {target ? (
                <>
                  {t("pathPreview")}{" "}
                  <span className="font-mono break-all">{target}</span>
                </>
              ) : (
                t("nameHint")
              )}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={isWorking}>
              {t("cancel")}
            </Button>
            <Button onClick={submit} disabled={!target || isWorking}>
              {isWorking ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
