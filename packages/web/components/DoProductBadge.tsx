const PRODUCTS = [
  { name: "Gradient AI Agents", detail: "ADK — 4 agents deployed" },
  { name: "Serverless Inference", detail: "llama3.3-70b + claude-sonnet" },
  { name: "Knowledge Bases", detail: "DORA + NIS2 + GDPR + MAS TRM" },
  { name: "Agent Evaluate", detail: "Automated eval datasets" },
  { name: "App Platform", detail: "Web + API + cron worker" },
  { name: "Managed PostgreSQL", detail: "Incidents + audit log" },
  { name: "Spaces", detail: "PDF evidence storage + CDN" },
  { name: "ADK Traces", detail: "@trace on every LangGraph node" },
];

export default function DoProductBadge() {
  return (
    <div className="flex flex-wrap gap-2">
      {PRODUCTS.map((p) => (
        <div
          key={p.name}
          title={p.detail}
          className="bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-xs text-slate-300 hover:border-blue-500 hover:text-white transition-colors cursor-default"
        >
          <span className="font-semibold text-blue-400">DO</span>{" "}
          {p.name}
        </div>
      ))}
    </div>
  );
}
