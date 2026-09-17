"use client";

/** CSS 3D media stage — represents hosted image/video frames without WebGL cost */
export default function Hero3D() {
  return (
    <div className="mh-stage mx-auto mt-10 max-w-lg" aria-hidden>
      <div className="mh-stage-inner">
        <div className="mh-ring" />
        <div className="mh-card3d mh-c1">
          <div className="ph h-full w-full bg-gradient-to-br from-blue-100 to-blue-50">IMG</div>
        </div>
        <div className="mh-card3d mh-c2">
          <div className="flex h-full flex-col">
            <div className="flex h-5 items-center gap-1 bg-slate-800/90 px-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="ml-1 text-[9px] text-slate-300">video.mp4</span>
            </div>
            <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-indigo-100 to-slate-100 text-indigo-500">▶</div>
          </div>
        </div>
        <div className="mh-card3d mh-c3">
          <div className="ph h-full w-full bg-gradient-to-br from-fuchsia-100 to-pink-50">HTML</div>
        </div>
      </div>
    </div>
  );
}
