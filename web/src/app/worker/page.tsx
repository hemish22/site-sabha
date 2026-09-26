import { WorkerView } from "./WorkerView";

export const metadata = { title: "Site Sabha worker" };

export default async function WorkerPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  // Keyed so switching worker starts from a clean slate.
  return <WorkerView key={w ?? ""} name={w ?? null} />;
}
