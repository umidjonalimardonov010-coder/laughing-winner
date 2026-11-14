// Is the face fully and squarely inside the selfie oval? Pure geometry, so the auto-shot rule is testable.
// Boxes are in video pixels; keypoints are 0..1 of the video (MediaPipe face detector output).

export type FaceBox = {
  score: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** right eye, left eye, nose tip, mouth, right ear, left ear */
  keypoints: { x: number; y: number }[];
};
export type FaceVerdict = "ok" | "none" | "many" | "center" | "closer" | "farther" | "straight";

/** Oval drawn over the camera (fractions of the visible frame): centre and radii. */
export const OVAL = { cx: 0.5, cy: 0.45, rx: 0.36, ry: 0.41 };
/** How long the face must stay right before the photo is taken by itself. */
export const HOLD_MS = 900;

export function checkFace(faces: FaceBox[], vw: number, vh: number, frameAspect = 3 / 4): FaceVerdict {
  const sure = faces.filter((f) => f.score >= 0.6);
  if (!sure.length || !vw || !vh) return "none";
  if (sure.length > 1) return "many";
  const f = sure[0]!;
  // The preview is object-cover: only the middle part of the video is on screen.
  const videoAspect = vw / vh;
  const visW = videoAspect > frameAspect ? vh * frameAspect : vw;
  const visH = videoAspect > frameAspect ? vh : vw / frameAspect;
  const ox = (vw - visW) / 2;
  const oy = (vh - visH) / 2;
  const left = (f.x - ox) / visW;
  const top = (f.y - oy) / visH;
  const w = f.w / visW;
  const h = f.h / visH;
  const cx = left + w / 2;
  const cy = top + h / 2;

  // Any part of the face off the screen → not a full face.
  if (left < 0.02 || top < 0.02 || left + w > 0.98 || top + h > 0.98) return w > 0.8 ? "farther" : "center";
  if (w < 0.22) return "closer";
  if (w > 0.75) return "farther";
  if (Math.abs(cx - OVAL.cx) > 0.12 || Math.abs(cy - OVAL.cy) > 0.13) return "center";

  // Looking straight: the nose sits between the eyes, not next to one of them.
  const [re, le, nose] = f.keypoints;
  if (re && le && nose) {
    const a = Math.min(re.x, le.x);
    const b = Math.max(re.x, le.x);
    if (b - a <= 0) return "straight";
    const t = (nose.x - a) / (b - a);
    if (t < 0.28 || t > 0.72) return "straight";
  }
  return "ok";
}
