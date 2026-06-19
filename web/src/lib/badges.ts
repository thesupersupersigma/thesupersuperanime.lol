import { db } from "@/lib/db";

/**
 * Central registry of every badge in the system.
 *
 * `BADGE_DEFINITIONS` is the source of truth for badge metadata; `seedBadges()`
 * upserts it into the `Badge` table. The auto-grant logic in `badge-engine.ts`
 * references badges by slug.
 */

export type BadgeRarity = "common" | "rare" | "epic" | "legendary";
export type BadgeGrantedBy = "auto" | "admin" | "owner";

export const RARITY_ORDER: Record<BadgeRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export interface BadgeDefinition {
  slug: string;
  name: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  rarityOrder: number;
  grantedBy: BadgeGrantedBy;
  stackable: boolean;
}

/**
 * Compact constructor — `rarityOrder` is always derived from `rarity` so the two
 * can never drift apart.
 */
function def(
  slug: string,
  name: string,
  description: string,
  icon: string,
  rarity: BadgeRarity = "common",
  grantedBy: BadgeGrantedBy = "auto",
  stackable = false,
): BadgeDefinition {
  return { slug, name, description, icon, rarity, rarityOrder: RARITY_ORDER[rarity], grantedBy, stackable };
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ─── Watch milestones ──────────────────────────────────────────────────────
  def("first-episode", "First Step", "Watched your first episode", "🎬"),
  def("episodes-10", "Getting Started", "Watched 10 episodes", "📺"),
  def("episodes-50", "Committed", "Watched 50 episodes", "🔥"),
  def("episodes-100", "Century Club", "Watched 100 episodes", "💯"),
  def("episodes-500", "Dedicated", "Watched 500 episodes", "⚡"),
  def("episodes-1000", "Legendary Viewer", "Watched 1000 episodes", "👑", "legendary"),
  def("watchtime-10h", "10 Hour Club", "Watched 10 hours of anime", "⏱️"),
  def("watchtime-50h", "50 Hour Club", "Watched 50 hours of anime", "⌛", "rare"),
  def("watchtime-100h", "100 Hour Club", "Watched 100 hours of anime", "🏆", "epic"),
  def("watchtime-500h", "500 Hour Club", "Watched 500 hours of anime", "💎", "legendary"),
  def("completed-1", "Finisher", "Completed your first anime", "✅"),
  def("completed-10", "Completionist", "Completed 10 anime", "🎯", "rare"),
  def("completed-50", "Master Completionist", "Completed 50 anime", "🌟", "epic"),

  // ─── Airing watcher ──────────────────────────────────────────────────────────
  def("airing-1", "OG Viewer", "Watched an anime while it was airing", "📡", "common"),
  def("airing-5", "Seasonal Watcher", "Watched 5 anime while airing", "🗓️", "rare"),
  def("airing-10", "Airing Addict", "Watched 10 anime while airing", "📻", "epic"),
  def("airing-25", "Simulcast Legend", "Watched 25 anime while airing", "🛸", "legendary"),

  // ─── Leaderboard ─────────────────────────────────────────────────────────────
  def("leaderboard-top10", "Top 10", "Reached the top 10 on the all-time leaderboard", "🏅", "rare"),
  def("leaderboard-top3", "Podium", "Reached the top 3 on the all-time leaderboard", "🎖️", "epic"),
  def("leaderboard-number1", "The Best", "Reached #1 on the all-time leaderboard", "👑", "legendary"),
  def("weekly-champion", "Weekly Champion", "Held #1 on the weekly leaderboard", "🥇", "epic", "auto", true),

  // ─── Community ─────────────────────────────────────────────────────────────
  def("first-comment", "First Words", "Posted your first comment", "💬", "common"),
  def("comments-10", "Conversationalist", "Posted 10 comments", "🗣️", "common"),
  def("comments-50", "Community Voice", "Posted 50 comments", "📢", "rare"),
  def("comment-likes-10", "Well Liked", "Received 10 likes on your comments", "❤️", "rare"),
  def("genre-voter", "Critic", "Voted on 10 or more genres", "🎭", "common"),
  def("verified", "Verified", "Linked your Discord account", "✔️", "common"),
  def("og-member", "OG", "One of the first members of thesupersuperanime", "⭐", "legendary"),
  def("referral", "Recruiter", "Referred a user who signed up", "🤝", "rare"),

  // ─── Streak ────────────────────────────────────────────────────────────────
  def("streak-7", "Week Warrior", "Watched anime 7 days in a row", "🔥", "rare"),
  def("streak-30", "Monthly Regular", "Watched anime 30 days in a row", "🌙", "epic"),
  def("streak-100", "Unstoppable", "Watched anime 100 days in a row", "⚡", "legendary"),

  // ─── Admin / special ─────────────────────────────────────────────────────────
  def("owner", "Owner", "The creator of thesupersuperanime", "👑", "legendary", "owner"),
  def("admin", "Admin", "Site administrator", "🛡️", "legendary", "owner"),
  def("contributor", "Contributor", "Helped build thesupersuperanime", "🎖️", "epic", "admin"),
  def("bug-hunter", "Bug Hunter", "Reported a bug that got fixed", "🐛", "rare", "admin"),
  def("artist", "Artist", "Community artist", "🎨", "rare", "admin"),
  def("supporter", "Supporter", "Supporter of thesupersuperanime", "💎", "epic", "admin"),
];

/**
 * Upsert every badge definition into the `Badge` table. Safe to run repeatedly —
 * existing rows are updated with the latest metadata, new rows are created.
 */
export async function seedBadges(): Promise<void> {
  for (const b of BADGE_DEFINITIONS) {
    await db.badge.upsert({
      where: { slug: b.slug },
      update: {
        name: b.name,
        description: b.description,
        icon: b.icon,
        rarity: b.rarity,
        rarityOrder: b.rarityOrder,
        grantedBy: b.grantedBy,
        stackable: b.stackable,
      },
      create: {
        slug: b.slug,
        name: b.name,
        description: b.description,
        icon: b.icon,
        rarity: b.rarity,
        rarityOrder: b.rarityOrder,
        grantedBy: b.grantedBy,
        stackable: b.stackable,
      },
    });
  }
}
