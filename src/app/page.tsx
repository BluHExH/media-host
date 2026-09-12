import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-[11px] font-semibold tracking-tight">MH</div>
            <span className="text-sm font-medium tracking-tight">Media Host</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/gallery" className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-100">Gallery</Link>
            <Link href="/login" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800">Sign in</Link>
            <Link href="/login?tab=register" className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-white">Get started</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Personal media CDN</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl sm:leading-[1.1]">
          Host images, video, and audio.
          <span className="block text-zinc-500">Get permanent links.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400">
          Upload once, share anywhere. Private library with albums, public gallery, account security, and direct CDN URLs for every file.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/login?tab=register" className="inline-flex h-10 items-center rounded-md bg-zinc-100 px-5 text-sm font-medium text-zinc-900 transition hover:bg-white">Create account</Link>
          <Link href="/library" className="inline-flex h-10 items-center rounded-md border border-zinc-700 bg-transparent px-5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100">Open library</Link>
        </div>
        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-medium text-zinc-100">Any media type</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">Images, MP4, audio, and HTML files with correct MIME handling.</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-medium text-zinc-100">Permanent URLs</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">Copy a public link instantly. Works in projects, embeds, and docs.</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-medium text-zinc-100">Secure accounts</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">Hashed passwords, session tokens, and login IP audit logs.</p>
          </div>
        </div>
      </main>
      <footer className="border-t border-zinc-900 py-8 text-center text-xs text-zinc-600">Media Host</footer>
    </div>
  );
}
