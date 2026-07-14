import { NextResponse, NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

// ── In-memory rate limiting for issue reports ───────────────────────────────
// Same pattern as the auth-actions / genre-votes limiters: per-key attempt
// timestamps, pruned on each check. Best-effort (per server instance).
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (rateLimitMap.get(key) ?? []).filter(ts => now - ts < windowMs);
  if (recent.length >= maxAttempts) {
    rateLimitMap.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(key, recent);
  return false;
}

// Neutralizes markdown that would misbehave once mirrored into a GitHub issue
// body: @mentions (would ping arbitrary users/teams) and image embeds (would
// allow tracking-pixel abuse). Only used for the GitHub mirror — the DB copy
// (and admin panel) keeps the original, unsanitized text.
function sanitizeForGithub(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, "[image removed]")
    .replace(/@(\w)/g, "@​$1");
}

export async function GET() {
  const issues = await db.issue.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      type: true,
      description: true,
      animeInfo: true,
      status: true,
      priority: true,
      githubUrl: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ issues });
}

const VALID_TYPES = [
  "Video not playing",
  "Missing episode",
  "Wrong subtitles",
  "Site bug",
  "Suggestion",
  "Other",
] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { type, description, animeInfo } = body;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid issue type" }, { status: 400 });
  }
  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (description.trim().length > 2000) {
    return NextResponse.json({ error: "Description too long (max 2000 chars)" }, { status: 400 });
  }

  // Require a logged-in user — anonymous submissions are not accepted
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  if (isRateLimited(user.id, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many reports — try again later." }, { status: 429 });
  }

  const issue = await db.issue.create({
    data: {
      type,
      description: description.trim(),
      animeInfo: animeInfo?.trim() || null,
      userId: user.id,
    },
  });

  // Mirror to GitHub Issues if env vars are configured; capture html_url to save back
  const ghRepo = process.env.GITHUB_ISSUES_REPO;
  const ghToken = process.env.GITHUB_PAT;
  if (ghRepo && ghToken) {
    try {
      const titleDesc = description.trim().slice(0, 60);
      const ghTitle = `[${type}] ${titleDesc}`;

      const bodyLines: string[] = [];
      bodyLines.push(`## Description\n\n${sanitizeForGithub(description.trim())}`);

      if (animeInfo?.trim()) {
        bodyLines.push(`## Anime / Episode\n\n${sanitizeForGithub(animeInfo.trim())}`);
      }

      const submitter = user.discordUsername
        ? `Discord: \`${user.discordUsername}\``
        : user.email
        ? `Email: \`${user.email}\``
        : `User ID: \`${user.id}\``;
      bodyLines.push(`## Submitted by\n\n${submitter}`);

      const ghRes = await fetch(`https://api.github.com/repos/${ghRepo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title: ghTitle, body: bodyLines.join("\n\n") }),
      });

      if (ghRes.ok) {
        const ghData = await ghRes.json();
        const githubUrl = ghData?.html_url as string | undefined;
        if (githubUrl) {
          await db.issue.update({ where: { id: issue.id }, data: { githubUrl } });
        }
      }
    } catch {
      // GitHub call is best-effort — DB save is the source of truth
    }
  }

  return NextResponse.json({ ok: true, id: issue.id });
}
