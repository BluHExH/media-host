"use client";

/** Self-contained 3D stage — styles inlined so deploy/CSS purge cannot strip animation */
export default function Hero3D() {
  return (
    <>
      <style>{`
        @keyframes mh-float-a {
          0%, 100% { transform: translateY(0) rotateX(12deg) rotateY(-18deg); }
          50% { transform: translateY(-14px) rotateX(14deg) rotateY(-12deg); }
        }
        @keyframes mh-float-b {
          0%, 100% { transform: translateY(0) rotateX(8deg) rotateY(20deg); }
          50% { transform: translateY(-18px) rotateX(10deg) rotateY(16deg); }
        }
        @keyframes mh-float-c {
          0%, 100% { transform: translateY(4px) rotateX(14deg) rotateY(-8deg); }
          50% { transform: translateY(-12px) rotateX(12deg) rotateY(-14deg); }
        }
        @keyframes mh-ring-spin {
          from { transform: translate(-50%, -50%) rotateX(60deg) rotateZ(0deg); }
          to { transform: translate(-50%, -50%) rotateX(60deg) rotateZ(360deg); }
        }
        .mh3d-stage {
          perspective: 1000px;
          perspective-origin: 50% 40%;
          margin: 2rem auto 1rem;
          max-width: 28rem;
        }
        .mh3d-inner {
          position: relative;
          height: 230px;
          transform-style: preserve-3d;
        }
        .mh3d-ring {
          position: absolute;
          left: 50%;
          top: 58%;
          width: 190px;
          height: 190px;
          border: 2px dashed rgba(59, 172, 182, 0.45);
          border-radius: 50%;
          pointer-events: none;
          animation: mh-ring-spin 22s linear infinite;
        }
        .mh3d-card {
          position: absolute;
          border-radius: 1rem;
          border: 1px solid rgba(255,255,255,0.85);
          box-shadow: 0 18px 40px rgba(15, 76, 129, 0.16), inset 0 1px 0 rgba(255,255,255,0.9);
          overflow: hidden;
          transform-style: preserve-3d;
          backface-visibility: hidden;
        }
        .mh3d-c1 {
          width: 142px;
          height: 102px;
          left: 6%;
          top: 36px;
          background: linear-gradient(135deg, #c5e8ec, #e8f6f8);
          animation: mh-float-a 5.2s ease-in-out infinite;
        }
        .mh3d-c2 {
          width: 164px;
          height: 114px;
          left: 50%;
          top: 8px;
          margin-left: -82px;
          z-index: 2;
          background: linear-gradient(135deg, #b8d4e8, #f0f7fc);
          animation: mh-float-b 6.2s ease-in-out infinite;
        }
        .mh3d-c3 {
          width: 124px;
          height: 92px;
          right: 5%;
          top: 48px;
          background: linear-gradient(135deg, #d4f0ee, #f5fcfb);
          animation: mh-float-c 4.8s ease-in-out infinite;
        }
        .mh3d-label {
          display: flex;
          height: 100%;
          width: 100%;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #5a6f82;
        }
        @media (max-width: 640px) {
          .mh3d-stage { perspective: none; }
          .mh3d-inner {
            height: auto;
            display: flex;
            justify-content: center;
            gap: 0.65rem;
            padding: 0.5rem 0;
          }
          .mh3d-ring { display: none; }
          .mh3d-card {
            position: relative !important;
            left: auto !important;
            right: auto !important;
            top: auto !important;
            margin: 0 !important;
            width: 30% !important;
            max-width: 112px;
            height: 86px !important;
            animation: none !important;
            transform: none !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .mh3d-card, .mh3d-ring { animation: none !important; }
        }
      `}</style>

      <div className="mh3d-stage" aria-hidden>
        <div className="mh3d-inner">
          <div className="mh3d-ring" />
          <div className="mh3d-card mh3d-c1">
            <div className="mh3d-label">IMG</div>
          </div>
          <div className="mh3d-card mh3d-c2">
            <div className="flex h-full flex-col">
              <div className="flex h-5 items-center gap-1 bg-slate-800/90 px-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="ml-1 text-[9px] text-slate-300">video.mp4</span>
              </div>
              <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-indigo-100 to-slate-100 text-lg text-indigo-500">
                ▶
              </div>
            </div>
          </div>
          <div className="mh3d-card mh3d-c3">
            <div className="mh3d-label">HTML</div>
          </div>
        </div>
      </div>
    </>
  );
}
