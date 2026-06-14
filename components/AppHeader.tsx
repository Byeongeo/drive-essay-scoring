import Link from "next/link";

export default function AppHeader({
  title,
  backHref,
  backLabel = "뒤로",
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-brand-700">Drive Essay Scoring</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
      </div>
      {backHref && (
        <Link
          href={backHref}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          {backLabel}
        </Link>
      )}
    </header>
  );
}
