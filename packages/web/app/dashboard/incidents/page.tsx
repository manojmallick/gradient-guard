import IncidentFeed from "@/components/IncidentFeed";
import Link from "next/link";

export const metadata = { title: "Incidents — GradientGuard" };

export default function IncidentsPage() {
  return (
    <div className="min-h-screen p-6 space-y-6">
      <header className="flex items-center gap-4">
        <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-bold text-white">Incident Timeline</h1>
      </header>
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6">
        <IncidentFeed maxItems={100} />
      </div>
    </div>
  );
}
