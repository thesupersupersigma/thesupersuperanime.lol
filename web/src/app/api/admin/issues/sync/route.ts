import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

interface GitHubIssue {
  html_url: string;
  state: "open" | "closed";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ghRepo = process.env.GITHUB_ISSUES_REPO;
  const ghToken = process.env.GITHUB_PAT;

  if (!ghRepo || !ghToken) {
    return NextResponse.json({ error: "GitHub env vars not configured" }, { status: 500 });
  }

  // Paginate through all GitHub issues (open + closed)
  const ghIssues: GitHubIssue[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${ghRepo}/issues?state=all&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        // Don't cache — we want fresh data every sync
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `GitHub API error: ${res.status}` }, { status: 502 });
    }

    const batch: GitHubIssue[] = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    ghIssues.push(...batch);
    if (batch.length < 100) break;
    page++;
  }

  // Build map: html_url → GitHub state
  const ghMap = new Map(ghIssues.map(i => [i.html_url, i.state]));

  // Fetch all local issues that have a githubUrl and are not already terminal
  const dbIssues = await db.issue.findMany({
    where: {
      githubUrl: { not: null },
      // Only bother updating issues that aren't already closed on our side
      status: { notIn: ["fixed", "wont_fix", "duplicate"] },
    },
    select: { id: true, githubUrl: true, status: true },
  });

  let synced = 0;
  for (const issue of dbIssues) {
    if (!issue.githubUrl) continue;
    const ghState = ghMap.get(issue.githubUrl);
    if (ghState === "closed") {
      await db.issue.update({
        where: { id: issue.id },
        data: { status: "fixed" },
      });
      synced++;
    }
  }

  return NextResponse.json({ ok: true, synced, checked: dbIssues.length, total: ghIssues.length });
}
