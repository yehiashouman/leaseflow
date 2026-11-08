-- AlterTable
ALTER TABLE `LeasingManagerProfile` ADD COLUMN `licenseIssuedAt` DATETIME(3) NULL,
    ADD COLUMN `pendingPhone` VARCHAR(40) NULL,
    ADD COLUMN `submittedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `AccountToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('EMAIL_VERIFY', 'PASSWORD_RESET') NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AccountToken_tokenHash_key`(`tokenHash`),
    INDEX `AccountToken_userId_type_createdAt_idx`(`userId`, `type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountConsent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `version` VARCHAR(80) NOT NULL,
    `textHash` VARCHAR(64) NOT NULL,
    `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sessionId` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `AccountConsent_userId_version_key`(`userId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(150) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `resendCount` INTEGER NOT NULL DEFAULT 0,
    `lastSentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TenantInvitation_tokenHash_key`(`tokenHash`),
    INDEX `TenantInvitation_managerId_email_createdAt_idx`(`managerId`, `email`, `createdAt`),
    UNIQUE INDEX `TenantInvitation_managerId_clientId_key`(`managerId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboundEmail` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `template` VARCHAR(80) NOT NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `encryptedPayload` TEXT NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseToken` VARCHAR(191) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `failureCode` VARCHAR(80) NULL,
    `providerId` VARCHAR(191) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OutboundEmail_status_nextAttemptAt_createdAt_idx`(`status`, `nextAttemptAt`, `createdAt`),
    INDEX `OutboundEmail_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PhoneChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(40) NOT NULL,
    `providerId` VARCHAR(191) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `sends` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastSentAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `leaseToken` VARCHAR(191) NULL,

    UNIQUE INDEX `PhoneChallenge_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AccountToken` ADD CONSTRAINT `AccountToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountConsent` ADD CONSTRAINT `AccountConsent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantInvitation` ADD CONSTRAINT `TenantInvitation_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `LeasingManagerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutboundEmail` ADD CONSTRAINT `OutboundEmail_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PhoneChallenge` ADD CONSTRAINT `PhoneChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

