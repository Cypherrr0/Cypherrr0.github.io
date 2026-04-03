export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-zinc-950 px-6 py-16 text-zinc-100 sm:px-10">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl shadow-black/30 backdrop-blur sm:p-14">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
          Personal Website
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Yunzhong Zhang
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
          This site is being prepared for launch on GitHub Pages. A fuller
          personal homepage will be added here once the content is ready.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 text-sm text-zinc-300">
          <span className="rounded-full border border-white/10 px-4 py-2">
            Next.js 16
          </span>
          <span className="rounded-full border border-white/10 px-4 py-2">
            Static Export
          </span>
          <span className="rounded-full border border-white/10 px-4 py-2">
            GitHub Pages Ready
          </span>
        </div>
      </section>
    </main>
  );
}
