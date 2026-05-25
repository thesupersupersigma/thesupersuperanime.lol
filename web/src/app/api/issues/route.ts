import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

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

  // Attach to logged-in user if one exists — anonymous submissions are fine too
  const user = await getCurrentUser();

  const issue = await db.issue.create({
    data: {
      type,
      description: description.trim(),
      animeInfo: animeInfo?.trim() || null,
      userId: user?.id ?? null,
    },
  });

  // Mirror to GitHub Issues if env vars are configured
  const ghRepo = process.env.GITHUB_ISSUES_REPO;
  const ghToken = process.env.GITHUB_PAT;
  if (ghRepo && ghToken) {
    try {
      const titleDesc = description.trim().slice(0, 60);
      const ghTitle = `[${type}] ${titleDesc}`;

      const bodyLines: string[] = [];
      bodyLines.push(`## Description\n\n${description.trim()}`);

      if (animeInfo?.trim()) {
        bodyLines.push(`## Anime / Episode\n\n${animeInfo.trim()}`);
      }

      const submitter = user?.discordUsername
        ? `Discord: \`${user.discordUsername}\``
        : user?.email
        ? `Email: \`${user.email}\``
        : "Anonymous";
      bodyLines.push(`## Submitted by\n\n${submitter}`);

      await fetch(`https://api.github.com/repos/${ghRepo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title: ghTitle, body: bodyLines.join("\n\n") }),
      });
    } catch {
      // GitHub call is best-effort — DB save is the source of truth
    }
  }

  return NextResponse.json({ ok: true, id: issue.id });
}
