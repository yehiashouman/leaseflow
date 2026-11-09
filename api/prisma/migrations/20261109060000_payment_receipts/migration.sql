CREATE TABLE `PaymentReceipt` (
  `id` VARCHAR(191) NOT NULL,
  `paymentId` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL,
  `paidAt` DATETIME(3) NOT NULL,
  `method` VARCHAR(50) NOT NULL,
  `reference` VARCHAR(150) NULL,
  `recordedBalance` DECIMAL(12,2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PaymentReceipt_actorUserId_clientId_key` (`actorUserId`, `clientId`),
  INDEX `PaymentReceipt_paymentId_createdAt_id_idx` (`paymentId`, `createdAt`, `id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PaymentReceipt_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PaymentReceipt_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
