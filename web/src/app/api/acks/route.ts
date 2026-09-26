import { ROSTER } from "@/lib/config";
import { addAck, listAcks, statusGrid } from "@/lib/store";

export async function GET(req: Request) {
  const bid = new URL(req.url).searchParams.get("bid");
  if (!bid) return Response.json({ error: "Missing bid" }, { status: 400 });
  const acks = await listAcks(bid);
  return Response.json({ grid: statusGrid(acks) });
}

/** Record "heard" (worker played the briefing) or "rebrief" (supervisor asks for another round). */
export async function POST(req: Request) {
  const { worker: name, briefingId, event } = await req.json();
  const worker = ROSTER.find((w) => w.name === name);
  if (!worker || !briefingId || !["heard", "rebrief"].includes(event)) {
    return Response.json({ error: "Need a roster worker, briefingId and event heard|rebrief" }, { status: 400 });
  }
  return Response.json(await addAck({ worker: worker.name, language: worker.language, briefingId, event }));
}
