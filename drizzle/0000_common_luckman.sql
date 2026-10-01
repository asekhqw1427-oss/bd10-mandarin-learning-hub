CREATE TABLE `lesson_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lesson_materials_status_updated_idx` ON `lesson_materials` (`status`,`updated_at`);