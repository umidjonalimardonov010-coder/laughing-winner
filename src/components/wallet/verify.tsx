// Phone gate (first wallet open) and the withdrawal selfie step (front camera).
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Lock, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadToSignedUrl } from "@/lib/upload";
import { walletSelfieUploadUrl } from "@/lib/wallet.functions";
import phoneArt from "@/assets/phone-verify.webp";
import faceArt from "@/assets/face-scan.webp";
import { checkFace, HOLD_MS, OVAL, type FaceVerdict } from "@/lib/face-check";
import type { TKey } from "@/lib/i18n";
import { errorText, useWallet } from "./context";
import { PrimaryButton } from "./ui";

export function PhoneGate() {
  const { t, refresh, requestContact, openLink, boot, haptic } = useWallet();
  const [waiting, setWaiting] = useState(false);

  // After sharing, the bot saves the number a moment later: re-check until it shows up.
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      void refresh();
      if (n >= 20) {
        clearInterval(id);
        setWaiting(false);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [waiting, refresh]);

  const botLink = boot.settings.bot_username ? `https://t.me/${boot.settings.bot_username.replace(/^@/, "")}` : null;

  const share = async () => {
    haptic();
    if (!requestContact) {
      if (botLink) openLink(botLink);
      return;
    }
    const ok = await requestContact();
    if (ok) {
      haptic("success");
      setWaiting(true);
      void refresh();
    } else {
      haptic("error");
      toast.error(t("phoneDeclined"));
    }
  };

  const points = [
    { icon: <Lock className="size-5" />, text: t("phonePoint1") },
    { icon: <ShieldCheck className="size-5" />, text: t("phonePoint2") },
    { icon: <Smartphone className="size-5" />, text: t("phonePoint3") },
  ];

  return (
    <div className="animate-rise mx-auto flex min-h-full max-w-md flex-col px-5 pb-10 pt-6">
      <div className="relative mx-auto aspect-square w-64">
        <div className="verify-halo animate-glow" />
        <div className="verify-ring" />
        <div className="verify-ring verify-ring-2" />
        <div className="verify-ring verify-ring-3" />
        <img src={phoneArt} alt="" width={560} height={560} className="animate-float relative size-full object-contain drop-shadow-2xl" />
      </div>
      <h1 className="mt-2 text-center font-display text-3xl font-black italic tracking-tight">{t("phoneTitle")}</h1>
      <p className="mt-2 text-center text-muted-foreground">{t("phoneSub")}</p>
      <ul className="mt-6 space-y-2">
        {points.map((p, i) => (
          <li
            key={i}
            className="glass animate-rise flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ animationDelay: `${120 + i * 90}ms` }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">{p.icon}</span>
            <span className="text-sm">{p.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-3 pt-8">
        <PrimaryButton onClick={share} disabled={waiting}>
          {waiting ? (
            <>
              <Loader2 className="size-5 animate-spin" /> {t("phoneWaiting")}
            </>
          ) : (
            <>
              <Smartphone className="size-5" /> {t("phoneBtn")}
            </>
          )}
        </PrimaryButton>
        {botLink && (
          <button onClick={() => openLink(botLink)} className="btn-ghost-pro h-12 w-full rounded-2xl font-semibold">
            {t("phoneInBot")}
          </button>
        )}
      </div>
    </div>
  );
}

type Phase = "idle" | "camera" | "uploading" | "done";
type Guide = FaceVerdict | "loading" | "manual" | "hold";

const GUIDE_TEXT: Record<Guide, TKey> = {
  loading: "faceLoading",
  manual: "faceManual",
  hold: "faceHold",
  ok: "faceHold",
  none: "faceNone",
  many: "faceMany",
  center: "faceCenter",
  closer: "faceCloser",
  farther: "faceFarther",
  straight: "faceStraight",
};

const MP_VERSION = "0.10.21";
type Detector = {
  detectForVideo: (
    v: HTMLVideoElement,
    ts: number,
  ) => {
    detections: {
      categories?: { score: number }[];
      boundingBox?: { originX: number; originY: number; width: number; height: number };
      keypoints?: { x: number; y: number }[];
    }[];
  };
};
let detectorPromise: Promise<Detector> | null = null;
/** Face detector, loaded only when the camera opens (≈2.8 MB once, then cached by the phone). */
function loadFaceDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);
    return (await FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite", delegate: "CPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.6,
    })) as unknown as Detector;
  })().catch((e) => {
    detectorPromise = null;
    throw e;
  });
  return detectorPromise;
}

