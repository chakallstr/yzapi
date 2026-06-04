import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/yapayzekalab/tab-models.jsx", "utf8");
// i18n: UI copy moved to the models dictionary fragment.
const modelsStrings = readFileSync("src/yapayzekalab/i18n/strings/models.js", "utf8");

describe("models tab live pricing contract", () => {
  it("loads live model pricing from the public catalog endpoint", () => {
    expect(source).toContain("fetch('/api/models')");
    expect(source).toContain("mapApiModel");
    expect(source).toContain("model.computed?.input?.usd");
    expect(source).toContain("model.computed?.output?.usd");
  });

  it("falls back to the bundled catalog if live fetch fails", () => {
    expect(source).toContain("liveModels.length ? liveModels : MODELS");
  });

  it("sorts prices from highest to lowest and supports model search", () => {
    expect(source).toContain("const [search, setSearch] = useState('')");
    // search wiring intact (i18n key) + the placeholder string still ships in the dict
    expect(source).toContain("models.search_placeholder");
    expect(modelsStrings).toContain("Model ara");
    expect(source).toContain(".sort((a, b) => {");
    expect(source).toContain("const priceDelta = (b.input ?? 0) - (a.input ?? 0);");
    expect(source).toContain(".includes(needle)");
  });
});
