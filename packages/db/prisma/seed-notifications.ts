/**
 * Seeds notifications for the existing user/tenant/projects.
 * Run after seed-projects.ts: bun packages/db/prisma/seed-notifications.ts
 */
import { db } from "../src/index";

const NOTIFICATION_TYPES = [
  "review_completed",
  "high_risk_detected",
  "source_linked",
  "source_archived",
  "summary_updated",
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

interface NotificationSeed {
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string | null;
  projectId: string | null;
  read: boolean;
  /** Hours ago this notification was created */
  hoursAgo: number;
}

const NOTIFICATIONS: NotificationSeed[] = [
  // Critical / high-risk notifications (unread)
  {
    type: "high_risk_detected",
    title: "High risk detected",
    body: "A critical severity issue was identified in 'Payment Service Redesign'",
    linkUrl: "/reviews",
    projectId: "proj_payment_service",
    read: false,
    hoursAgo: 0.5,
  },
  {
    type: "high_risk_detected",
    title: "High risk detected",
    body: "A high severity issue was identified in 'User Authentication Overhaul'",
    linkUrl: "/reviews",
    projectId: "proj_auth_overhaul",
    read: false,
    hoursAgo: 2,
  },

  // Review completed notifications (mix of read/unread)
  {
    type: "review_completed",
    title: "Security review completed",
    body: "Review for 'Payment Service Redesign' found 4 finding(s)",
    linkUrl: "/reviews",
    projectId: "proj_payment_service",
    read: false,
    hoursAgo: 1,
  },
  {
    type: "review_completed",
    title: "Security review completed",
    body: "Review for 'User Authentication Overhaul' found 3 finding(s)",
    linkUrl: "/reviews",
    projectId: "proj_auth_overhaul",
    read: false,
    hoursAgo: 3,
  },
  {
    type: "review_completed",
    title: "Security review completed",
    body: "Review for 'Notion Integration v2' found 2 finding(s)",
    linkUrl: "/reviews",
    projectId: "proj_notion_v2",
    read: true,
    hoursAgo: 8,
  },
  {
    type: "review_completed",
    title: "Security review completed",
    body: "Review for 'API Rate Limiting & Abuse Prevention' found 3 finding(s)",
    linkUrl: "/reviews",
    projectId: "proj_rate_limiting",
    read: true,
    hoursAgo: 18,
  },

  // Source linked notifications
  {
    type: "source_linked",
    title: "Source linked",
    body: "A Linear issue was linked to 'Payment Service Redesign'",
    linkUrl: "/projects",
    projectId: "proj_payment_service",
    read: false,
    hoursAgo: 4,
  },
  {
    type: "source_linked",
    title: "Source linked",
    body: "A Notion page was linked to 'User Authentication Overhaul'",
    linkUrl: "/projects",
    projectId: "proj_auth_overhaul",
    read: true,
    hoursAgo: 12,
  },
  {
    type: "source_linked",
    title: "Source linked",
    body: "A Linear issue was linked to 'API Rate Limiting & Abuse Prevention'",
    linkUrl: "/projects",
    projectId: "proj_rate_limiting",
    read: true,
    hoursAgo: 26,
  },

  // Source archived notifications
  {
    type: "source_archived",
    title: "Source archived",
    body: "A Notion page was archived from 'Internal Admin Dashboard'",
    linkUrl: "/projects",
    projectId: "proj_admin_dashboard",
    read: true,
    hoursAgo: 36,
  },

  // Summary updated notifications
  {
    type: "summary_updated",
    title: "Project summary updated",
    body: "'Payment Service Redesign' summary has been regenerated",
    linkUrl: "/projects",
    projectId: "proj_payment_service",
    read: false,
    hoursAgo: 5,
  },
  {
    type: "summary_updated",
    title: "Project summary updated",
    body: "'Notion Integration v2' summary has been regenerated",
    linkUrl: "/projects",
    projectId: "proj_notion_v2",
    read: true,
    hoursAgo: 14,
  },
  {
    type: "summary_updated",
    title: "Project summary updated",
    body: "'User Authentication Overhaul' summary has been regenerated",
    linkUrl: "/projects",
    projectId: "proj_auth_overhaul",
    read: true,
    hoursAgo: 48,
  },

  // Older read notifications for history
  {
    type: "review_completed",
    title: "Security review completed",
    body: "Review for 'Internal Admin Dashboard' found 2 finding(s)",
    linkUrl: "/reviews",
    projectId: "proj_admin_dashboard",
    read: true,
    hoursAgo: 72,
  },
  {
    type: "high_risk_detected",
    title: "High risk detected",
    body: "A critical severity issue was identified in 'API Rate Limiting & Abuse Prevention'",
    linkUrl: "/reviews",
    projectId: "proj_rate_limiting",
    read: true,
    hoursAgo: 96,
  },
  {
    type: "source_linked",
    title: "Source linked",
    body: "A Linear issue was linked to 'Notion Integration v2'",
    linkUrl: "/projects",
    projectId: "proj_notion_v2",
    read: true,
    hoursAgo: 120,
  },
];

async function main() {
  console.log("=== Seeding Notifications ===\n");

  // Find the logged-in user (prefer the real user over the seed user)
  const user = await db.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, tenantId: true, email: true },
  });

  if (!user) {
    console.error("No user found. Run seed-projects.ts first.");
    process.exit(1);
  }

  console.log(`Seeding notifications for: ${user.email} (${user.id})`);

  // Delete existing notifications for clean re-seed
  const deleted = await db.notification.deleteMany({
    where: { userId: user.id },
  });
  console.log(`Deleted ${deleted.count} existing notifications`);

  // Create notifications
  const now = Date.now();
  let created = 0;

  for (const n of NOTIFICATIONS) {
    const createdAt = new Date(now - n.hoursAgo * 3_600_000);

    await db.notification.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        type: n.type,
        title: n.title,
        body: n.body,
        linkUrl: n.linkUrl,
        projectId: n.projectId,
        sourceEventId: `seed:${n.type}:${n.projectId ?? "none"}:${n.hoursAgo}`,
        readAt: n.read ? new Date(now - (n.hoursAgo - 0.5) * 3_600_000) : null,
        createdAt,
      },
    });
    created++;
  }

  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  console.log(`Created: ${created} notifications (${unread} unread)`);
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
