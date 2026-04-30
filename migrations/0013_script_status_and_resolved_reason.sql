ALTER TABLE `scripts` ADD `status` text DEFAULT 'writing' NOT NULL;
ALTER TABLE `comments` ADD `resolved_reason` text;
