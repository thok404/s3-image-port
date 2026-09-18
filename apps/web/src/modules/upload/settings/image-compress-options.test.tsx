import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@/../test/utils/render-with-providers";
import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import ImageCompressOptions from "./ImageCompressOptions";
import type { CompressOption } from "@/lib/utils/imageCompress";

const user = userEvent.setup();

/**
 * The settings panel and every file row render this component, so two copies
 * can be mounted at once. They must stay independent: a `<label for>` resolves
 * against the first matching id in the document.
 */
function TwoSections() {
  const [panelOption, setPanelOption] = useState<CompressOption | null>(null);
  const [rowOption, setRowOption] = useState<CompressOption | null>(null);
  return (
    <>
      <div data-testid="panel">
        <ImageCompressOptions value={panelOption} onChange={setPanelOption} />
      </div>
      <div data-testid="row">
        <ImageCompressOptions value={rowOption} onChange={setRowOption} />
      </div>
    </>
  );
}

const panel = () => within(screen.getByTestId("panel"));
const row = () => within(screen.getByTestId("row"));

describe("image compress options", () => {
  it("gives every instance its own control ids", () => {
    render(<TwoSections />);

    const labels = screen
      .getAllByText("Image convertion and compression")
      .map((element) => element.closest("label"))
      .filter((element): element is HTMLLabelElement => element !== null);

    expect(labels.length).toBe(2);
    const targets = labels.map((label) => label.getAttribute("for"));
    expect(targets.every(Boolean)).toBe(true);
    // distinct ids, each pointing at exactly one element
    expect(new Set(targets).size).toBe(2);
    for (const target of targets) {
      expect(document.querySelectorAll(`[id="${target}"]`).length).toBe(1);
    }
  });

  it("toggles only its own switch when the label is clicked", async () => {
    render(<TwoSections />);

    await user.click(row().getByText("Image convertion and compression"));

    expect(row().getByRole("switch")).toBeChecked();
    expect(panel().getByRole("switch")).not.toBeChecked();
  });

  it("keeps the two sections' formats apart", async () => {
    render(<TwoSections />);

    await user.click(panel().getByRole("switch"));
    await user.click(row().getByRole("switch"));

    await user.click(panel().getAllByRole("combobox")[0]);
    await user.click(screen.getByRole("option", { name: "WebP" }));

    expect(panel().getByRole("combobox")).toHaveTextContent(/WEBP/i);
    expect(row().getByRole("combobox")).toHaveTextContent(/JPEG/i);
  });
});
