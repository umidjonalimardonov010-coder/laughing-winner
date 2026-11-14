import { describe, expect, it } from "vitest";
import { checkFace, type FaceBox } from "./face-check";

// 960×1280 video (same 3:4 shape as the on-screen frame).
const VW = 960;
const VH = 1280;
const eyes = (cx: number, cy: number, noseShift = 0) => [
  { x: (cx - 80) / VW, y: cy / VH },
  { x: (cx + 80) / VW, y: cy / VH },
  { x: (cx + noseShift) / VW, y: (cy + 60) / VH },
];
function face(cx: number, cy: number, w: number, noseShift = 0): FaceBox {
  const h = w * 1.1;
  return { score: 0.95, x: cx - w / 2, y: cy - h / 2, w, h, keypoints: eyes(cx, cy - h * 0.15, noseShift) };
}

describe("selfie auto-shot", () => {
  it("takes the photo when one full face is centred in the oval", () => {
    expect(checkFace([face(480, 576, 450)], VW, VH)).toBe("ok");
  });
  it("waits when no face is seen", () => {
    expect(checkFace([], VW, VH)).toBe("none");
  });
  it("refuses when two people are in the frame", () => {
    expect(checkFace([face(300, 576, 400), face(700, 576, 400)], VW, VH)).toBe("many");
  });
  it("asks to come closer when the face is small", () => {
    expect(checkFace([face(480, 576, 160)], VW, VH)).toBe("closer");
  });
  it("asks to centre when the face is cut off at the edge", () => {
    expect(checkFace([face(120, 576, 400)], VW, VH)).toBe("center");
  });
  it("asks to look straight when the head is turned", () => {
    expect(checkFace([face(480, 576, 450, 75)], VW, VH)).toBe("straight");
  });
});
