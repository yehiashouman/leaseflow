CREATE TABLE RequestCategory (
  id VARCHAR(191) NOT NULL,
  type ENUM('MAINTENANCE', 'NEIGHBOR_COMPLAINT', 'LATE_PAYMENT', 'ROOM_CHANGE', 'MOVE_OUT', 'KEY_LOCK_CHANGE', 'GENERAL') NOT NULL,
  name VARCHAR(100) NOT NULL,
  prompt VARCHAR(200) NULL,
  answerRequired BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE INDEX RequestCategory_type_name_key (type, name),
  INDEX RequestCategory_active_type_name_idx (active, type, name),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
