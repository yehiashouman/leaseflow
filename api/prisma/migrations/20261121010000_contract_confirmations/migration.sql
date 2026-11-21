ALTER TABLE `Contract` ADD COLUMN `offeredAt` DATETIME(3) NULL,
    ADD COLUMN `confirmedAt` DATETIME(3) NULL;
ALTER TABLE `ContractAmendment` ADD COLUMN `confirmedAt` DATETIME(3) NULL;
