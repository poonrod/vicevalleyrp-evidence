-- Developer panel: audit trail, feature flags, upload failures, evidence/incident metadata.

CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `discordId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `payload` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    INDEX `audit_logs_discordId_idx`(`discordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `system_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `system_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `failed_upload_logs` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `officerDiscordId` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `failed_upload_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `evidence_flags` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `flagKey` VARCHAR(191) NOT NULL,
    `flagValue` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `evidence_flags_evidenceId_flagKey_key`(`evidenceId`, `flagKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `evidence_flags` ADD CONSTRAINT `evidence_flags_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `EvidenceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `incident_links` (
    `id` VARCHAR(191) NOT NULL,
    `incidentBusinessId` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NULL,
    `linkType` VARCHAR(64) NOT NULL DEFAULT 'reference',
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `incident_links_incidentBusinessId_idx`(`incidentBusinessId`),
    INDEX `incident_links_evidenceId_idx`(`evidenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `incident_links` ADD CONSTRAINT `incident_links_incidentBusinessId_fkey` FOREIGN KEY (`incidentBusinessId`) REFERENCES `Incident`(`incidentId`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `incident_links` ADD CONSTRAINT `incident_links_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `EvidenceItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
