import { contactTools } from "./contacts";
import { tagTools } from "./tags";
import { conversationTools } from "./conversations";
import { eventTools } from "./events";
import { reminderTools } from "./reminders";
import { relationshipTools } from "./relationships";
import { helperTools } from "./helpers";
import { navigationTools } from "./navigation";

export function buildAllTools(ctx: { userId: string; timezone?: string }) {
  return {
    ...contactTools(ctx),
    ...tagTools(ctx),
    ...conversationTools(ctx),
    ...eventTools(ctx),
    ...reminderTools(ctx),
    ...relationshipTools(ctx),
    ...helperTools(ctx),
    ...navigationTools(ctx),
  };
}
