export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-500">
        <p className="font-medium text-neutral-700">Fonctionnalité à venir dans une prochaine étape.</p>
        <p className="mt-2">{description}</p>
      </div>
    </div>
  );
}
