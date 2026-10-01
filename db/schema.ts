import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const lessonMaterials = sqliteTable("lesson_materials", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("lesson_materials_status_updated_idx").on(table.status, table.updatedAt)]);
