import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq, and } from "drizzle-orm";

// Set env before imports that initialize DB
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/orbit_test";

const TEST_USER_ID = "test-rel-" + Date.now();

// Mock auth middleware BEFORE importing the router
mock.module("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("userId", TEST_USER_ID);
    c.set("user", { id: TEST_USER_ID, email: "test@test.com" });
    await next();
  },
}));

// Dynamic imports after env + mock setup
let db: typeof import("../db").db;
let relationshipTypes: typeof import("../db").relationshipTypes;
let relationships: typeof import("../db").relationships;
let contacts: typeof import("../db").contacts;
let users: typeof import("../db").users;
let testApp: any;

beforeAll(async () => {
  const dbModule = await import("../db");
  db = dbModule.db;
  relationshipTypes = dbModule.relationshipTypes;
  relationships = dbModule.relationships;
  contacts = dbModule.contacts;
  users = dbModule.users;

  // Create test user to satisfy FK constraints
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: `test-${Date.now()}@relationships-test.com`,
  }).onConflictDoNothing();

  // Import router (will use mocked auth)
  const { Hono } = await import("hono");
  const routerModule = await import("./relationships");

  testApp = new Hono();
  testApp.route("/", routerModule.default);
});

afterAll(async () => {
  // Clean up in correct order (FK constraints)
  await db.delete(relationships).where(eq(relationships.userId, TEST_USER_ID));
  await db.delete(relationshipTypes).where(eq(relationshipTypes.userId, TEST_USER_ID));
  await db.delete(contacts).where(eq(contacts.userId, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

async function req(path: string, options?: RequestInit) {
  return testApp.request(`http://localhost${path}`, options);
}

// ============================================
// Seed Endpoint
// ============================================

describe("POST /types/seed", () => {
  afterEach(async () => {
    await db.delete(relationshipTypes).where(eq(relationshipTypes.userId, TEST_USER_ID));
  });

  it("seeds default relationship types for a new user", async () => {
    const res = await req("/types/seed", { method: "POST" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.seeded).toBeGreaterThanOrEqual(27);
    expect(body.existing).toBe(0);

    // Verify in DB
    const types = await db
      .select()
      .from(relationshipTypes)
      .where(and(eq(relationshipTypes.userId, TEST_USER_ID), eq(relationshipTypes.isSystem, true)));

    expect(types.length).toBeGreaterThanOrEqual(27);
  });

  it("is idempotent - returns existing count on second call", async () => {
    const res1 = await req("/types/seed", { method: "POST" });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await req("/types/seed", { method: "POST" });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.seeded).toBe(0);
    expect(body2.existing).toBe(body1.seeded);
  });

  it("creates proper reverse type linkage", async () => {
    await req("/types/seed", { method: "POST" });

    const types = await db
      .select()
      .from(relationshipTypes)
      .where(eq(relationshipTypes.userId, TEST_USER_ID));
    const byName = new Map(types.map((t) => [t.name, t]));

    // Husband <-> Wife
    const husband = byName.get("Husband")!;
    const wife = byName.get("Wife")!;
    expect(husband.reverseTypeId).toBe(wife.id);
    expect(wife.reverseTypeId).toBe(husband.id);

    // Mentor <-> Mentee
    expect(byName.get("Mentor")!.reverseTypeId).toBe(byName.get("Mentee")!.id);
    expect(byName.get("Mentee")!.reverseTypeId).toBe(byName.get("Mentor")!.id);

    // Employer <-> Employee
    expect(byName.get("Employer")!.reverseTypeId).toBe(byName.get("Employee")!.id);

    // Symmetric types link to themselves
    const friend = byName.get("Friend")!;
    expect(friend.isSymmetric).toBe(true);
    expect(friend.reverseTypeId).toBe(friend.id);

    const colleague = byName.get("Colleague")!;
    expect(colleague.isSymmetric).toBe(true);
    expect(colleague.reverseTypeId).toBe(colleague.id);

    const neighbor = byName.get("Neighbor")!;
    expect(neighbor.isSymmetric).toBe(true);
    expect(neighbor.reverseTypeId).toBe(neighbor.id);
  });

  it("creates proper gender-aware reverse linkage", async () => {
    await req("/types/seed", { method: "POST" });

    const types = await db
      .select()
      .from(relationshipTypes)
      .where(eq(relationshipTypes.userId, TEST_USER_ID));
    const byName = new Map(types.map((t) => [t.name, t]));

    // Father -> male=Son, female=Daughter
    const father = byName.get("Father")!;
    expect(father.maleReverseTypeId).toBe(byName.get("Son")!.id);
    expect(father.femaleReverseTypeId).toBe(byName.get("Daughter")!.id);

    // Mother -> male=Son, female=Daughter
    const mother = byName.get("Mother")!;
    expect(mother.maleReverseTypeId).toBe(byName.get("Son")!.id);
    expect(mother.femaleReverseTypeId).toBe(byName.get("Daughter")!.id);

    // Uncle -> male=Nephew, female=Niece
    const uncle = byName.get("Uncle")!;
    expect(uncle.maleReverseTypeId).toBe(byName.get("Nephew")!.id);
    expect(uncle.femaleReverseTypeId).toBe(byName.get("Niece")!.id);

    // Grandfather -> male=Grandson, female=Granddaughter
    const grandfather = byName.get("Grandfather")!;
    expect(grandfather.maleReverseTypeId).toBe(byName.get("Grandson")!.id);
    expect(grandfather.femaleReverseTypeId).toBe(byName.get("Granddaughter")!.id);

    // Son -> male=Father, female=Mother
    const son = byName.get("Son")!;
    expect(son.maleReverseTypeId).toBe(byName.get("Father")!.id);
    expect(son.femaleReverseTypeId).toBe(byName.get("Mother")!.id);
  });
});

// ============================================
// Relationship Types CRUD
// ============================================

describe("Relationship Types CRUD", () => {
  afterEach(async () => {
    await db.delete(relationshipTypes).where(eq(relationshipTypes.userId, TEST_USER_ID));
  });

  it("GET /types - lists all types for user", async () => {
    await db.insert(relationshipTypes).values({
      userId: TEST_USER_ID,
      name: "TestType",
      isSymmetric: false,
      isSystem: false,
    });

    const res = await req("/types");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.types.length).toBe(1);
    expect(body.types[0].name).toBe("TestType");
  });

  it("POST /types - creates a new type", async () => {
    const res = await req("/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CustomType", isSymmetric: true }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("CustomType");
    expect(body.isSymmetric).toBe(true);
    expect(body.isSystem).toBe(false);
  });

  it("POST /types - rejects duplicate name", async () => {
    await db.insert(relationshipTypes).values({
      userId: TEST_USER_ID,
      name: "Duplicate",
      isSymmetric: false,
      isSystem: false,
    });

    const res = await req("/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Duplicate" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /types/:id - updates a custom type", async () => {
    const [created] = await db
      .insert(relationshipTypes)
      .values({ userId: TEST_USER_ID, name: "OldName", isSymmetric: false, isSystem: false })
      .returning();

    const res = await req(`/types/${created!.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "NewName" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("NewName");
  });

  it("PUT /types/:id - blocks modifying system types", async () => {
    const [created] = await db
      .insert(relationshipTypes)
      .values({ userId: TEST_USER_ID, name: "SysType", isSymmetric: false, isSystem: true })
      .returning();

    const res = await req(`/types/${created!.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /types/:id - deletes a custom type", async () => {
    const [created] = await db
      .insert(relationshipTypes)
      .values({ userId: TEST_USER_ID, name: "ToDelete", isSymmetric: false, isSystem: false })
      .returning();

    const res = await req(`/types/${created!.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const remaining = await db.select().from(relationshipTypes).where(eq(relationshipTypes.id, created!.id));
    expect(remaining.length).toBe(0);
  });

  it("DELETE /types/:id - blocks deleting system types", async () => {
    const [created] = await db
      .insert(relationshipTypes)
      .values({ userId: TEST_USER_ID, name: "SysNoDelete", isSymmetric: false, isSystem: true })
      .returning();

    const res = await req(`/types/${created!.id}`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });
});

// ============================================
// Relationships CRUD
// ============================================

describe("Relationships CRUD", () => {
  let contactA: { id: string };
  let contactB: { id: string };
  let relType: { id: string };

  beforeEach(async () => {
    const [a] = await db
      .insert(contacts)
      .values({ userId: TEST_USER_ID, displayName: "Alice Test" })
      .returning({ id: contacts.id });
    contactA = a!;

    const [b] = await db
      .insert(contacts)
      .values({ userId: TEST_USER_ID, displayName: "Bob Test" })
      .returning({ id: contacts.id });
    contactB = b!;

    const [rt] = await db
      .insert(relationshipTypes)
      .values({ userId: TEST_USER_ID, name: "TestRelType-" + Date.now(), isSymmetric: false, isSystem: false })
      .returning({ id: relationshipTypes.id });
    relType = rt!;
  });

  afterEach(async () => {
    await db.delete(relationships).where(eq(relationships.userId, TEST_USER_ID));
    await db.delete(relationshipTypes).where(eq(relationshipTypes.userId, TEST_USER_ID));
    await db.delete(contacts).where(eq(contacts.userId, TEST_USER_ID));
  });

  it("POST / - creates a relationship", async () => {
    const res = await req("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromContactId: contactA.id,
        toContactId: contactB.id,
        typeId: relType.id,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fromContactId).toBe(contactA.id);
    expect(body.toContactId).toBe(contactB.id);
    expect(body.typeId).toBe(relType.id);
  });

  it("POST / - rejects duplicate relationship", async () => {
    await db.insert(relationships).values({
      userId: TEST_USER_ID,
      fromContactId: contactA.id,
      toContactId: contactB.id,
      typeId: relType.id,
    });

    const res = await req("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromContactId: contactA.id,
        toContactId: contactB.id,
        typeId: relType.id,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("GET / - lists relationships filtered by contactId", async () => {
    await db.insert(relationships).values({
      userId: TEST_USER_ID,
      fromContactId: contactA.id,
      toContactId: contactB.id,
      typeId: relType.id,
    });

    const res = await req(`/?contactId=${contactA.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.relationships.length).toBe(1);
    expect(body.relationships[0].fromContact.displayName).toBe("Alice Test");
    expect(body.relationships[0].toContact.displayName).toBe("Bob Test");
  });

  it("GET / - returns enriched data with type info", async () => {
    await db.insert(relationships).values({
      userId: TEST_USER_ID,
      fromContactId: contactA.id,
      toContactId: contactB.id,
      typeId: relType.id,
    });

    const res = await req("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    const rel = body.relationships[0];
    expect(rel.fromContact).toBeTruthy();
    expect(rel.toContact).toBeTruthy();
    expect(rel.type).toBeTruthy();
  });

  it("PUT /:id - updates relationship notes", async () => {
    const [created] = await db
      .insert(relationships)
      .values({
        userId: TEST_USER_ID,
        fromContactId: contactA.id,
        toContactId: contactB.id,
        typeId: relType.id,
      })
      .returning();

    const res = await req(`/${created!.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Updated notes" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("Updated notes");
  });

  it("DELETE /:id - deletes a relationship", async () => {
    const [created] = await db
      .insert(relationships)
      .values({
        userId: TEST_USER_ID,
        fromContactId: contactA.id,
        toContactId: contactB.id,
        typeId: relType.id,
      })
      .returning();

    const res = await req(`/${created!.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const remaining = await db.select().from(relationships).where(eq(relationships.id, created!.id));
    expect(remaining.length).toBe(0);
  });

  it("GET / - includes contact as both from and to in contactId filter", async () => {
    // Alice -> Bob
    await db.insert(relationships).values({
      userId: TEST_USER_ID,
      fromContactId: contactA.id,
      toContactId: contactB.id,
      typeId: relType.id,
    });

    // Query from Bob's perspective (he's the toContact)
    const res = await req(`/?contactId=${contactB.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.relationships.length).toBe(1);
  });
});
