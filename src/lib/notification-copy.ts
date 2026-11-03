export type NotificationType =
  | "comment.created"
  | "comment.reply"
  | "approval.requested";

export interface NotificationCopy {
  title: string;
  heading: string;
}

export function getNotificationCopy(
  type: NotificationType,
  actorName: string,
  videoTitle: string,
): NotificationCopy {
  switch (type) {
    case "comment.reply":
      return {
        title: `${actorName} replied to your comment on "${videoTitle}"`,
        heading: "New reply on your comment",
      };
    case "comment.created":
      return {
        title: `${actorName} commented on "${videoTitle}"`,
        heading: "New comment on your video",
      };
    case "approval.requested":
      return {
        title: `${actorName} requested your approval on "${videoTitle}"`,
        heading: "Approval requested",
      };
  }
}
