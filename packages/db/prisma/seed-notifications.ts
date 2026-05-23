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

// ─── Generate many notifications for infinite scroll testing ────────────────

const PROJECT_IDS = [
  "proj_payment_service",
  "proj_auth_overhaul",
  "proj_notion_v2",
  "proj_rate_limiting",
  "proj_admin_dashboard",
];

const PROJECT_NAMES: Record<string, string> = {
  proj_payment_service: "Payment Service Redesign",
  proj_auth_overhaul: "User Authentication Overhaul",
  proj_notion_v2: "Notion Integration v2",
  proj_rate_limiting: "API Rate Limiting & Abuse Prevention",
  proj_admin_dashboard: "Internal Admin Dashboard",
};

const SOURCES = ["Linear issue", "Notion page", "GitHub PR"];

function generateNotifications(): NotificationSeed[] {
  const notifications: NotificationSeed[] = [];
  let hoursAgo = 0.3;

  for (let i = 0; i < 500; i++) {
    const type = NOTIFICATION_TYPES[i % NOTIFICATION_TYPES.length];
    const projectId = PROJECT_IDS[i % PROJECT_IDS.length];
    const projectName = PROJECT_NAMES[projectId];
    const source = SOURCES[i % SOURCES.length];
    const read = i > 8; // first ~9 are unread

    let title: string;
    let body: string;
    let linkUrl: string;

    switch (type) {
      case "review_completed":
        title = "Security review completed";
        body = `Review for '${projectName}' found ${(i % 7) + 1} finding(s)`;
        linkUrl = "/reviews";
        break;
      case "high_risk_detected":
        title = "High risk detected";
        body = `A ${i % 2 === 0 ? "critical" : "high"} severity issue was identified in '${projectName}'`;
        linkUrl = "/reviews";
        break;
      case "source_linked":
        title = "Source linked";
        body = `A ${source} was linked to '${projectName}'`;
        linkUrl = "/projects";
        break;
      case "source_archived":
        title = "Source archived";
        body = `A ${source} was archived from '${projectName}'`;
        linkUrl = "/projects";
        break;
      case "summary_updated":
        title = "Project summary updated";
        body = `'${projectName}' summary has been regenerated with new findings`;
        linkUrl = "/projects";
        break;
    }

    notifications.push({
      type,
      title,
      body,
      linkUrl,
      projectId,
      read,
      hoursAgo,
    });

    // Increment time gap (accelerating into the past)
    hoursAgo += 0.5 + Math.random() * 2 + (i > 30 ? 3 : 0);
  }

  return notifications;
}

const NOTIFICATIONS: NotificationSeed[] = generateNotifications();

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