/** Compressed JPEG of the current camera frame or a picked photo (max 1080px side). */
async function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, 1080 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("capture_failed"))), "image/jpeg", 0.85),
  );
}

export function SelfieStep({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
}) {
  const { t, initData, haptic } = useWallet();
  const [phase, setPhase] = useState<Phase>(value ? "done" : "idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [guide, setGuide] = useState<Guide>("loading");
  const [progress, setProgress] = useState(0);
  const shotRef = useRef(false);
  const shootRef = useRef<() => void>(() => undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);
  // The live preview gets the stream once the camera view is on screen.
  useEffect(() => {
    const v = videoRef.current;
    if (phase !== "camera" || !v || !streamRef.current) return;
    v.srcObject = streamRef.current;
    void v.play().catch(() => undefined);
  }, [phase]);
  // Watches the camera a few times a second; a full, straight, centred face held still → photo by itself.
  useEffect(() => {
    if (phase !== "camera") return;
    let alive = true;
    let raf = 0;
    let last = 0;
    let okSince = 0;
    let shown: Guide = "loading";
    let shownP = 0;
    const show = (g: Guide, p: number) => {
      if (g !== shown) setGuide((shown = g));
      if (Math.abs(p - shownP) > 0.04 || (p === 0) !== (shownP === 0)) setProgress((shownP = p));
    };
    setGuide("loading");
    setProgress(0);
    const watchdog = setTimeout(() => alive && shown === "loading" && show("manual", 0), 12_000);
    loadFaceDetector()
      .then((det) => {
        if (!alive) return;
        const loop = (now: number) => {
          if (!alive) return;
          raf = requestAnimationFrame(loop);
          const v = videoRef.current;
          if (!v || v.readyState < 2 || !v.videoWidth || now - last < 110 || shotRef.current) return;
          last = now;
          let found;
          try {
            found = det.detectForVideo(v, now).detections;
          } catch {
            return;
          }
          const verdict = checkFace(
            found.map((d) => ({
              score: d.categories?.[0]?.score ?? 0,
              x: d.boundingBox?.originX ?? 0,
              y: d.boundingBox?.originY ?? 0,
              w: d.boundingBox?.width ?? 0,
              h: d.boundingBox?.height ?? 0,
              keypoints: d.keypoints ?? [],
            })),
            v.videoWidth,
            v.videoHeight,
          );
          if (verdict !== "ok") {
            okSince = 0;
            return show(verdict, 0);
          }
          if (!okSince) {
            okSince = now;
            haptic();
          }
          const p = Math.min(1, (now - okSince) / HOLD_MS);
          show("hold", p);
          if (p >= 1) shootRef.current();
        };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => alive && show("manual", 0));
    return () => {
      alive = false;
      clearTimeout(watchdog);
      cancelAnimationFrame(raf);
    };
  }, [phase, haptic]);
  useEffect(() => {
    if (!value) {
      setPhase((p) => (p === "done" ? "idle" : p));
      setPreview(null);
    }
  }, [value]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const upload = async (blob: Blob) => {
    setPhase("uploading");
    setPreview(URL.createObjectURL(blob));
    try {
      const { path, signedUrl } = await walletSelfieUploadUrl({ data: { initData } });
      await uploadToSignedUrl(signedUrl, new File([blob], "selfie.jpg", { type: "image/jpeg" }));
      onChange(path);
      setPhase("done");
      haptic("success");
    } catch (e) {
      haptic("error");
      toast.error(errorText(t, e));
      setPreview(null);
      setPhase("idle");
    }
  };

  const open = async () => {
    haptic();
    onChange(null);
    if (!navigator.mediaDevices?.getUserMedia) return fileRef.current?.click();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      shotRef.current = false;
      setPhase("camera");
    } catch {
      // No live camera inside this Telegram version: the phone's own front camera opens instead.
      fileRef.current?.click();
    }
  };

  const shoot = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || shotRef.current) return;
    shotRef.current = true;
    haptic();
    setFlash((f) => f + 1);
    const blob = await toJpeg(v, v.videoWidth, v.videoHeight);
    stop();
    await upload(blob);
  };

  shootRef.current = () => void shoot();

  const picked = async (file: File) => {
    try {
      const bmp = await createImageBitmap(file);
      await upload(await toJpeg(bmp, bmp.width, bmp.height));
    } catch {
      toast.error(t("selfieNoCamera"));
    }
  };

  const cancel = () => {
    stop();
    setPhase("idle");
  };

  return (
    <div className={cn("rounded-3xl border border-border bg-card/60 p-4", disabled && "pointer-events-none opacity-50")}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void picked(f);
        }}
      />
      <div className="mb-3 flex items-center gap-3">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
            phase === "done" ? "animate-pop bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          {phase === "done" ? <Check className="size-4" /> : 3}
        </span>
        <span className="flex-1 font-semibold">{t("selfieTitle")}</span>
      </div>

      {phase === "idle" && (
        <div className="flex items-center gap-4">
          <img src={faceArt} alt="" width={96} height={96} loading="lazy" className="animate-float size-24 shrink-0 object-contain" />
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm text-muted-foreground">{t("selfieSub")}</p>
            <button onClick={open} className="btn-gold flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-bold">
              <Camera className="size-5" /> {t("selfieOpen")}
            </button>
          </div>
        </div>
      )}

      {phase === "camera" && (
        <div className="space-y-4">
          <div className="selfie-frame mx-auto aspect-[3/4] w-full max-w-72">
            <video ref={videoRef} playsInline muted autoPlay className="size-full -scale-x-100 object-cover" />
            <div className="selfie-vignette" />
            <div className={cn("selfie-oval", guide === "hold" ? "selfie-oval--ok" : guide !== "loading" && guide !== "manual" && "selfie-oval--warn")} />
            <svg className="selfie-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <path
                d={`M ${OVAL.cx * 100} ${(OVAL.cy - OVAL.ry) * 100} A ${OVAL.rx * 100} ${OVAL.ry * 100} 0 1 1 ${OVAL.cx * 100} ${(OVAL.cy + OVAL.ry) * 100} A ${OVAL.rx * 100} ${OVAL.ry * 100} 0 1 1 ${OVAL.cx * 100} ${(OVAL.cy - OVAL.ry) * 100}`}
                pathLength={100}
                strokeDasharray="100"
                strokeDashoffset={100 - progress * 100}
                style={{ opacity: progress > 0 ? 1 : 0 }}
              />
            </svg>
            {guide !== "hold" && <div className="selfie-scan-track" />}
            <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
              <span
                key={guide}
                className={cn(
                  "selfie-guide animate-pop flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                  guide === "hold" && "selfie-guide--ok",
                )}
              >
                {guide === "loading" && <Loader2 className="size-4 animate-spin" />}
                {guide === "hold" && <Check className="size-4" />}
                {t(GUIDE_TEXT[guide])}
              </span>
            </div>
            {flash > 0 && <div key={flash} className="selfie-flash" />}
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("faceAuto")}</p>
          <div className="flex items-center justify-center gap-8">
            <button onClick={cancel} aria-label={t("cancel")} className="btn-ghost-pro flex size-12 items-center justify-center rounded-full">
              <X className="size-5" />
            </button>
            <button onClick={shoot} aria-label={t("selfieShoot")} className="btn-shutter" />
            <span className="size-12" />
          </div>
        </div>
      )}

      {(phase === "uploading" || phase === "done") && (
        <div className="flex items-center gap-4">
          <div className="selfie-frame relative h-28 w-24 shrink-0">
            {preview ? (
              <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <img src={faceArt} alt="" className="size-full object-contain p-2" />
            )}
            {phase === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className={cn("font-semibold", phase === "done" && "text-primary")}>
              {phase === "uploading" ? t("selfieUploading") : `✓ ${t("selfieDone")}`}
            </div>
            <button
              onClick={open}
              disabled={phase === "uploading"}
              className="btn-ghost-pro flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
            >
              <RefreshCw className="size-4" /> {t("selfieRetake")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
