import { describe, expect, it } from "vitest";
import { classifySendError, draftProblem, progressPercent, toTelegramHtml, visibleLength } from "./broadcast-rules";

describe("broadcast rules", () => {
  it("keeps allowed formatting and escapes everything else", () => {
    expect(toTelegramHtml("<b>Salom</b> 5 < 6 & <script>x</script>")).toBe("<b>Salom</b> 5 &lt; 6 &amp; &lt;script&gt;x&lt;/script&gt;");
  });
  it("closes unclosed tags and drops stray closing tags", () => {
    expect(toTelegramHtml("<b>bonus <i>bor</b> end</u>")).toBe("<b>bonus <i>bor</i></b> end");
  });
  it("keeps https links and turns unsafe links into text", () => {
    expect(toTelegramHtml('<a href="https://t.me/x">kanal</a>')).toBe('<a href="https://t.me/x">kanal</a>');
    expect(toTelegramHtml('<a href="javascript:alert(1)">x</a>')).toBe('&lt;a href="javascript:alert(1)"&gt;x');
  });
  it("counts only visible characters", () => {
    expect(visibleLength("<b>abc</b> &amp;")).toBe(5);
  });
  it("text message limit is 4096, caption limit is 1024", () => {
    const long = "a".repeat(1025);
    expect(draftProblem({ text: long, mediaType: null, buttonText: "", buttonUrl: "" })).toBeNull();
    expect(draftProblem({ text: long, mediaType: "photo", buttonText: "", buttonUrl: "" })).toContain("1025 / 1024");
    expect(draftProblem({ text: "a".repeat(4097), mediaType: null, buttonText: "", buttonUrl: "" })).toContain("4097 / 4096");
  });
  it("empty message without media cannot be sent; photo alone can", () => {
    expect(draftProblem({ text: " ", mediaType: null, buttonText: "", buttonUrl: "" })).not.toBeNull();
    expect(draftProblem({ text: "", mediaType: "photo", buttonText: "", buttonUrl: "" })).toBeNull();
  });
  it("a button needs a name and an https link", () => {
    expect(draftProblem({ text: "x", mediaType: null, buttonText: "Kanal", buttonUrl: "t.me/x" })).not.toBeNull();
    expect(draftProblem({ text: "x", mediaType: null, buttonText: "", buttonUrl: "https://t.me/x" })).not.toBeNull();
    expect(draftProblem({ text: "x", mediaType: null, buttonText: "Kanal", buttonUrl: "https://t.me/x" })).toBeNull();
  });
  it("blocked bot counts as blocked, 429 waits the given seconds", () => {
    expect(classifySendError(403, "Forbidden: bot was blocked by the user").outcome).toBe("blocked");
    expect(classifySendError(429, "Too Many Requests: retry after 7")).toEqual({ outcome: "retry", waitSec: 7 });
    expect(classifySendError(400, "Bad Request: message is too long").outcome).toBe("failed");
  });
  it("progress percent", () => {
    expect(progressPercent(200, 50)).toBe(25);
    expect(progressPercent(0, 0)).toBe(100);
  });
});
