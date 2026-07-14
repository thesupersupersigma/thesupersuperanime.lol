import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendChangelogPost } from "@/lib/discord";

export const dynamic = "force-dynamic";

interface GitHubCommit {
  id: string;
  message: string;
  url: string;
  author: { name: string };
  timestamp: string;
}

interface GitHubPushPayload {
  ref: string;
  commits: GitHubCommit[];
}

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(signatureHeader.slice("sha256=".length), "hex");

  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret || !verifySignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const deliveryId = req.headers.get("x-github-delivery");
  if (!deliveryId) {
    return NextResponse.json({ error: "Missing delivery id" }, { status: 400 });
  }

  // Replay protection: a captured valid signed payload could otherwise be
  // resubmitted indefinitely, re-creating changelog entries and re-posting to
  // Discord each time. The unique constraint on deliveryId is the guard —
  // a duplicate delivery throws P2002 and we short-circuit before processing.
  try {
    await db.webhookDelivery.create({ data: { deliveryId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw e;
  }

  let payload: GitHubPushPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const event = req.headers.get("x-github-event");

  if (event === "ping") {
    return NextResponse.json({ ok: true });
  }

  if (event !== "push") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (payload.ref !== "refs/heads/master") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const commits = payload.commits ?? [];
  console.log(`[github-webhook] received push with ${commits.length} commits`);

  for (const commit of commits) {
    const version = commit.id.slice(0, 7);
    const title = commit.message.split("\n")[0];
    const body = `Committed by ${commit.author.name}\n\n${commit.url}`;

    const entry = await db.changelog.create({
      data: {
        version,
        title,
        body,
        major: false,
        publishedAt: new Date(commit.timestamp),
      },
    });

    void sendChangelogPost(
      entry.version,
      entry.title,
      entry.body,
      entry.major,
      "https://www.thesupersuperanime.lol/updates"
    ).catch((err) => console.error("[github-webhook] sendChangelogPost error:", err));
  }

  return NextResponse.json({ ok: true, created: commits.length });
}
