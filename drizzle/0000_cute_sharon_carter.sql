CREATE TABLE `user_progress` (
	`user_key` text PRIMARY KEY NOT NULL,
	`wrong_ids` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
