ALTER TABLE `Expense` ADD COLUMN `paidOn` DATE NULL,
  ADD INDEX `Expense_managerId_paidOn_idx` (`managerId`, `paidOn`);
