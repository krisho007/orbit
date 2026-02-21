#!/usr/bin/env bun
/**
 * Seed script for Play Store screenshots.
 *
 * Populates realistic sample data for user kkammaje@gmail.com.
 * Run from apps/api:
 *   bun run scripts/seed-screenshots.ts
 */

import { db } from "../src/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  users,
  contacts,
  tags,
  contactTags,
  conversations,
  conversationParticipants,
  events,
  eventParticipants,
  reminders,
  reminderParticipants,
  assistantConversations,
  assistantMessages,
} from "../src/db/schema";

const EMAIL = "kkammaje@gmail.com";

// ─── Helpers ───────────────────────────────────────────────

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

function nextWeekday(dayOfWeek: number): Date {
  // 0=Sun, 1=Mon, ..., 5=Fri
  const d = new Date();
  const diff = (dayOfWeek - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(10, 0, 0, 0);
  return d;
}

function lastFriday(): Date {
  const d = new Date();
  const diff = (d.getDay() + 2) % 7; // days since last Friday
  d.setDate(d.getDate() - (diff === 0 ? 7 : diff));
  d.setHours(19, 0, 0, 0);
  return d;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding screenshot data...");

  // 1. Look up user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1);

  if (!user) {
    console.error(`❌ User ${EMAIL} not found in users table.`);
    process.exit(1);
  }
  const userId = user.id;
  console.log(`✅ Found user: ${userId}`);

  // 1b. Cleanup any existing seed data (makes script re-runnable)
  console.log("🧹 Cleaning up previous seed data...");
  const seedContactNames = [
    "Priya Sharma", "David Chen", "Sarah Mitchell", "Raj Patel",
    "Emma Thompson", "Michael Rodriguez", "Anika Gupta", "James Wilson",
    "Lisa Nakamura", "Dr. Anand Krishnamurthy",
  ];

  // Find existing seed contacts
  const existingContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .where(inArray(contacts.displayName, seedContactNames));

  if (existingContacts.length > 0) {
    const existingIds = existingContacts.map((c) => c.id);

    // Delete junction rows referencing these contacts
    await db.delete(contactTags).where(inArray(contactTags.contactId, existingIds));
    await db.delete(conversationParticipants).where(inArray(conversationParticipants.contactId, existingIds));
    await db.delete(eventParticipants).where(inArray(eventParticipants.contactId, existingIds));
    await db.delete(reminderParticipants).where(inArray(reminderParticipants.contactId, existingIds));

    // Delete conversations that only have these contacts as participants
    // (safer: delete conversations owned by userId that were seeded)
    // We'll delete all conversations for this user that match seed content patterns
    await db.delete(contacts).where(inArray(contacts.id, existingIds));
    console.log(`  Removed ${existingIds.length} previous seed contacts`);
  }

  // Clean up seed conversations (by content match)
  await db.execute(sql`
    DELETE FROM conversations
    WHERE "userId" = ${userId}
    AND "content" LIKE '%Q1 roadmap%'
    OR ("userId" = ${userId} AND "content" LIKE '%Partnership renewal%')
    OR ("userId" = ${userId} AND "content" LIKE '%Monthly mentorship%')
    OR ("userId" = ${userId} AND "content" LIKE '%hackathon%')
    OR ("userId" = ${userId} AND "content" LIKE '%Q4 campaign%')
    OR ("userId" = ${userId} AND "content" LIKE '%Design Week%')
    OR ("userId" = ${userId} AND "content" LIKE '%fintech collaboration%')
    OR ("userId" = ${userId} AND "content" LIKE '%60th birthday%')
    OR ("userId" = ${userId} AND "content" LIKE '%AI Research Summit%')
  `);

  // Clean up seed events
  await db.execute(sql`
    DELETE FROM events
    WHERE "userId" = ${userId}
    AND "title" IN ('Q1 Planning Sprint', 'Mom''s 60th Birthday', 'Bangalore Design Week',
      'Team Dinner', 'NovaTech Partnership Review', 'Morning Reflection')
  `);

  // Clean up seed reminders
  await db.execute(sql`
    DELETE FROM reminders
    WHERE "userId" = ${userId}
    AND "title" IN ('Send partnership proposal to David', 'Review Emma''s Q1 campaign brief',
      'Book flights for Mom''s birthday trip', 'Follow up with James on fintech collab',
      'Send thank-you note to Sarah', 'Confirm hackathon venue with Raj',
      'Call insurance agent about policy renewal')
  `);

  // Clean up assistant conversations
  await db.execute(sql`
    DELETE FROM assistant_messages
    WHERE "assistantConversationId" IN (
      SELECT id FROM assistant_conversations
      WHERE "userId" = ${userId} AND "title" = 'Log meeting with Dr. Anand Krishnamurthy'
    )
  `);
  await db.execute(sql`
    DELETE FROM assistant_conversations
    WHERE "userId" = ${userId} AND "title" = 'Log meeting with Dr. Anand Krishnamurthy'
  `);

  console.log("  Cleanup complete");

  // 2. Create tags
  console.log("📌 Creating tags...");
  const tagDefs = [
    { name: "Family", color: "#10B981" },
    { name: "Friend", color: "#3B82F6" },
    { name: "Work", color: "#F59E0B" },
    { name: "Client", color: "#8B5CF6" },
    { name: "Mentor", color: "#EC4899" },
  ];

  const insertedTags: Record<string, string> = {};
  for (const t of tagDefs) {
    const [row] = await db
      .insert(tags)
      .values({ userId, name: t.name, color: t.color })
      .onConflictDoNothing()
      .returning();
    if (row) {
      insertedTags[t.name] = row.id;
    } else {
      // Already exists, look it up
      const [existing] = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, userId))
        .where(eq(tags.name, t.name))
        .limit(1);
      if (existing) insertedTags[t.name] = existing.id;
    }
  }
  console.log(`  Created/found ${Object.keys(insertedTags).length} tags`);

  // 3. Create contacts
  console.log("👥 Creating contacts...");
  const contactDefs = [
    {
      displayName: "Priya Sharma",
      jobTitle: "Product Manager",
      company: "Flipkart",
      location: "Bangalore",
      primaryEmail: "priya.sharma@flipkart.com",
      primaryPhone: "+91 98765 43210",
      gender: "FEMALE" as const,
      tags: ["Work"],
    },
    {
      displayName: "David Chen",
      jobTitle: "CEO",
      company: "NovaTech Solutions",
      location: "Singapore",
      primaryEmail: "david@novatech.sg",
      primaryPhone: "+65 9123 4567",
      gender: "MALE" as const,
      tags: ["Client"],
    },
    {
      displayName: "Sarah Mitchell",
      jobTitle: "VP Engineering",
      company: "Stripe",
      location: "San Francisco",
      primaryEmail: "s.mitchell@stripe.com",
      gender: "FEMALE" as const,
      tags: ["Mentor"],
    },
    {
      displayName: "Raj Patel",
      jobTitle: "Senior Developer",
      company: "",
      location: "Bangalore",
      primaryEmail: "raj.patel@gmail.com",
      primaryPhone: "+91 98765 11111",
      gender: "MALE" as const,
      tags: ["Work", "Friend"],
    },
    {
      displayName: "Emma Thompson",
      jobTitle: "Marketing Director",
      company: "GrowthHQ",
      location: "London",
      primaryEmail: "emma@growthhq.co.uk",
      primaryPhone: "+44 7700 900123",
      gender: "FEMALE" as const,
      tags: ["Client"],
    },
    {
      displayName: "Michael Rodriguez",
      jobTitle: "Freelance UX Designer",
      company: "",
      location: "Barcelona",
      primaryEmail: "michael.rod@gmail.com",
      gender: "MALE" as const,
      tags: ["Friend"],
    },
    {
      displayName: "Anika Gupta",
      jobTitle: "Cardiologist",
      company: "Apollo Hospital",
      location: "Mumbai",
      primaryEmail: "anika.gupta@apollo.com",
      primaryPhone: "+91 99887 76655",
      dateOfBirth: new Date("1990-07-15"),
      gender: "FEMALE" as const,
      tags: ["Family"],
      notes: "Sister",
    },
    {
      displayName: "James Wilson",
      jobTitle: "CTO",
      company: "LaunchPad",
      location: "New York",
      primaryEmail: "james@launchpad.io",
      gender: "MALE" as const,
      tags: ["Work"],
    },
    {
      displayName: "Lisa Nakamura",
      jobTitle: "Data Scientist",
      company: "Google",
      location: "Tokyo",
      primaryEmail: "l.nakamura@google.com",
      gender: "FEMALE" as const,
      tags: ["Friend"],
    },
  ];

  const contactIds: Record<string, string> = {};
  for (const c of contactDefs) {
    const [row] = await db
      .insert(contacts)
      .values({
        userId,
        displayName: c.displayName,
        jobTitle: c.jobTitle,
        company: c.company || null,
        location: c.location,
        primaryEmail: c.primaryEmail || null,
        primaryPhone: c.primaryPhone || null,
        dateOfBirth: c.dateOfBirth || null,
        gender: c.gender,
        notes: c.notes || null,
      })
      .returning();
    contactIds[c.displayName] = row.id;

    // Add tags
    for (const tagName of c.tags) {
      const tagId = insertedTags[tagName];
      if (tagId) {
        await db
          .insert(contactTags)
          .values({ contactId: row.id, tagId })
          .onConflictDoNothing();
      }
    }
  }
  console.log(`  Created ${Object.keys(contactIds).length} contacts`);

  // 4. Create conversations
  console.log("💬 Creating conversations...");
  const convDefs = [
    {
      contact: "Priya Sharma",
      medium: "IN_PERSON_MEETING" as const,
      content: "Discussed Q1 roadmap priorities and resource allocation for the new payment gateway integration. Agreed to finalize sprint goals by end of week.",
      happenedAt: daysAgo(2),
    },
    {
      contact: "David Chen",
      medium: "PHONE_CALL" as const,
      content: "Partnership renewal discussion. David wants to expand scope to include Southeast Asian markets. Need to send updated proposal by Friday.",
      happenedAt: daysAgo(3),
    },
    {
      contact: "Sarah Mitchell",
      medium: "ONLINE_MEETING" as const,
      content: "Monthly mentorship call. Discussed leadership challenges with scaling engineering teams. Sarah recommended 'An Elegant Puzzle' by Will Larson.",
      happenedAt: daysAgo(7),
    },
    {
      contact: "Raj Patel",
      medium: "WHATSAPP" as const,
      content: "Planning weekend hackathon — Raj suggested building a real-time collaborative whiteboard using WebSockets. Need to book a venue and order pizza.",
      happenedAt: daysAgo(1),
    },
    {
      contact: "Emma Thompson",
      medium: "EMAIL" as const,
      content: "Emma shared Q4 campaign performance report. Impressive 40% increase in organic traffic. Discussing Q1 strategy focused on video content.",
      happenedAt: daysAgo(5),
    },
    {
      contact: "Michael Rodriguez",
      medium: "CHANCE_ENCOUNTER" as const,
      content: "Bumped into Michael at Bangalore Design Week. He showed his latest portfolio pieces — stunning healthcare app redesign. Exchanged notes on design systems.",
      happenedAt: daysAgo(4),
    },
    {
      contact: "James Wilson",
      medium: "ONLINE_MEETING" as const,
      content: "Explored fintech collaboration opportunities. James is building an embedded payments platform. Potential synergy with our API infrastructure.",
      happenedAt: daysAgo(7),
    },
    {
      contact: "Anika Gupta",
      medium: "WHATSAPP" as const,
      content: "Planning Mom's 60th birthday celebration. Anika is handling the guest list and venue. I'm in charge of the surprise video montage and cake.",
      happenedAt: daysAgo(3),
    },
  ];

  const convIds: Record<string, string> = {};
  for (const c of convDefs) {
    const [row] = await db
      .insert(conversations)
      .values({
        userId,
        medium: c.medium,
        content: c.content,
        happenedAt: c.happenedAt,
      })
      .returning();
    convIds[c.contact] = row.id;

    await db
      .insert(conversationParticipants)
      .values({
        conversationId: row.id,
        contactId: contactIds[c.contact],
      })
      .onConflictDoNothing();
  }
  console.log(`  Created ${Object.keys(convIds).length} conversations`);

  // 5. Create events
  console.log("📅 Creating events...");
  const tomorrow10am = daysFromNow(1);
  const tomorrow12pm = new Date(tomorrow10am);
  tomorrow12pm.setHours(12, 0, 0, 0);

  const march15 = new Date(new Date().getFullYear(), 2, 15, 10, 0, 0, 0); // March 15
  // If March 15 has passed this year, use next year
  if (march15 < new Date()) {
    march15.setFullYear(march15.getFullYear() + 1);
  }

  const lastFri = lastFriday();
  const lastFriEnd = new Date(lastFri);
  lastFriEnd.setHours(22, 0, 0, 0);

  const nextTues = nextWeekday(2); // Tuesday
  const nextTuesEnd = new Date(nextTues);
  nextTuesEnd.setHours(11, 0, 0, 0);

  const today9am = new Date();
  today9am.setHours(9, 0, 0, 0);

  const eventDefs = [
    {
      title: "Q1 Planning Sprint",
      eventType: "MEETING" as const,
      startAt: tomorrow10am,
      endAt: tomorrow12pm,
      location: "WeWork Koramangala",
      participants: ["Priya Sharma", "Raj Patel"],
    },
    {
      title: "Mom's 60th Birthday",
      eventType: "BIRTHDAY" as const,
      startAt: march15,
      endAt: null,
      location: null,
      participants: ["Anika Gupta"],
    },
    {
      title: "Bangalore Design Week",
      eventType: "CONFERENCE" as const,
      startAt: daysAgo(4),
      endAt: daysAgo(3),
      location: "Bangalore International Exhibition Centre",
      participants: ["Michael Rodriguez"],
    },
    {
      title: "Team Dinner",
      eventType: "SOCIAL" as const,
      startAt: lastFri,
      endAt: lastFriEnd,
      location: "Toit Brewpub",
      participants: ["Priya Sharma", "Raj Patel"],
    },
    {
      title: "NovaTech Partnership Review",
      eventType: "MEETING" as const,
      startAt: nextTues,
      endAt: nextTuesEnd,
      location: null,
      participants: ["David Chen", "Emma Thompson"],
    },
    {
      title: "Morning Reflection",
      eventType: "JOURNAL" as const,
      startAt: today9am,
      endAt: null,
      location: null,
      description: "Grateful for the progress on the fintech project. Need to prioritize health and sleep this week.",
      participants: [],
    },
  ];

  for (const e of eventDefs) {
    const [row] = await db
      .insert(events)
      .values({
        userId,
        title: e.title,
        eventType: e.eventType,
        startAt: e.startAt,
        endAt: e.endAt,
        location: e.location,
        description: (e as any).description || null,
      })
      .returning();

    for (const pName of e.participants) {
      await db
        .insert(eventParticipants)
        .values({
          eventId: row.id,
          contactId: contactIds[pName],
        })
        .onConflictDoNothing();
    }
  }
  console.log(`  Created ${eventDefs.length} events`);

  // 6. Create reminders
  console.log("🔔 Creating reminders...");
  const reminderDefs = [
    {
      title: "Send partnership proposal to David",
      status: "OPEN" as const,
      dueAt: daysFromNow(2),
      participants: ["David Chen"],
    },
    {
      title: "Review Emma's Q1 campaign brief",
      status: "OPEN" as const,
      dueAt: daysFromNow(1),
      participants: ["Emma Thompson"],
    },
    {
      title: "Book flights for Mom's birthday trip",
      status: "OPEN" as const,
      dueAt: daysFromNow(7),
      participants: ["Anika Gupta"],
    },
    {
      title: "Follow up with James on fintech collab",
      status: "OPEN" as const,
      dueAt: daysFromNow(5),
      participants: ["James Wilson"],
    },
    {
      title: "Send thank-you note to Sarah",
      status: "DONE" as const,
      dueAt: daysAgo(2),
      participants: ["Sarah Mitchell"],
    },
    {
      title: "Confirm hackathon venue with Raj",
      status: "DONE" as const,
      dueAt: daysAgo(1),
      participants: ["Raj Patel"],
    },
    {
      title: "Call insurance agent about policy renewal",
      status: "CANCELED" as const,
      dueAt: daysAgo(3),
      participants: [],
    },
  ];

  for (const r of reminderDefs) {
    const [row] = await db
      .insert(reminders)
      .values({
        userId,
        title: r.title,
        status: r.status,
        dueAt: r.dueAt,
      })
      .returning();

    for (const pName of r.participants) {
      await db
        .insert(reminderParticipants)
        .values({
          reminderId: row.id,
          contactId: contactIds[pName],
        })
        .onConflictDoNothing();
    }
  }
  console.log(`  Created ${reminderDefs.length} reminders`);

  // 7. Create assistant conversation (for screenshot)
  console.log("🤖 Creating assistant conversation...");

  // Create the actual contact that the assistant "created"
  const [drAnand] = await db
    .insert(contacts)
    .values({
      userId,
      displayName: "Dr. Anand Krishnamurthy",
      jobTitle: "Director of AI Research",
      company: "DeepMind",
      location: "London",
      primaryEmail: "a.krishnamurthy@deepmind.com",
      gender: "MALE",
    })
    .returning();

  // Create assistant conversation record
  const [asstConv] = await db
    .insert(assistantConversations)
    .values({
      userId,
      title: "Log meeting with Dr. Anand Krishnamurthy",
    })
    .returning();

  // Create the actual conversation record that was "logged"
  const [drAnandConv] = await db
    .insert(conversations)
    .values({
      userId,
      medium: "CHANCE_ENCOUNTER",
      content: "Met Dr. Anand Krishnamurthy at the AI Research Summit. He's the Director of AI Research at DeepMind in London. Had a fascinating discussion about generative AI transforming healthcare diagnostics. He mentioned potential collaboration opportunities.",
      happenedAt: new Date(), // today
      assistantConversationId: asstConv.id,
    })
    .returning();

  await db
    .insert(conversationParticipants)
    .values({
      conversationId: drAnandConv.id,
      contactId: drAnand.id,
    })
    .onConflictDoNothing();

  // Link the contact back to the assistant conversation
  await db
    .update(contacts)
    .set({ assistantConversationId: asstConv.id })
    .where(eq(contacts.id, drAnand.id));

  // Create the 4 assistant messages
  const now = new Date();
  const msg1Time = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const msg2Time = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
  const msg3Time = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
  const msg4Time = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

  // Use raw SQL for assistant_messages to avoid thumbsUp/thumbsDown columns
  // that exist in schema but haven't been migrated to production yet

  const confirmationUi = JSON.stringify({
    kind: "confirmation",
    action: "I'll create a new contact and log your conversation. Here's what I'll save:",
    details: {
      "Contact": "Dr. Anand Krishnamurthy",
      "Title": "Director of AI Research",
      "Company": "DeepMind",
      "Location": "London",
      "Met at": "AI Research Summit",
      "Medium": "In person",
      "Discussion": "Generative AI in healthcare diagnostics, potential collaboration",
    },
  });

  const createdUi = JSON.stringify({
    kind: "created",
    cards: [
      {
        kind: "contact",
        contact: {
          id: drAnand.id,
          displayName: "Dr. Anand Krishnamurthy",
          primaryPhone: null,
          primaryEmail: "a.krishnamurthy@deepmind.com",
          company: "DeepMind",
          jobTitle: "Director of AI Research",
          location: "London",
        },
      },
      {
        kind: "conversation",
        conversation: {
          id: drAnandConv.id,
          medium: "CHANCE_ENCOUNTER",
          happenedAt: new Date().toISOString(),
          content: "Met at AI Research Summit. Discussed generative AI transforming healthcare diagnostics. Mentioned potential collaboration opportunities.",
          participants: ["Dr. Anand Krishnamurthy"],
        },
      },
    ],
  });

  // Message 1: User request
  await db.execute(sql`
    INSERT INTO assistant_messages (id, "assistantConversationId", role, content, ui, "createdAt")
    VALUES (${crypto.randomUUID()}, ${asstConv.id}, 'user',
      ${"I just met Dr. Anand Krishnamurthy at the AI Research Summit today. He's the Director of AI Research at DeepMind in London. We had a fascinating discussion about generative AI transforming healthcare diagnostics. He mentioned potential collaboration opportunities. Can you log this?"},
      NULL, ${msg1Time})
  `);

  // Message 2: Assistant confirmation
  await db.execute(sql`
    INSERT INTO assistant_messages (id, "assistantConversationId", role, content, ui, "modelName", "inputTokens", "outputTokens", "createdAt")
    VALUES (${crypto.randomUUID()}, ${asstConv.id}, 'assistant',
      ${"I'll create a new contact and log your conversation. Here's what I'll save:\n\n**Contact:** Dr. Anand Krishnamurthy\n**Title:** Director of AI Research @ DeepMind\n**Location:** London\n**Met at:** AI Research Summit (today)\n**Discussion:** Generative AI in healthcare diagnostics, potential collaboration\n\nShall I go ahead?"},
      ${confirmationUi}, 'gemini-2.0-flash', 245, 89, ${msg2Time})
  `);

  // Message 3: User confirmation
  await db.execute(sql`
    INSERT INTO assistant_messages (id, "assistantConversationId", role, content, ui, "createdAt")
    VALUES (${crypto.randomUUID()}, ${asstConv.id}, 'user', 'Go ahead', NULL, ${msg3Time})
  `);

  // Message 4: Assistant done with created cards
  await db.execute(sql`
    INSERT INTO assistant_messages (id, "assistantConversationId", role, content, ui, "modelName", "inputTokens", "outputTokens", "createdAt")
    VALUES (${crypto.randomUUID()}, ${asstConv.id}, 'assistant',
      ${"Done! I've created the contact and logged your conversation."},
      ${createdUi}, 'gemini-2.0-flash', 312, 67, ${msg4Time})
  `);

  console.log("  Created assistant conversation with 4 messages");

  console.log("\n🎉 Seed complete! Data ready for screenshots.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
