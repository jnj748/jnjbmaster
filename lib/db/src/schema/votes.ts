import { pgTable, text, serial, integer, timestamp, date, unique } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";

export const votesTable = pgTable("votes", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  voterType: text("voter_type", { enum: ["owner", "tenant", "all"] }).notNull(),
  status: text("status", { enum: ["draft", "active", "closed"] }).notNull().default("draft"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalEligible: integer("total_eligible").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voteBallotsTable = pgTable("vote_ballots", {
  id: serial("id").primaryKey(),
  voteId: integer("vote_id").notNull().references(() => votesTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  unitNumber: text("unit_number").notNull(),
  voterName: text("voter_name").notNull(),
  choice: text("choice", { enum: ["for", "against", "abstain"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("vote_ballots_vote_unit").on(table.voteId, table.unitNumber),
]);
