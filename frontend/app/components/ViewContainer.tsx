export default function ViewContainer({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</div>;
}
