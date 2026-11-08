CREATE TABLE `AuthSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `ip` VARCHAR(191) NULL,
  `userAgent` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `AuthSession_userId_revokedAt_expiresAt_idx` (`userId`, `revokedAt`, `expiresAt`),
  CONSTRAINT `AuthSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RefreshToken` ADD COLUMN `sessionId` VARCHAR(191) NULL,
  ADD INDEX `RefreshToken_sessionId_idx` (`sessionId`),
  ADD CONSTRAINT `RefreshToken_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AuthSession` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy tokens lack a revocable session and require a fresh login.
UPDATE `RefreshToken` SET `revokedAt` = CURRENT_TIMESTAMP(3) WHERE `revokedAt` IS NULL;
