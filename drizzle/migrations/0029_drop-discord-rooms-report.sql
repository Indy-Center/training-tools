-- The teacher rooms job's last report, which /admin showed. larry makes the
-- rooms now (decisions/0044), so nothing writes or reads it any more.
-- `teachers.discord_role_id` and `discord_channel_id` stay for now, unread,
-- so larry can be backed out.
DELETE FROM `sync_state` WHERE `key` = 'discord-teacher-rooms';
