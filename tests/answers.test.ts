import { describe, expect, it } from "vitest";
import { checkMeaning, checkReading, readingForms } from "../src/answers";

describe("typed answers", () => {
  it("accepts meanings with small typos, articles and brackets", () => {
    expect(checkMeaning("Word", ["word", "speech"])).toBe("right");
    expect(checkMeaning("speach", ["word", "speech"])).toBe("close");
    expect(checkMeaning("to live", ["live"])).toBe("right");
    expect(checkMeaning("just like", ["just (like)"])).toBe("right");
    expect(checkMeaning("just", ["just (like)"])).toBe("right");
    expect(checkMeaning("sun", ["day", "sun"])).toBe("right");
    expect(checkMeaning("son", ["day", "sun"])).toBe("wrong"); // too short to forgive
    expect(checkMeaning("moon", ["day", "sun"])).toBe("wrong");
  });

  it("asks again when the meaning was typed in Japanese", () => {
    expect(checkMeaning("ご", ["word"])).toBe("retry");
    expect(checkMeaning("  ", ["word"])).toBe("retry");
  });

  it("matches readings in either kana, with or without okurigana", () => {
    expect(readingForms("い.きる")).toEqual(["いきる", "い"]);
    expect(readingForms("ゴ")).toEqual(["ご"]);
    expect(readingForms("-ばい")).toEqual(["ばい"]);
    const forms = ["ゴ", "かた.る"].flatMap(readingForms);
    expect(checkReading("ご", forms)).toBe("right");
    expect(checkReading("ゴ", forms)).toBe("right");
    expect(checkReading("かたる", forms)).toBe("right");
    expect(checkReading("gen", ["げん"])).toBe("right");
    expect(checkReading("か", forms)).toBe("wrong");
    expect(checkReading("word", forms)).toBe("retry");
  });
});
