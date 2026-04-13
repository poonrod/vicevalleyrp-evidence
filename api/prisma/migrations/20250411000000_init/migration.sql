-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `discordId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `globalRole` ENUM('super_admin', 'command_staff', 'evidence_tech', 'officer', 'viewer') NOT NULL DEFAULT 'viewer',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_discordId_key`(`discordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OfficerProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `officerName` VARCHAR(191) NULL,
    `badgeNumber` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `callsign` VARCHAR(191) NULL,
    `storageNamespace` VARCHAR(191) NOT NULL DEFAULT 'default',
    `preferredStorageBucket` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OfficerProfile_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalBodycamSetting` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sleepingMode` BOOLEAN NOT NULL DEFAULT false,
    `autoTaserEnabled` BOOLEAN NOT NULL DEFAULT true,
    `autoFirearmEnabled` BOOLEAN NOT NULL DEFAULT true,
    `soundEnabled` BOOLEAN NOT NULL DEFAULT true,
    `forceFirstPersonEnabled` BOOLEAN NOT NULL DEFAULT true,
    `lowStorageModeEnabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PersonalBodycamSetting_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Incident` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `caseNumber` VARCHAR(191) NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Incident_incidentId_key`(`incidentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceItem` (
    `id` VARCHAR(191) NOT NULL,
    `incidentBusinessId` VARCHAR(191) NULL,
    `evidenceGroupId` VARCHAR(191) NULL,
    `segmentIndex` INTEGER NULL,
    `caseNumber` VARCHAR(191) NULL,
    `type` ENUM('image', 'video', 'other') NOT NULL,
    `captureType` VARCHAR(191) NOT NULL,
    `videoTier` VARCHAR(191) NULL,
    `officerName` VARCHAR(191) NULL,
    `officerIdentifier` VARCHAR(191) NULL,
    `officerBadgeNumber` VARCHAR(191) NULL,
    `officerDepartment` VARCHAR(191) NULL,
    `officerCallsign` VARCHAR(191) NULL,
    `officerDiscordId` VARCHAR(191) NOT NULL,
    `playerServerId` INTEGER NULL,
    `gameLicenseIdentifier` VARCHAR(191) NULL,
    `timestampUtc` DATETIME(3) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `storageProvider` VARCHAR(191) NOT NULL DEFAULT 'r2',
    `storageBucket` VARCHAR(191) NOT NULL,
    `storageNamespace` VARCHAR(191) NOT NULL DEFAULT 'default',
    `storageKey` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `durationSeconds` DOUBLE NULL,
    `resolution` VARCHAR(191) NULL,
    `bitrateKbps` INTEGER NULL,
    `codec` VARCHAR(191) NULL,
    `sha256` VARCHAR(191) NULL,
    `locationX` DOUBLE NULL,
    `locationY` DOUBLE NULL,
    `locationZ` DOUBLE NULL,
    `heading` DOUBLE NULL,
    `streetName` VARCHAR(191) NULL,
    `weaponName` VARCHAR(191) NULL,
    `activationSource` VARCHAR(191) NULL,
    `wasAutoActivated` BOOLEAN NOT NULL DEFAULT false,
    `autoActivationReason` VARCHAR(191) NULL,
    `triggerDetectedAtUtc` DATETIME(3) NULL,
    `preEventEvidenceAttached` BOOLEAN NOT NULL DEFAULT false,
    `sleepingModeAtCapture` BOOLEAN NOT NULL DEFAULT false,
    `equippedStateAtCapture` BOOLEAN NOT NULL DEFAULT true,
    `soundPlayedOnActivation` BOOLEAN NOT NULL DEFAULT false,
    `retentionClass` VARCHAR(191) NOT NULL DEFAULT 'default',
    `retentionUntil` DATETIME(3) NULL,
    `scheduledDeletionAt` DATETIME(3) NULL,
    `legalHold` BOOLEAN NOT NULL DEFAULT false,
    `manualRetainUntil` DATETIME(3) NULL,
    `archiveStatus` ENUM('none', 'archived') NOT NULL DEFAULT 'none',
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedByUserId` VARCHAR(191) NULL,
    `deletionReason` VARCHAR(191) NULL,
    `softDeletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EvidenceItem_storageKey_key`(`storageKey`),
    INDEX `EvidenceItem_officerDiscordId_idx`(`officerDiscordId`),
    INDEX `EvidenceItem_caseNumber_idx`(`caseNumber`),
    INDEX `EvidenceItem_scheduledDeletionAt_idx`(`scheduledDeletionAt`),
    INDEX `EvidenceItem_incidentBusinessId_idx`(`incidentBusinessId`),
    INDEX `EvidenceItem_evidenceGroupId_idx`(`evidenceGroupId`),
    INDEX `EvidenceItem_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceTag` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `tag` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EvidenceTag_evidenceId_tag_key`(`evidenceId`, `tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceNote` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `authorUserId` VARCHAR(191) NOT NULL,
    `note` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChainOfCustodyEntry` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` TEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccessLog` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RetentionPolicySetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RetentionPolicySetting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OfficerProfile` ADD CONSTRAINT `OfficerProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalBodycamSetting` ADD CONSTRAINT `PersonalBodycamSetting_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Incident` ADD CONSTRAINT `Incident_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceItem` ADD CONSTRAINT `EvidenceItem_incidentBusinessId_fkey` FOREIGN KEY (`incidentBusinessId`) REFERENCES `Incident`(`incidentId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceTag` ADD CONSTRAINT `EvidenceTag_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `EvidenceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceNote` ADD CONSTRAINT `EvidenceNote_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `EvidenceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceNote` ADD CONSTRAINT `EvidenceNote_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChainOfCustodyEntry` ADD CONSTRAINT `ChainOfCustodyEntry_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `EvidenceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChainOfCustodyEntry` ADD CONSTRAINT `ChainOfCustodyEntry_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessLog` ADD CONSTRAINT `AccessLog_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `EvidenceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessLog` ADD CONSTRAINT `AccessLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RetentionPolicySetting` ADD CONSTRAINT `RetentionPolicySetting_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminAuditLog` ADD CONSTRAINT `AdminAuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

