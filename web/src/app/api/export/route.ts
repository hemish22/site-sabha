import { auditCsv, listAcks } from "@/lib/store";

export async function GET(req: Request) {
  const bid = new URL(req.url).searchParams.get("bid");
  if (!bid) return new Response("Missing bid", { status: 400 });
  const csv = auditCsv(bid, await listAcks(bid));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="site_sabha_audit_${bid}.csv"`,
    },
  });
}
