-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `role` ENUM('ADMIN', 'LEASING_MANAGER', 'TENANT') NOT NULL,
    `status` ENUM('PENDING_EMAIL', 'PENDING_PHONE', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING_EMAIL',
    `preferredLanguage` VARCHAR(191) NOT NULL DEFAULT 'en',
    `notifyEmail` BOOLEAN NOT NULL DEFAULT true,
    `notifyWhatsapp` BOOLEAN NOT NULL DEFAULT true,
    `emailVerifiedAt` DATETIME(3) NULL,
    `phoneVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeasingManagerProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `nationality` VARCHAR(191) NULL,
    `emiratesIdNumber` VARCHAR(191) NULL,
    `emiratesIdExpiry` DATETIME(3) NULL,
    `licenseNumber` VARCHAR(191) NULL,
    `licenseType` VARCHAR(191) NULL,
    `licenseIssuer` VARCHAR(191) NULL,
    `licenseExpiry` DATETIME(3) NULL,
    `declarationAcceptedAt` DATETIME(3) NULL,

    UNIQUE INDEX `LeasingManagerProfile_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `nationality` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NULL,
    `emiratesIdNumber` VARCHAR(191) NULL,
    `emiratesIdExpiry` DATETIME(3) NULL,
    `matchingPreferences` JSON NULL,
    `lateRequestWindowDays` INTEGER NOT NULL DEFAULT 10,
    `maxLateExtensionDays` INTEGER NOT NULL DEFAULT 5,
    `defaultNoticeDays` INTEGER NOT NULL DEFAULT 30,

    UNIQUE INDEX `TenantProfile_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Landlord` (
    `id` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `whatsapp` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Landlord_managerId_idx`(`managerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Unit` (
    `id` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `landlordId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `building` VARCHAR(191) NULL,
    `street` VARCHAR(191) NULL,
    `area` VARCHAR(191) NOT NULL,
    `emirate` VARCHAR(191) NOT NULL DEFAULT 'Dubai',
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `ownerMonthlyRent` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AED',
    `defaultDeposit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `amenities` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `declarationAcceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Unit_managerId_active_idx`(`managerId`, `active`),
    INDEX `Unit_landlordId_idx`(`landlordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RentalSpace` (
    `id` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ROOM', 'MASTER_ROOM', 'BED_SPACE', 'PARTITION') NOT NULL,
    `status` ENUM('AVAILABLE', 'OCCUPIED', 'PARTIAL', 'MAINTENANCE', 'INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
    `capacity` INTEGER NOT NULL DEFAULT 1,
    `askingRent` DECIMAL(12, 2) NULL,
    `amenities` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RentalSpace_unitId_status_idx`(`unitId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contract` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `rentalSpaceId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `monthlyRent` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AED',
    `dueDay` INTEGER NOT NULL DEFAULT 1,
    `noticeDays` INTEGER NOT NULL DEFAULT 30,
    `depositAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `secondaryOccupant` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Contract_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `Contract_rentalSpaceId_status_idx`(`rentalSpaceId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractAmendment` (
    `id` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `effectiveDate` DATETIME(3) NOT NULL,
    `changes` JSON NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractReview` (
    `id` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `decision` VARCHAR(191) NULL,
    `notes` TEXT NULL,

    INDEX `ContractReview_dueAt_reviewedAt_idx`(`dueAt`, `reviewedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `amountDue` DECIMAL(12, 2) NOT NULL,
    `amountPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AED',
    `exchangeRateToAed` DECIMAL(18, 8) NULL,
    `paidAt` DATETIME(3) NULL,
    `method` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `evidenceKey` VARCHAR(191) NULL,
    `status` ENUM('UPCOMING', 'DUE', 'PARTIALLY_PAID', 'PAID', 'LATE', 'ADJUSTED', 'DISPUTED') NOT NULL DEFAULT 'UPCOMING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Payment_dueDate_status_idx`(`dueDate`, `status`),
    UNIQUE INDEX `Payment_contractId_periodStart_key`(`contractId`, `periodStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DepositEntry` (
    `id` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `type` ENUM('RECEIVED', 'DEDUCTION_PROPOSED', 'DEDUCTION_ACCEPTED', 'DEDUCTION_REJECTED', 'REFUND', 'ADJUSTMENT') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `description` VARCHAR(191) NULL,
    `evidenceKey` VARCHAR(191) NULL,
    `tenantAcceptedAt` DATETIME(3) NULL,
    `tenantDisputedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Request` (
    `id` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `type` ENUM('MAINTENANCE', 'NEIGHBOR_COMPLAINT', 'LATE_PAYMENT', 'ROOM_CHANGE', 'MOVE_OUT', 'KEY_LOCK_CHANGE', 'GENERAL') NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'SEEN', 'AWAITING_MANAGER', 'AWAITING_TENANT', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED', 'REOPENED', 'DEADLOCK', 'CLOSED') NOT NULL DEFAULT 'SUBMITTED',
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `metadata` JSON NULL,
    `decisionDueAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Request_contractId_status_idx`(`contractId`, `status`),
    INDEX `Request_decisionDueAt_status_idx`(`decisionDueAt`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RequestEvent` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL,
    `message` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RequestEvent_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NULL,
    `category` ENUM('OWNER_RENT', 'ELECTRICITY', 'WATER', 'COOLING', 'INTERNET', 'MAINTENANCE', 'CLEANING', 'FURNISHING', 'LICENSE_FEE', 'OTHER') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AED',
    `exchangeRateToAed` DECIMAL(18, 8) NULL,
    `incurredAt` DATETIME(3) NOT NULL,
    `description` VARCHAR(191) NULL,
    `evidenceKey` VARCHAR(191) NULL,

    INDEX `Expense_managerId_incurredAt_idx`(`managerId`, `incurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LeasingManagerProfile` ADD CONSTRAINT `LeasingManagerProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantProfile` ADD CONSTRAINT `TenantProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantProfile` ADD CONSTRAINT `TenantProfile_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `LeasingManagerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Landlord` ADD CONSTRAINT `Landlord_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `LeasingManagerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Unit` ADD CONSTRAINT `Unit_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `LeasingManagerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Unit` ADD CONSTRAINT `Unit_landlordId_fkey` FOREIGN KEY (`landlordId`) REFERENCES `Landlord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RentalSpace` ADD CONSTRAINT `RentalSpace_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `TenantProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_rentalSpaceId_fkey` FOREIGN KEY (`rentalSpaceId`) REFERENCES `RentalSpace`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractAmendment` ADD CONSTRAINT `ContractAmendment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractReview` ADD CONSTRAINT `ContractReview_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepositEntry` ADD CONSTRAINT `DepositEntry_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequestEvent` ADD CONSTRAINT `RequestEvent_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `Request`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `LeasingManagerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

