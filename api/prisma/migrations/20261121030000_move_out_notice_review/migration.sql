ALTER TABLE `DepositEntry`
  ADD COLUMN `noticeRequestId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `DepositEntry_noticeRequestId_key` (`noticeRequestId`),
  ADD CONSTRAINT `DepositEntry_noticeRequestId_fkey` FOREIGN KEY (`noticeRequestId`) REFERENCES `Request` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
