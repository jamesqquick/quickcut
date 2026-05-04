export type NotificationType =
  | "comment.created"
  | "comment.reply"
  | "script_comment.created"
  | "script_comment.reply";

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
    case "script_comment.created":
      return {
        title: `${actorName} left script feedback on "${videoTitle}"`,
        heading: "New script feedback",
      };
    case "script_comment.reply":
      return {
        title: `${actorName} replied to your script comment on "${videoTitle}"`,
        heading: "New reply on your script comment",
      };
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
  }
}
