CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'candidate' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_email` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `candidate_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`profession` text DEFAULT '' NOT NULL,
	`experience` text DEFAULT '' NOT NULL,
	`german_level` text DEFAULT '' NOT NULL,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade
);
