"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayOptionsAtom } from "@/stores/atoms/gallery";
import { useSetAtom } from "jotai";
import {
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import type { ChildFolder } from "../hooks/folder-logic";
import { DeleteFolderDialog } from "./DeleteFolderDialog";
import { RenameFolderDialog } from "./RenameFolderDialog";

/**
 * The per-folder actions, shown on the tile: open, rename (which is really a
 * move) and delete.
 *
 * The dialogs are rendered next to the menu rather than inside it, so the menu
 * can close without taking the dialog away with it.
 */
export function FolderTileMenu({ folder }: { folder: ChildFolder }) {
  const t = useTranslations("gallery.folder.manage");
  const setDisplayOptions = useSetAtom(displayOptionsAtom);
  const [renameOpened, setRenameOpened] = useState(false);
  const [deleteOpened, setDeleteOpened] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("folderActions", { name: folder.name })}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() =>
              setDisplayOptions((prev) => ({ ...prev, prefix: folder.prefix }))
            }
          >
            <FolderOpenIcon /> {t("open")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenameOpened(true)}>
            <PencilIcon /> {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteOpened(true)}>
            <Trash2Icon /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameFolderDialog
        prefix={folder.prefix}
        open={renameOpened}
        onOpenChange={setRenameOpened}
      />
      <DeleteFolderDialog
        prefix={folder.prefix}
        open={deleteOpened}
        onOpenChange={setDeleteOpened}
      />
    </>
  );
}
