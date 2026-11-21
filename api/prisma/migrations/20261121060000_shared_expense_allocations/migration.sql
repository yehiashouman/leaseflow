ALTER TABLE `Expense` ADD COLUMN `sharedPeriod` DATE NULL;

CREATE TABLE `ExpenseSharedAllocation` (
  `expenseId` VARCHAR(191) NOT NULL,
  `rentalSpaceId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (`expenseId`, `rentalSpaceId`),
  INDEX `ExpenseSharedAllocation_rentalSpaceId_idx` (`rentalSpaceId`),
  CONSTRAINT `ExpenseSharedAllocation_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ExpenseSharedAllocation_rentalSpaceId_fkey` FOREIGN KEY (`rentalSpaceId`) REFERENCES `RentalSpace` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
