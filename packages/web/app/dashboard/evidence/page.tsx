import EvidencePanel from "../../../components/EvidencePanel";
import Link from "next/link";

export const metadata = { title: "Evidence — GradientGuard" };

export default function EvidencePage() {
  return (
    <div className="min-h-screen p-6 space-y-6">
      <header className="flex items-center gap-4">
        <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-bold text-white">Evidence Packages</h1>
      </header>
      <EvidencePanel />
    </div>
  );
}
