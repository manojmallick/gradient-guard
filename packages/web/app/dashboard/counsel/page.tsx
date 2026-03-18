import CounselChat from "@/components/CounselChat";
import Link from "next/link";

export const metadata = { title: "Compliance Counsel — GradientGuard" };

export default function CounselPage() {
  return (
    <div className="min-h-screen p-6 space-y-6">
      <header className="flex items-center gap-4">
        <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-bold text-white">Compliance Counsel</h1>
        <span className="text-slate-400 text-sm">
          Ask anything about DORA, NIS2, GDPR, or MAS TRM
        </span>
      </header>
      <CounselChat />
    </div>
  );
}
