import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  role: text("role", { enum: ["candidate", "recruiter"] }).notNull().default("candidate"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, table => [uniqueIndex("idx_app_users_email").on(table.email)]);

export const candidateProfiles = sqliteTable("candidate_profiles", {
  userId: text("user_id").primaryKey().references(() => appUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  country: text("country").notNull().default(""),
  profession: text("profession").notNull().default(""),
  experience: text("experience").notNull().default(""),
  germanLevel: text("german_level").notNull().default(""),
  preferredLanguage: text("preferred_language", { enum: ["en", "de", "ar"] }).notNull().default("en"),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
