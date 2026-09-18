"use client";

import { AutoResizeHeight } from "@/components/misc/auto-resize-height";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAtom } from "jotai";
import { ChevronRightIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import {
  applyUploadCompressionAtom,
  applyUploadTemplateAtom,
} from "../atoms/upload-atoms";
import ImageCompressOptions from "../settings/ImageCompressOptions";
import { KeyTemplateSettingsInput } from "../settings/key-template/setting-input";
import { TargetFolderField } from "./TargetFolderField";

/**
 * The upload settings, on the upload page.
 *
 * Everything here used to live under Settings → Upload, which meant leaving the
 * page the settings apply to. Editing a template while looking at the files it
 * names is the whole point: the panel edits the same atoms the queue uses, and
 * the files already queued follow the changes.
 */
export function UploadSettingsPanel() {
  const t = useTranslations("upload.settings");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [compressOption, setCompressOption] = useAtom(
    applyUploadCompressionAtom,
  );

  return (
    <Card className="mb-8">
      <CardContent className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold">{t("title")}</h2>

        <TargetFolderField />

        <div className="flex flex-col gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((prev) => !prev)}
          >
            <ChevronRightIcon
              className={cn(
                "size-4 transition-transform",
                showAdvanced && "rotate-90",
              )}
            />
            {t("advanced")}
          </Button>

          <AutoResizeHeight duration={0.15}>
            <AnimatePresence initial={false}>
              {showAdvanced && (
                <motion.div
                  className="flex flex-col gap-5 pt-1"
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{
                    opacity: 0,
                    filter: "blur(4px)",
                    transition: { duration: 0.15 },
                  }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <KeyTemplateSettingsInput
                    templateAtom={applyUploadTemplateAtom}
                  />
                  <Separator />
                  <ImageCompressOptions
                    value={compressOption}
                    onChange={setCompressOption}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </AutoResizeHeight>
        </div>
      </CardContent>
    </Card>
  );
}
